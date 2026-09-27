// Persist the exact final payload before attempting upload. Retries reuse its filename.
export async function prepareUpload(session, data) {
  if (session.upload?.data) return session.upload;
  const bytes=new TextEncoder().encode(JSON.stringify(data));
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)), b=>b.toString(16).padStart(2,'0')).join('');
  session.upload={filename:`navigation-${session.id}-${hash}.json`, data:new TextDecoder().decode(bytes), status:'pending'};
  return session.upload;
}
export function accepted(result, upload) {
  if(result.ok && [201,202].includes(result.status)) return result.status===202?'queued':'stored';
  // A retry after a lost response may find the exact immutable, content-addressed file.
  if([ 'FILE_EXISTS','OSF_FILE_EXISTS'].includes(result.body?.error) && /^navigation-[\w-]+-[a-f0-9]{64}\.json$/.test(upload.filename)) return 'already_stored';
  return null;
}
export class Collector {
  constructor(config, {preview=false, client=globalThis.DataPipe}={}) {
    this.config=config;this.preview=preview;this.client=client;this.session=null;
  }
  start(id) {
    if(this.preview)return;
    if(!this.client)throw new Error('The data service could not load. Please reload this page.');
    this.session=this.client.createSession({experiment_id:this.config.experimentId,filename:`navigation-${id}.json`});
  }
  record(record) {
    if(this.preview || !this.session)return;
    if(new TextEncoder().encode(JSON.stringify(record)).length>=16384)throw new Error('Checkpoint exceeds the upload limit.');
    this.session.record(record);
  }
  flush() { return this.session?.flush(); }
  async submit(upload) {
    if(this.preview)return 'preview';
    const result=await this.client.saveData({experiment_id:this.config.experimentId,
      filename:upload.filename,data:upload.data,session:this.session});
    const status=accepted(result,upload);
    if(!status)throw new Error(`Your upload is not confirmed (${result.body?.error || result.status || 'connection lost'}). Please retry. Your browser backup is still available.`);
    await this.session?.close({submitted:true});
    return status;
  }
}
