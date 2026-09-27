"""Export final DataPipe JSON arrays into trial and action CSVs (standard library only)."""
import argparse
import csv
import json
from pathlib import Path

parser=argparse.ArgumentParser()
parser.add_argument('inputs',nargs='+',type=Path)
parser.add_argument('--out',type=Path,default=Path('data/analysis'))
args=parser.parse_args()
args.out.mkdir(parents=True,exist_ok=True)
trials=[];actions=[];seen=set()
for path in args.inputs:
    if path.name.endswith('.partial.json'):
        print(f'Skipping partial session: {path.name}');continue
    data=json.loads(path.read_text())
    if not isinstance(data,list): raise ValueError(f'{path}: expected a final session JSON array')
    for t in data:
        key=(t['session_id'],t['trial_index'])
        if key in seen:continue
        seen.add(key)
        c=t['condition'];p=t['prolific']
        shared=dict(session_id=t['session_id'],participant_id=t['participant_id'],
            prolific_study_id=p['STUDY_ID'],prolific_session_id=p['SESSION_ID'],
            study_version=t['study_version'],trial_index=t['trial_index'],condition_id=c['id'],
            map_id=c['map_id'],profile_id=c['profile_id'])
        row=dict(shared,condition_order=json.dumps(t['condition_order']),
            instruction=c.get('instruction'),fov_radius=c['fov_radius'],
            capabilities=json.dumps(t['capabilities']),source_sha256=t['source_sha256'])
        for k in ('finished','success','reason','n_actions','own_optimal_actions','efficiency',
                  'coverage','goal_first_seen_step','duration_ms','started_at','finished_at','completed_at'):
            row[k]=t.get(k)
        trials.append(row)
        for a in t['actions']:
            record=dict(shared,**{k:v for k,v in a.items() if k!='position'})
            record.update(x=a['position'][0],y=a['position'][1]);actions.append(record)
for name,rows in [('trials',trials),('actions',actions)]:
    if rows:
        with (args.out/(name+'.csv')).open('w',newline='') as f:
            writer=csv.DictWriter(f,fieldnames=list(rows[0]));writer.writeheader();writer.writerows(rows)
    print(f'{name}: {len(rows)} rows')
