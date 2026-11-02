"""Export a validated, public-safe snapshot from the read-only manager API."""
from public_results import apply_policy
import argparse
import hashlib
import json
import math
import statistics
import urllib.request
from pathlib import Path
from datetime import datetime, timezone

parser = argparse.ArgumentParser()
parser.add_argument('--url', default='http://127.0.0.1:10952/api/leaderboard')
args = parser.parse_args()
with urllib.request.urlopen(args.url, timeout=60) as response:
    raw = response.read()
source = json.loads(raw)
assert source['suite_size'] == 20 and source['faster_threshold'] == 1.1
assert source['rows'], 'Empty leaderboard'
names = [t['task'] for t in source['rows'][0]['tasks']]
assert len(names) == len(set(names)) == 20
rows = []
for row in source['rows']:
    assert [t['task'] for t in row['tasks']] == names
    rewards = [t['reward'] for t in row['tasks']]
    assert all(v is None or (type(v) in (float, int) and math.isfinite(v) and v >= 0) for v in rewards)
    assert row['scored'] == sum(v is not None for v in rewards)
    assert math.isclose(row['faster_rate_percent'], sum(v is not None and v > 1.1 for v in rewards) / 20 * 100)
    assert math.isclose(row['median_speedup'], statistics.median([v if v is not None else 0 for v in rewards]))
    # Explicit allowlist: no local artifact paths, usage errors, or private pricing notes.
    result = {k: row[k] for k in ['model', 'display_name', 'agents', 'enabled', 'scored', 'running', 'pending', 'failed', 'faster_count', 'faster_rate_percent', 'median_speedup', 'rank']}
    result['tasks'] = [{k: t[k] for k in ['task', 'status', 'reward']} for t in row['tasks']]
    rows.append(result)
snapshot = {'observed_at': datetime.fromtimestamp(source['observed_at'], timezone.utc).isoformat(), 'source': 'npu-fly experiment manager · /api/leaderboard', 'source_sha256': hashlib.sha256(raw).hexdigest(), 'suite_size': 20, 'faster_threshold': 1.1, 'rows': rows}
root = Path(__file__).resolve().parents[1]
snapshot = apply_policy(snapshot)
encoded = json.dumps(snapshot, indent=2, ensure_ascii=False) + '\n'
for path in [root / 'data/leaderboard.json', root / 'public/data/leaderboard.json']:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix('.tmp')
    tmp.write_text(encoded)
    tmp.replace(path)
print(f"Exported {len(rows)} models, {sum(r['scored'] for r in rows)} scores; observed {snapshot['observed_at']}")
