// Live assignments come from DataPipe's shared counter, never per-browser randomness.
export async function assignCondition(conditions, {preview, previewIndex=null, client, experimentId, fixedConditionId=null}) {
  let index;
  if (fixedConditionId !== null) {
    index=conditions.findIndex(c=>c.id===fixedConditionId);
  } else if (preview) {
    index=previewIndex===null?Math.floor(crypto.getRandomValues(new Uint32Array(1))[0]/2**32*conditions.length):Number(previewIndex);
  } else {
    if(!client?.getCondition)throw new Error('The assignment service could not load. Please reload.');
    index=await client.getCondition({experiment_id:experimentId});
  }
  if(!Number.isInteger(index) || index<0 || index>=conditions.length)throw new Error('Invalid condition assignment. Please contact the researcher.');
  return {condition:structuredClone(conditions[index]),assignment:{index,condition_id:conditions[index].id,
    method:fixedConditionId!==null?'fixed_top_up':preview?'preview':'datapipe_round_robin',assigned_at:new Date().toISOString()}};
}
