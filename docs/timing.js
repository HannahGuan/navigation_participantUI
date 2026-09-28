// Monotonic time within each page, plus an explicitly logged wall-clock gap on resume.
export function trialClock(trial, {wall=()=>Date.now(), mono=()=>performance.now(), resume=false}={}) {
  const startMono=mono(),startWall=wall();
  const prior=trial.clock;
  const gap=resume && prior?startWall-prior.saved_wall_ms:0;
  const base=(prior?.elapsed_ms || 0)+Math.max(0,gap);
  const resumeInfo=resume?{resume_gap_ms:gap,negative_wall_gap:gap<0,at:new Date(startWall).toISOString()}:null;
  return {resumeInfo,sample(){
    const elapsed=Math.round(base+mono()-startMono);
    const stamp=wall();
    trial.clock={elapsed_ms:elapsed,saved_wall_ms:stamp};
    return {elapsed_ms:elapsed,timestamp_ms:stamp};
  }};
}
