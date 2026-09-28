export function resolveMode(params) {
  const ids=['PROLIFIC_PID','STUDY_ID','SESSION_ID'].map(k=>params.get(k)?.trim() || '');
  if(params.get('preview')==='1')return 'preview';
  if(params.get('mode')==='researcher')return 'researcher';
  if(ids.some(Boolean)) {
    if(!ids.every(Boolean) || ids.some(v=>/[{}%]/.test(v)))throw new Error('Please enter through your Prolific study link. The participant identifiers are missing or incomplete.');
    return 'participant';
  }
  return 'researcher';
}
