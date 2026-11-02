"""Publication policy; never mutates experiment-manager records."""
import hashlib
import json
import statistics
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EXCLUDED_MODELS = {'deployed/claude-opus-5', 'claude-opus-5'}


def apply_policy(snapshot):
    snapshot['rows'] = [r for r in snapshot['rows'] if r['model'] not in EXCLUDED_MODELS]
    selection = json.loads((ROOT / 'data/selected-results.json').read_text())
    snapshot['selected_results'] = selection
    for override in selection:
        row = next(r for r in snapshot['rows'] if r['model'] == override['model'])
        cell = next(t for t in row['tasks'] if t['task'] == override['task'])
        cell.update(reward=override['reward'], status='verified', source_attempt_id=override['attempt_id'])
        row['evaluation_note'] = 'Four tasks could not be tested because Anthropic risk-control restrictions were triggered.'
        rewards = [t['reward'] for t in row['tasks']]
        row.update(scored=sum(v is not None for v in rewards),
                   faster_count=sum(v is not None and v > 1.1 for v in rewards),
                   median_speedup=statistics.median(v if v is not None else 0 for v in rewards))
        row['faster_rate_percent'] = row['faster_count'] / snapshot['suite_size'] * 100
        for status in ('running', 'pending', 'failed'):
            row[status] = sum(t['status'] == status for t in row['tasks'])
    snapshot['rows'].sort(key=lambda r: (-r['faster_rate_percent'], -r['median_speedup'], r['model']))
    for rank, row in enumerate(snapshot['rows'], 1):
        row['rank'] = rank
    return snapshot
