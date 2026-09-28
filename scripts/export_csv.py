"""Export final navigation JSON files to explicit trial, action and trajectory CSVs."""
import argparse
import csv
import json
from pathlib import Path


def export(inputs, out):
    out.mkdir(parents=True,exist_ok=True)
    unique={}
    for path in inputs:
        if path.name.endswith('.partial.json'):
            print(f'Skipping partial session: {path.name}');continue
        data=json.loads(path.read_text())
        if not isinstance(data,list):raise ValueError(f'{path}: expected a final session JSON array')
        for t in data:
            key=(t['session_id'],t['trial_index'])
            prior=unique.get(key)
            # Prefer completed or more complete records when a backup is also supplied.
            score=lambda r:(bool(r.get('completed_at')),bool(r.get('finished')),len(r['actions']))
            if prior is None or score(t)>score(prior):unique[key]=t
    trials=[];actions=[];trajectory=[]
    for t in unique.values():
        c=t['condition'];p=t['prolific']
        shared=dict(session_id=t['session_id'],participant_id=t['participant_id'],
            prolific_study_id=p['STUDY_ID'],prolific_session_id=p['SESSION_ID'],
            study_version=t['study_version'],trial_index=t['trial_index'],condition_id=c['id'],
            map_id=c['map_id'],profile_id=c['profile_id'])
        row=dict(shared,assignment_index=t.get('assignment',{}).get('index'),
            instruction=c.get('instruction'),fov_radius=c['fov_radius'],
            capabilities=json.dumps(t['capabilities']),source_sha256=t['source_sha256'])
        for k in ('finished','success','reason','n_actions','own_optimal_actions','efficiency',
                  'coverage','goal_first_seen_step','duration_ms','wall_duration_ms','instruction_reading_ms','assignment_wait_ms',
                  'started_at','finished_at','completed_at'):
            row[k]=t.get(k)
        trials.append(row)
        for i,a in enumerate(t['actions']):
            origin=a.get('from',t['trail'][i]);dest=a.get('to',a['position'])
            actions.append(dict(shared,step=a['step'],action=a['action'],result=a['result'],
                blocked_by=a.get('blocked_by'),from_x=origin[0],from_y=origin[1],to_x=dest[0],to_y=dest[1],
                timestamp=a.get('timestamp'),elapsed_ms=a['elapsed_ms'],response_ms=a['response_ms'],
                timing_source=a.get('timing_source')))
        points=t.get('trajectory') or [dict(step=i,position=p,
                    timestamp=t['started_at'] if i==0 else t['actions'][i-1].get('timestamp'),
                    elapsed_ms=0 if i==0 else t['actions'][i-1]['elapsed_ms'],
                    result='start' if i==0 else t['actions'][i-1]['result']) for i,p in enumerate(t['trail'])]
        for point in points:
            trajectory.append(dict(shared,step=point['step'],x=point['position'][0],y=point['position'][1],
                timestamp=point['timestamp'],elapsed_ms=point['elapsed_ms'],result=point['result']))
    for name,rows in [('trials',trials),('actions',actions),('trajectory',trajectory)]:
        if rows:
            with (out/(name+'.csv')).open('w',newline='') as f:
                writer=csv.DictWriter(f,fieldnames=list(rows[0]));writer.writeheader();writer.writerows(rows)
        print(f'{name}: {len(rows)} rows')

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('inputs',nargs='+',type=Path)
    parser.add_argument('--out',type=Path,default=Path('data/analysis'))
    args=parser.parse_args()
    export(args.inputs,args.out)
