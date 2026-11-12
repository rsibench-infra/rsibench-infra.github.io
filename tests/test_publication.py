"""Regression checks for the runtime normalization and frozen historical selections."""
import json
import math
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from refresh_publication import score, aggregate_rows, lite_models, PUBLIC_TRACE_FIELDS


def read(name):
    return json.loads((ROOT / name).read_text())


class PublicationTest(unittest.TestCase):
    def test_reference_points_and_beyond_singularity(self):
        for ratio in (1.01, 1.5, 2, 50.882583082334):
            self.assertEqual(score(None, ratio), 0)
            self.assertEqual(score(0, ratio), 0)
            self.assertEqual(score(1, ratio), 0.5)
            self.assertEqual(score(ratio, ratio), 1)
            self.assertEqual(score(1e10, ratio), 1)

    def test_independent_throughput_form(self):
        refs = {r['task']: r for r in read('data/sol-reference.json')['rows']}
        for row in read('data/leaderboard.json')['rows']:
            for cell in row['tasks']:
                ref = refs[cell['task']]
                baseline, sol, reward = ref['baseline'], ref['sol'], cell['reward']
                expected = 0 if not reward else 1 if reward * baseline >= sol else (sol - baseline) / (sol - 2 * baseline + sol / reward)
                self.assertTrue(math.isclose(cell['sol_score'], expected, abs_tol=1e-12))

    def test_historical_scores_and_trajectories_are_unchanged(self):
        history = read('data/historical-results.json')
        current = {r['model']: r for r in read('data/leaderboard.json')['rows']}
        manifest = {(e['model'], e['task']): e for e in read('public/data/trajectories/index.json')['entries']}
        for row in history['rows']:
            cells = lambda r: [(t['task'], t['reward'], t['status']) for t in r['tasks']]
            self.assertEqual(cells(row), cells(current[row['model']]))
        for entry in history['trajectories']:
            self.assertEqual({k: v for k, v in entry.items() if k in PUBLIC_TRACE_FIELDS}, manifest[entry['model'], entry['task']])

    def test_full_and_lite_share_latest_reference(self):
        full = {r['model']: r for r in read('data/leaderboard.json')['rows']}
        lite = read('data/lite-set.json')
        self.assertAlmostEqual(next(r['sol_throughput'] for r in lite['rows'] if r['task_id'] == 'infer-llada2p1mini-16b'), 642.288852, places=5)
        for row in lite['models']:
            for cell in row['tasks']:
                self.assertEqual(cell['score'], next(t['sol_score'] for t in full[row['model']]['tasks'] if t['task'] == cell['task']))
            self.assertAlmostEqual(row['mean_score'], sum(t['score'] for t in row['tasks']) / row['aggregation_task_count'])


    def test_partial_denominator_includes_formal_zero_but_not_missing(self):
        rows = [dict(model='claude', display_name='claude-opus-5-5', tasks=[
            dict(task='a', reward=2, sol_score=1, status='completed'),
            dict(task='b', reward=0, sol_score=0, status='completed'),
            dict(task='c', reward=None, sol_score=0, status='not_tested')])]
        aggregate_rows(rows)
        self.assertEqual(rows[0]['aggregation_task_count'], 2)
        self.assertEqual(rows[0]['mean_sol_score'], 0.5)
        self.assertEqual(rows[0]['faster_rate_percent'], 50)
        self.assertEqual(rows[0]['median_speedup'], 1)
        lite = lite_models(rows, ['a', 'b', 'c'])[0]
        self.assertEqual(lite['aggregation_task_count'], 2)
        self.assertEqual(lite['mean_score'], 0.5)
