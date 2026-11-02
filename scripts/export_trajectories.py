"""Export exact ATIF artifacts for the existing score snapshot (read-only sources)."""
import argparse
import gzip
import hashlib
import json
import sqlite3
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def fetch(url):
    with urllib.request.urlopen(url, timeout=90) as response:
        return response.read()


def export(api, database):
    snapshot_bytes = (ROOT / 'data/leaderboard.json').read_bytes()
    scores = json.loads(snapshot_bytes)
    trajectory_selections = json.loads((ROOT / 'data/selected-trajectories.json').read_text())
    live = json.loads(fetch(api + '/leaderboard'))
    live_rows = {row['model']: row for row in live['rows']}
    db = sqlite3.connect(f'file:{Path(database).resolve()}?mode=ro', uri=True)
    db.row_factory = sqlite3.Row
    db.execute('BEGIN')
    tasks = {r['id']: dict(r) for r in db.execute('SELECT * FROM tasks')}
    attempts = [dict(r) for r in db.execute('SELECT * FROM attempts ORDER BY id DESC')]
    db.close()
    entries = []
    staged = {}
    for model in scores['rows']:
        source_tasks = {t['task']: t for t in live_rows[model['model']]['tasks']}
        for cell in model['tasks']:
            source = source_tasks[cell['task']]
            pin = next((p for p in scores.get('selected_results', []) if p['model'] == model['model'] and p['task'] == cell['task']), None)
            # A new reward requires refreshing the leaderboard first, never silently rebinding it.
            if not pin and source['reward'] != cell['reward']:
                raise ValueError(f"Score changed: {model['display_name']} / {cell['task']}; refresh scores first")
            record = tasks[source['task_id']]
            if record['task'] != cell['task'] or json.loads(record['spec']).get('model') != model['model']:
                raise ValueError('The state database does not match the API model/task identity')
            if record['reward'] != source['reward'] or record['status'] != source['status']:
                raise ValueError('Source changed during export; retry')
            candidates = [a for a in attempts if a['task_id'] == record['id']]
            if pin:
                selected = next(a for a in candidates if a['id'] == pin['attempt_id'])
                result_bytes = Path(selected['result_path']).read_bytes()
                if hashlib.sha256(result_bytes).hexdigest() != pin['result_sha256']:
                    raise ValueError('Selected result artifact changed')
                if json.loads(result_bytes)['verifier_result']['rewards']['reward'] != cell['reward']:
                    raise ValueError('Selected verifier reward does not match snapshot')
            elif record['result_path']:
                selected = next((a for a in candidates if a['result_path'] == record['result_path']), None)
                if selected is None and not record['imported']:
                    raise ValueError('Cannot bind score to an exact attempt')
            else:
                selected = candidates[0] if candidates else None
            trace_pin = next((p for p in trajectory_selections if p['model'] == model['model'] and p['task'] == cell['task']), None)
            if trace_pin:
                selected = next(a for a in attempts if a['id'] == trace_pin['attempt_id'])
                trace_task = tasks[selected['task_id']]
                if trace_task['task'] != cell['task'] or json.loads(trace_task['spec']).get('model', '').casefold() != model['model'].casefold():
                    raise ValueError('Selected trajectory does not match model/task identity')
                if cell['reward'] is not None:
                    raise ValueError('Trajectory-only selection must not replace a verified score source')
            kind, identity = ('attempt', selected['id']) if selected else ('task', record['id'])
            entry = dict(model=model['model'], task=cell['task'], reward=cell['reward'],
                         score_status=cell['status'], run_status=selected['status'] if pin or trace_pin else source['status'],
                         source=dict(kind=kind, id=identity), available=False)
            if not selected and not record['imported']:
                entry['reason'] = 'No Agent attempt has been recorded for this run.'
                entries.append(entry)
                continue
            endpoint = f'{api}/trajectory/{kind}/{identity}'
            trace = json.loads(fetch(endpoint))
            entry.update(source_attempt_ids=trace['source_attempt_ids'], live=trace['live'],
                         modified_at=trace['modified_at'])
            if trace['trajectory'] is None:
                entry['reason'] = 'No ATIF trajectory was saved for this run. This does not mean the Agent did not execute.'
                if 'opencode.txt' in trace['files']:
                    raw_log = fetch(endpoint + '/opencode.txt')
                    log_hash = hashlib.sha256(raw_log).hexdigest()
                    log_name = f'{log_hash}.txt.gz'
                    staged[log_name] = gzip.compress(raw_log, mtime=0)
                    entry.update(log_file=log_name, log_sha256=log_hash, log_bytes=len(raw_log))
            else:
                raw = fetch(endpoint + '/trajectory.json')
                parsed = json.loads(raw)
                if not isinstance(parsed.get('steps'), list):
                    raise ValueError('Invalid ATIF artifact')
                digest = hashlib.sha256(raw).hexdigest()
                filename = f'{digest}.json.gz'
                staged[filename] = gzip.compress(raw, mtime=0)
                entry.update(available=True, file=filename, sha256=digest, bytes=len(raw),
                             steps=len(parsed['steps']), schema_version=parsed.get('schema_version'))
                diagnostics = trace.get('diagnostics') or {}
                entry['collection_warning'] = any(diagnostics.get(k) for k in ('collection_errors', 'pending_sources', 'projection_issues'))
            entries.append(entry)
    # Validate the binding once more before publishing a manifest.
    after = json.loads(fetch(api + '/leaderboard'))
    before_cells = {(r['model'], t['task']): (t['task_id'], t['reward'], t['status']) for r in live['rows'] for t in r['tasks']}
    after_cells = {(r['model'], t['task']): (t['task_id'], t['reward'], t['status']) for r in after['rows'] for t in r['tasks']}
    if any(before_cells[e['model'], e['task']] != after_cells[e['model'], e['task']] for e in entries):
        raise ValueError('Source changed during export; retry')
    manifest = dict(exported_at=datetime.now(timezone.utc).isoformat(),
                    leaderboard_sha256=hashlib.sha256(snapshot_bytes).hexdigest(),
                    score_observed_at=scores['observed_at'], entries=entries)
    folder = ROOT / 'public/data/trajectories'
    folder.mkdir(parents=True, exist_ok=True)
    for name, content in staged.items():
        (folder / name).write_bytes(content)
    target = folder / 'index.json'
    temporary = target.with_suffix('.tmp')
    temporary.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    temporary.replace(target)
    print(f"Exported {sum(e['available'] for e in entries)} ATIF trajectories + {sum('log_file' in e for e in entries)} fallback logs / {len(entries)} cells; {sum(map(len, staged.values())) / 1e6:.1f} MB gzip")
    for e in entries:
        if not e['available']:
            print(f"Unavailable: {e['model']} / {e['task']}")


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--api', default='http://127.0.0.1:10952/api')
    parser.add_argument('--state-db', default='/opt/tiger/npu-fly/.agents/workdir/experiment-manager/state.sqlite3')
    args = parser.parse_args()
    export(args.api.rstrip('/'), args.state_db)
