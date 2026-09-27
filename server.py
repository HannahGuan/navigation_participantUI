"""Local human-listener demo using the original listener sandbox."""
import argparse
from dataclasses import asdict
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, HTTPServer
import json
from pathlib import Path
import random
import secrets
import sys
import time

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
from listener_agent.hardcoded.demo_contrast import CONDITIONS, LISTENER, shipped_instruction
from listener_agent.hardcoded.env import SandboxEnv
from listener_agent.hardcoded.world import World
from listener_agent.maps import MAPS_DIR

DATA = HERE / 'data'
SESSIONS = {}
LIMIT = 400

def now():
    return datetime.now(timezone.utc).isoformat()

class Session:
    def __init__(self, participant):
        self.id = secrets.token_hex(16)
        self.record = dict(schema_version=1, session_id=self.id, participant_id=participant,
                           started_at=now(), listener_config=LISTENER.to_dict(),
                           display=dict(current_fov_only=True, persistent_instructions=True),
                           trials=[])
        self.order = list(range(len(CONDITIONS)))
        random.SystemRandom().shuffle(self.order)
        self.record['condition_order'] = [CONDITIONS[i][0] for i in self.order]
        self.index = -1
        self.advance()

    def save(self):
        DATA.mkdir(exist_ok=True)
        path = DATA / (self.id + '.json')
        tmp = path.with_suffix('.tmp')
        tmp.write_text(json.dumps(self.record, indent=2))
        tmp.replace(path)

    def advance(self):
        if self.index >= 0 and not self.trial['finished']:
            raise ValueError('Finish this trial first.')
        if self.index >= len(self.order):
            raise ValueError('Session is complete.')
        self.index += 1
        if self.index == len(self.order):
            self.record['completed_at'] = now()
            self.save()
            return
        slug, map_id, instruction, _ = CONDITIONS[self.order[self.index]]
        if instruction and instruction.startswith('SHIPPED:'):
            instruction = shipped_instruction(map_id)
        world = World.load(MAPS_DIR / (map_id + '.json'))
        self.env = SandboxEnv(world, LISTENER)
        self.obs = self.env.reset()
        self.seen = set(self.obs.cells)
        self.goal_first = 0 if self.obs.goal_visible else None
        self.started = time.monotonic()
        self.last = self.started
        self.trial = dict(condition_id=slug, map_id=map_id, trial_index=self.index + 1,
                          instruction=instruction, started_at=now(), finished=False,
                          map=world.raw, trail=[list(world.start)], actions=[],
                          observations=[self.observation()], own_optimal_actions=self.env.optimal_actions())
        self.record['trials'].append(self.trial)
        self.save()

    def observation(self):
        o = self.obs
        return dict(step=o.step, position=list(o.position), goal=list(o.goal) if o.goal else None,
                    cells=[dict(x=c[0], y=c[1], **asdict(v)) for c, v in o.cells.items()],
                    result=o.result, blocked_by=o.blocked_by)

    def finish(self, reason):
        self.trial.update(finished=True, success=self.obs.at_goal, reason=reason,
                          finished_at=now(), duration_ms=round((time.monotonic()-self.started)*1000),
                          n_actions=self.env.step_count, coverage=len(self.seen)/(self.env.world.width*self.env.world.height),
                          goal_first_seen_step=self.goal_first,
                          efficiency=(self.trial['own_optimal_actions']/self.env.step_count
                                      if self.obs.at_goal and self.env.step_count else None))

    def action(self, bearing, expected_step):
        if self.index == len(self.order) or self.trial['finished']:
            raise ValueError('Trial is already finished.')
        if expected_step != self.env.step_count:
            raise ValueError('State changed. Reload to continue.')
        if bearing not in ('N', 'E', 'S', 'W'):
            raise ValueError('Invalid direction.')
        stamp = time.monotonic()
        self.obs = self.env.step(bearing)
        self.seen.update(self.obs.cells)
        if self.obs.goal_visible and self.goal_first is None:
            self.goal_first = self.env.step_count
        self.trial['actions'].append(dict(self.env.history[-1],
            elapsed_ms=round((stamp-self.started)*1000), response_ms=round((stamp-self.last)*1000)))
        self.last = stamp
        self.trial['trail'].append(list(self.obs.position))
        self.trial['observations'].append(self.observation())
        if self.obs.at_goal or self.env.step_count >= LIMIT:
            self.finish('goal' if self.obs.at_goal else 'action_limit')
        self.save()

    def state(self):
        if self.index == len(self.order):
            return dict(session_id=self.id, complete=True)
        return dict(session_id=self.id, complete=False, trial=self.index+1, total=len(self.order),
                    instruction=self.trial['instruction'], observation=self.observation(),
                    width=self.env.world.width, height=self.env.world.height,
                    finished=self.trial['finished'], success=self.trial.get('success', False),
                    limit=LIMIT)

class Handler(BaseHTTPRequestHandler):
    def respond(self, value, status=200, mime='application/json'):
        payload = json.dumps(value).encode() if mime == 'application/json' else value
        self.send_response(status)
        self.send_header('Content-Type', mime)
        self.send_header('Content-Length', str(len(payload)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self):
        files = {'/': ('index.html', 'text/html'), '/app.js': ('app.js', 'text/javascript'),
                 '/style.css': ('style.css', 'text/css')}
        if self.path not in files:
            self.respond({'error': 'Not found'}, 404)
            return
        name, mime = files[self.path]
        self.respond((HERE/'static'/name).read_bytes(), mime=mime)

    def do_POST(self):
        # JSON requests only; no cross-origin access to local data or mutations.
        if self.headers.get('Origin') not in (None, 'http://' + self.headers.get('Host', '')):
            self.respond({'error': 'Origin rejected'}, 403)
            return
        try:
            size = int(self.headers.get('Content-Length', '0'))
            if not 0 < size < 8192 or self.headers.get('Content-Type') != 'application/json':
                raise ValueError('Expected a small JSON request.')
            body = json.loads(self.rfile.read(size))
            if self.path == '/api/start':
                pid = body.get('participant_id', '')
                if not isinstance(pid, str) or not 1 <= len(pid.strip()) <= 100:
                    raise ValueError('Enter a participant ID (1–100 characters).')
                session = Session(pid.strip())
                SESSIONS[session.id] = session
            else:
                session = SESSIONS.get(body.get('session_id'))
                if session is None:
                    self.respond({'error': 'Session unavailable. Previously saved data remains on disk.'}, 404)
                    return
                if self.path == '/api/action':
                    session.action(body.get('bearing'), body.get('step'))
                elif self.path == '/api/next':
                    if body.get('trial') != session.index + 1:
                        raise ValueError('State changed. Reload to continue.')
                    session.advance()
                elif self.path == '/api/export':
                    self.respond(session.record)
                    return
                elif self.path != '/api/state':
                    raise ValueError('Unknown request.')
            self.respond(session.state())
        except (ValueError, TypeError, KeyError) as exc:
            self.respond({'error': str(exc)}, 400)
        except OSError:
            self.respond({'error': 'Data could not be saved. Please contact the researcher.'}, 500)

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=8766)
    args = parser.parse_args()
    print(f'Human listener demo: http://127.0.0.1:{args.port}', flush=True)
    HTTPServer(('127.0.0.1', args.port), Handler).serve_forever()
