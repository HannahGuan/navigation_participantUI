"""Compile maps, profiles, instructions and exact sandbox transitions for the static site."""
import hashlib
import json
from pathlib import Path
import sys
HERE = Path(__file__).resolve().parents[1]
ROOT = HERE.parent
sys.path.insert(0, str(ROOT))
from listener_agent.hardcoded.env import SandboxEnv
from listener_agent.hardcoded.config import get_preset
from listener_agent.hardcoded.world import World
from listener_agent.hardcoded.demo_contrast import CONDITIONS, LISTENER, shipped_instruction
from listener_agent.maps import MAPS_DIR

library_path = ROOT / 'capacity_pilot/trajectories.json'
library = json.loads(library_path.read_text())
profiles = {k: v['capabilities'] for k,v in library['personas'].items()}
worlds = {}
hashes = {}
for map_id in library['maps']:
    path = MAPS_DIR / (map_id+'.json')
    world = World.load(path)
    hashes[map_id] = hashlib.sha256(path.read_bytes()).hexdigest()
    rules = {}
    for profile_id, caps in profiles.items():
        env = SandboxEnv(world, get_preset('capacity_pilot').with_(capabilities=caps))
        transitions = []
        for y in range(world.height):
            for x in range(world.width):
                transitions.append([list(env.preview(b,(x,y))) for b in ('N','E','S','W')])
        rules[profile_id] = {'transitions': transitions, 'optimal': env.optimal_actions()}
    worlds[map_id] = dict(width=world.width, height=world.height, tiles=world.tiles,
        start=world.start, goal=world.goal,
        objects=[dict(position=c, label=world.blocking_object_at(c).referent)
                 for c in sorted(world.blocked_by_object) if world.in_bounds(c)],
        rules=rules, source_sha256=hashes[map_id])
legacy=[]
for slug,map_id,instruction,_ in CONDITIONS:
    if instruction and instruction.startswith('SHIPPED:'): instruction=shipped_instruction(map_id)
    legacy.append(dict(id=slug,map_id=map_id,profile_id='P_jump',instruction=instruction,
        fov_radius=LISTENER.fov_radius,prior_knowledge=LISTENER.prior_knowledge))
bundle=dict(schema_version=1,profiles=profiles,maps=worlds,legacy_conditions=legacy,
            instructions=library['instructions'],
            source_library_sha256=hashlib.sha256(library_path.read_bytes()).hexdigest())
encoded=json.dumps(bundle,separators=(',',':'))
(HERE/'docs/stimuli.json').write_text(encoded+'\n')
print(f'Compiled {len(worlds)} maps × {len(profiles)} capability profiles ({len(encoded):,} bytes)')
