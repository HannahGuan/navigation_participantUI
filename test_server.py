import json
from pathlib import Path
import tempfile
import unittest
from collections import deque
import server

class StudyTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.old = server.DATA
        server.DATA = Path(self.temp.name)
    def tearDown(self):
        server.DATA = self.old
        self.temp.cleanup()
    def route(self, env):
        queue = deque([(env.position, [])]); seen = {env.position}
        while queue:
            cell, route = queue.popleft()
            if cell == env.world.goal: return route
            for b in ('N','E','S','W'):
                result, dest, _ = env.preview(b, cell)
                if result != 'blocked' and dest not in seen:
                    seen.add(dest); queue.append((dest, route+[b]))
        self.fail('Unsolvable world')
    def test_complete_session_and_saved_trace(self):
        s=server.Session('TEST_ONLY')
        self.assertEqual(len(set(s.order)), 5)
        for _ in range(5):
            self.assertLessEqual(len(s.state()['observation']['cells']),25)
            self.assertNotIn('map',s.state())
            self.assertIsNone(s.state()['observation']['goal'])
            with self.assertRaises(ValueError): s.advance()
            for bearing in self.route(s.env): s.action(bearing,s.env.step_count)
            self.assertTrue(s.trial['success'])
            self.assertEqual(s.trial['efficiency'],1)
            self.assertEqual(len(s.trial['trail']),s.trial['n_actions']+1)
            self.assertEqual(len(s.trial['observations']),s.trial['n_actions']+1)
            with self.assertRaises(ValueError): s.action('N',s.env.step_count)
            s.advance()
        self.assertTrue(s.state()['complete'])
        saved=json.loads((server.DATA/(s.id+'.json')).read_text())
        self.assertEqual(len(saved['trials']),5)
        self.assertIn('completed_at',saved)
    def test_limit_blocked_and_duplicate_action(self):
        s=server.Session('TEST_LIMIT')
        with self.assertRaises(ValueError): s.action('N',1)
        with self.assertRaises(ValueError): s.action('bad',0)
        for i in range(400): s.action('N',i)
        self.assertEqual(s.trial['reason'],'action_limit')
        self.assertFalse(s.trial['success'])
        self.assertIsNone(s.trial['efficiency'])
        self.assertEqual(s.trial['actions'][-1]['result'],'blocked')
    def test_randomized_orders(self):
        orders={tuple(server.Session('TEST_RANDOM').order) for _ in range(20)}
        self.assertGreater(len(orders),1)

if __name__ == '__main__': unittest.main()
