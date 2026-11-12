"""Publish exact current results plus two frozen historical models; sources are read-only."""
import argparse
import concurrent.futures
import copy
import gzip
import hashlib
import json
import math
import sqlite3
import statistics
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SAFETY_ERROR = "API Error: 400 This request may violate the Claude model's safety policy and has been terminated early."
LATEST = {'gpt-6-astra', 'claude-opus-5-5', 'glm-5.3', 'qwen3.8-max', 'kimi-k3'}


def fetch(url):
    with urllib.request.urlopen(url, timeout=120) as response:
        return response.read()


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def score(speedup, ratio):
    assert math.isfinite(ratio) and ratio > 1
    if speedup is None or speedup == 0:
        return 0.0
    assert math.isfinite(speedup) and speedup > 0
    # Clamp before evaluating the reciprocal: beyond SOL its denominator can cross zero.
    if speedup >= ratio:
        return 1.0
    return 1 / (1 + (1 / speedup - 1 / ratio) / (1 - 1 / ratio))


def encoded(value):
    return (json.dumps(value, ensure_ascii=False, indent=2) + '\n').encode()


AGGREGATION = 'Claude: only tasks with formal rewards; other models: full suite. Verified zero rewards are included.'


def aggregate_rows(rows):
    for row in rows:
        tasks = row['tasks']
        included = [t for t in tasks if t['reward'] is not None] if row['display_name'] == 'claude-opus-5-5' else tasks
        count = len(included)
        row.update(scored=sum(t['reward'] is not None for t in tasks),
                   aggregation_task_count=count, partial_evaluation=count < len(tasks),
                   faster_count=sum(t['reward'] is not None and t['reward'] > 1.1 for t in included),
                   median_speedup=statistics.median(t['reward'] if t['reward'] is not None else 0 for t in included) if count else 0,
                   mean_sol_score=statistics.mean(t['sol_score'] for t in included) if count else 0)
        row['faster_rate_percent'] = row['faster_count'] / count * 100 if count else 0
        for status in ('running', 'pending', 'failed'):
            row[status] = sum(t['status'] == status for t in tasks)
    rows.sort(key=lambda r: (-r['faster_rate_percent'], -r['median_speedup'], r['model']))
    for rank, row in enumerate(rows, 1):
        row['rank'] = rank


def lite_models(rows, task_ids):
    models = []
    for row in rows:
        tasks = [t for t in row['tasks'] if t['task'] in task_ids]
        included = [t for t in tasks if t['reward'] is not None] if row['display_name'] == 'claude-opus-5-5' else tasks
        models.append(dict(model=row['model'], display_name=row['display_name'],
                           aggregation_task_count=len(included), partial_evaluation=len(included) < len(tasks),
                           mean_score=statistics.mean(t['sol_score'] for t in included) if included else 0,
                           tasks=[dict(task=t['task'], score=t['sol_score'], speedup=t['reward'], status=t['status']) for t in tasks]))
    return models


def refresh(api, database, evidence):
    raw = fetch(api + '/leaderboard')
    live = json.loads(raw)
    historical = json.loads((ROOT / 'data/historical-results.json').read_text())
    summary = json.loads((evidence / 'summary.json').read_text())
    latest = json.loads((evidence / 'latest-sb-20261112.json').read_text())
    refs = {}
    for r in summary['results']:
        refs[r['task']] = dict(task=r['task'], model=r['model'], hardware=r['hardware'], unit=r['unit'],
                               baseline=r['baseline_throughput'], sol=r['sol_throughput'], evidence_status='existing analytical reference')
    for category in ('formal_new_references', 'prefix_average_estimates'):
        for task, r in latest[category].items():
            refs[task].update(sol=r['sol'], baseline=r['baseline'], evidence_status=(
                'audited analytical reference' if category == 'formal_new_references' else 'prefix-average extrapolation'))
    for r in refs.values():
        r['sol_baseline_ratio'] = r['sol'] / r['baseline']
    assert len(refs) == 20
    db = sqlite3.connect(f'file:{database.resolve()}?mode=ro', uri=True)
    db.row_factory = sqlite3.Row
    db.execute('BEGIN')
    records = {r['id']: dict(r) for r in db.execute('SELECT * FROM tasks')}
    attempts = [dict(r) for r in db.execute('SELECT * FROM attempts ORDER BY id DESC')]
    db.close()
    rows = copy.deepcopy(historical['rows'])
    entries = copy.deepcopy(historical['trajectories'])
    selections, jobs, staged = [], [], {}
    for row in live['rows']:
        if row['display_name'] not in LATEST:
            continue
        result = {k: row[k] for k in ('model', 'display_name', 'agents', 'enabled')}
        result['tasks'] = []
        for cell in row['tasks']:
            excluded = row['display_name'] == 'claude-opus-5-5' and cell['status'] != 'completed'
            reward = None if excluded else cell['reward']
            status = 'not_tested' if excluded else cell['status']
            public_cell = dict(task=cell['task'], reward=reward, status=status)
            if excluded:
                public_cell['evaluation_note'] = SAFETY_ERROR
            result['tasks'].append(public_cell)
            entry = dict(model=row['model'], task=cell['task'], reward=reward, score_status=status,
                         run_status=cell['status'], source=dict(kind='task', id=cell['task_id'] or 0), available=False)
            entries.append(entry)
            if cell['task_id'] is None:
                assert excluded
                entry['reason'] = 'Not tested. ' + SAFETY_ERROR
                continue
            record = records[cell['task_id']]
            assert record['task'] == cell['task'] and json.loads(record['spec'])['model'] == row['model']
            assert (record['reward'], record['status']) == (cell['reward'], cell['status'])
            selected = next(a for a in attempts if a['task_id'] == record['id'] and a['result_path'] == record['result_path'])
            entry['source'] = dict(kind='attempt', id=selected['id'])
            raw_result = Path(selected['result_path']).read_bytes()
            native = json.loads(raw_result)
            native_reward = ((native.get('verifier_result') or {}).get('rewards') or {}).get('reward')
            if not excluded:
                assert native_reward == reward, (row['model'], cell['task'], native_reward, reward)
            selections.append(dict(model=row['model'], task=cell['task'], attempt_id=selected['id'],
                                   result_sha256=digest(raw_result), reward=reward, excluded=excluded))
            jobs.append(entry)
        if row['display_name'] == 'claude-opus-5-5':
            assert sum(t['reward'] is not None for t in result['tasks']) == 10
            result['evaluation_note'] = 'Only the 10 completed tasks are included. The other 10 tasks could not be tested: ' + SAFETY_ERROR
        rows.append(result)
    assert len(rows) == 7
    for row in rows:
        assert len(row['tasks']) == 20 and {t['task'] for t in row['tasks']} == set(refs)
        for cell in row['tasks']:
            cell['sol_score'] = score(cell['reward'], refs[cell['task']]['sol_baseline_ratio'])
    aggregate_rows(rows)

    def export_trace(entry):
        endpoint = f"{api}/trajectory/attempt/{entry['source']['id']}"
        trace = json.loads(fetch(endpoint))
        assert not trace['live'], 'Refusing a live trajectory'
        entry.update(source_attempt_ids=trace['source_attempt_ids'], live=False, modified_at=trace['modified_at'])
        if trace['trajectory'] is None:
            entry['reason'] = 'No ATIF trajectory was saved for this run.'
            return entry, None, None
        content = fetch(endpoint + '/trajectory.json')
        parsed = json.loads(content)
        assert isinstance(parsed['steps'], list)
        sha = digest(content)
        filename = sha + '.json.gz'
        entry.update(available=True, file=filename, sha256=sha, bytes=len(content), steps=len(parsed['steps']),
                     schema_version=parsed.get('schema_version'),
                     collection_warning=any((trace.get('diagnostics') or {}).get(k) for k in ('collection_errors', 'pending_sources', 'projection_issues')))
        return entry, filename, gzip.compress(content, mtime=0)

    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        for entry, filename, content in pool.map(export_trace, jobs):
            if filename:
                staged[filename] = content
    after = json.loads(fetch(api + '/leaderboard'))
    binding = lambda data: {(r['model'], t['task']): (t['task_id'], t['reward'], t['status'])
                            for r in data['rows'] if r['display_name'] in LATEST for t in r['tasks']}
    assert binding(live) == binding(after), 'Source changed during export'
    snapshot = dict(observed_at=datetime.now(timezone.utc).isoformat(), source='Selected experimental results',
                    source_sha256=digest(raw), suite_size=20, faster_threshold=1.1, rows=rows,
                    sol_reference_date='2026-11-12', aggregation=AGGREGATION)
    lite = json.loads((ROOT / 'data/lite-set.json').read_text())
    lite['as_of'] = '2026-11-12 Asia/Shanghai'
    lite['normalization'] = 'Runtime normalization: Oracle=0.5, SOL=1; capped at 1, missing reward=0.'
    lite['gap_score'] = '0 if missing or zero; 1 if speedup >= SOL_ratio; otherwise 1 / (1 + (1/speedup - 1/SOL_ratio) / (1 - 1/SOL_ratio))'
    for r in lite['rows']:
        ref = refs[r['task_id']]
        r.update(sol=ref['sol_baseline_ratio'], sol_throughput=ref['sol'], oracle_throughput=ref['baseline'])
    lite['models'] = lite_models(rows, lite['task_ids'])
    lite['aggregation'] = AGGREGATION
    # Deterministic table order also determines the first trajectory in browser tests.
    entries.sort(key=lambda e: (next(i for i, r in enumerate(rows) if r['model'] == e['model']), list(refs).index(e['task'])))
    manifest = dict(exported_at=snapshot['observed_at'], leaderboard_sha256=digest(encoded(snapshot)),
                    score_observed_at=snapshot['observed_at'], entries=entries)
    reference = dict(as_of='2026-11-12', rows=list(refs.values()), source_sha256={
        name: digest((evidence / name).read_bytes()) for name in ('summary.json', 'latest-sb-20261112.json', 'ALL-20-SOL-RESULTS-20261112.md')})
    for name, value in [('leaderboard', snapshot), ('lite-set', lite), ('sol-reference', reference)]:
        for directory in ('data', 'public/data'):
            (ROOT / directory / (name + '.json')).write_bytes(encoded(value))
    (ROOT / 'data/selected-results.json').write_bytes(encoded(selections))
    (ROOT / 'data/selected-trajectories.json').write_bytes(encoded([]))
    folder = ROOT / 'public/data/trajectories'
    for name, content in staged.items():
        (folder / name).write_bytes(content)
    (folder / 'index.json').write_bytes(encoded(manifest))
    print(json.dumps([dict(model=r['display_name'], scored=r['scored'], mean_sol_score=r['mean_sol_score']) for r in rows], indent=2))
    print(f"Exported {sum(e['available'] for e in entries)}/140 trajectories; {len(staged)} current artifacts")


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--api', default='http://127.0.0.1:10961/api')
    parser.add_argument('--database', type=Path, default=ROOT / 'kimi-glm-qwen-claude-1m-20261104/state/state.sqlite3')
    parser.add_argument('--sol-evidence', type=Path, default=Path('/opt/tiger/npu-fly/docs/evidence/full-sol-20261109'))
    args = parser.parse_args()
    refresh(args.api.rstrip('/'), args.database, args.sol_evidence)
