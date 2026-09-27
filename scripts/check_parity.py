"""Independent current-source comparison data, consumed by the Node tests."""
import json
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[2]))
from listener_agent.hardcoded.config import get_preset
from listener_agent.hardcoded.env import SandboxEnv
from listener_agent.hardcoded.world import World
from listener_agent.maps import MAPS_DIR
root=Path(__file__).resolve().parents[2]
lib=json.loads((root/'capacity_pilot/trajectories.json').read_text())
out={}
for mid in lib['maps']:
    w=World.load(MAPS_DIR/(mid+'.json'))
    out[mid]={}
    for pid,p in lib['personas'].items():
        env=SandboxEnv(w,get_preset('capacity_pilot').with_(capabilities=p['capabilities']))
        out[mid][pid]=[[env.preview(b,(x,y)) for b in ('N','E','S','W')]
                       for y in range(w.height) for x in range(w.width)]
print(json.dumps(out,separators=(',',':')))
