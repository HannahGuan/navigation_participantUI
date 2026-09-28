export const BEARINGS = ['N', 'E', 'S', 'W'];
export const equal = (a,b) => a[0] === b[0] && a[1] === b[1];
export function shuffle(items, random = () => crypto.getRandomValues(new Uint32Array(1))[0] / 2**32) {
  const result = [...items];
  for (let i=result.length-1;i>0;i--) { const j=Math.floor(random()*(i+1)); [result[i],result[j]]=[result[j],result[i]]; }
  return result;
}
export function validateConditions(conditions, stimuli) {
  if (!Array.isArray(conditions) || !conditions.length) throw new Error('No study conditions configured.');
  const ids=new Set();
  for (const c of conditions) {
    if (!c.id || ids.has(c.id) || !stimuli.maps[c.map_id]?.rules[c.profile_id]) throw new Error('Invalid or duplicate condition.');
    if (c.fov_radius !== null && (!Number.isInteger(c.fov_radius) || c.fov_radius < 1)) throw new Error('Invalid field of view.');
    if (!['all','none'].includes(c.prior_knowledge)) throw new Error('Invalid prior knowledge.');
    ids.add(c.id);
  }
}
export function transition(world, profile, position, bearing) {
  if (!BEARINGS.includes(bearing)) throw new Error('Invalid direction');
  const [result,dest,blocked_by]=world.rules[profile].transitions[position[1]*world.width+position[0]][BEARINGS.indexOf(bearing)];
  return {result, position:[...dest], blocked_by};
}
export function observation(world, condition, position, step=0, result='moved', blocked_by=null) {
  const full=condition.fov_radius===null || (step===0 && condition.prior_knowledge==='all');
  const cells=[];
  for(let y=0;y<world.height;y++) for(let x=0;x<world.width;x++) {
    if(full || Math.max(Math.abs(x-position[0]),Math.abs(y-position[1]))<=condition.fov_radius) {
      cells.push({x,y,terrain:world.tiles[y][x],object_label:world.objects.find(o=>equal(o.position,[x,y]))?.label || null});
    }
  }
  const visible=cells.some(c=>equal([c.x,c.y],world.goal));
  return {step,position:[...position],cells,goal:visible?[...world.goal]:null,result,blocked_by};
}
export function abilities(caps) {
  return [caps.jump ? 'You can jump fences. Move toward a fence to jump if the tile beyond is clear.' : 'You cannot jump. Fences block your path.',
    caps.swim ? 'You can swim through water.' : 'You cannot swim. Water blocks your path.',
    caps.lava_immune ? 'You can cross lava.' : 'You cannot cross lava.'].join(' ');
}
export function newTrial(condition, world, index, now=Date.now()) {
  const initial=observation(world,condition,world.start);
  return {trial_type:'navigation',condition:structuredClone(condition),trial_index:index+1,
    started_at:new Date(now).toISOString(),started_ms:now,last_action_ms:now,
    position:[...world.start],trail:[[...world.start]],actions:[],finished:false,
    trajectory:[{step:0,position:[...world.start],elapsed_ms:0,timestamp:new Date(now).toISOString(),result:'start'}],
    clock:{elapsed_ms:0,saved_wall_ms:now},
    seen:initial.cells.map(c=>`${c.x},${c.y}`),goal_first_seen_step:initial.goal?0:null,
    own_optimal_actions:world.rules[condition.profile_id].optimal,source_sha256:world.source_sha256};
}
export function act(trial, world, bearing, maxActions, now=Date.now(), responseMs=null, timing=null) {
  if(trial.finished) throw new Error('Trial is finished');
  const from=[...trial.position];
  const next=transition(world,trial.condition.profile_id,trial.position,bearing);
  const step=trial.actions.length+1;
  const obs=observation(world,trial.condition,next.position,step,next.result,next.blocked_by);
  const elapsed=timing?.elapsed_ms ?? now-trial.started_ms;
  const response=responseMs ?? elapsed-(trial.actions.at(-1)?.elapsed_ms || 0);
  const timestamp=new Date(now).toISOString();
  trial.actions.push({step,action:bearing,...next,from,to:[...next.position],timestamp,
    elapsed_ms:elapsed,response_ms:response,
    timing_source:timing?'monotonic_with_logged_resume_gaps':'wall_clock'});
  trial.trajectory.push({step,position:[...next.position],elapsed_ms:elapsed,timestamp,result:next.result});
  trial.last_action_ms=now;trial.position=next.position;trial.trail.push([...next.position]);
  trial.seen=[...new Set([...trial.seen,...obs.cells.map(c=>`${c.x},${c.y}`)])];
  if(obs.goal && trial.goal_first_seen_step===null)trial.goal_first_seen_step=step;
  const success=equal(next.position,world.goal);
  if(success || step>=maxActions) Object.assign(trial,{finished:true,success,
    reason:success?'goal':'action_limit',finished_at:new Date(now).toISOString(),
    duration_ms:elapsed,wall_duration_ms:now-trial.started_ms,n_actions:step,coverage:trial.seen.length/(world.width*world.height),
    efficiency:success?trial.own_optimal_actions/step:null});
  return obs;
}
