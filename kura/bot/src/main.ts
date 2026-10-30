import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { spawn, execFile } from 'node:child_process';
import { mkdir, readdir, readFile, rm, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { joinGoogleMeeting } from '../vendor/vexa/googlemeet/join';
import { waitForGoogleMeetingAdmission, countRealParticipantTiles } from '../vendor/vexa/googlemeet/admission';
import { checkForGoogleRemoval } from '../vendor/vexa/googlemeet/removal';
import { setHooks } from '../vendor/vexa/_host';
import { meetUrl } from './url';
import { publicJoinError } from '../vendor/vexa/googlemeet/join-failure';
import { finishEmptySpool } from './empty-spool';
const base = process.env.KURA_API_URL || '';
const token = process.env.KURA_BOT_TOKEN || '';
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
let stopping = false, state = 'idle';
process.on('SIGTERM', () => { stopping = true; });
process.on('SIGINT', () => { stopping = true; });
createServer((_req,res) => { res.setHeader('Content-Type','application/json'); res.end(JSON.stringify({service:'kura-meet',state})); }).listen(8081,'0.0.0.0');
async function api(path: string, data?: any, bytes?: Buffer): Promise<any> {
 const response = await fetch(`${base}/api/internal/${path}`, {method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':bytes?'application/octet-stream':'application/json'},body:bytes ? new Uint8Array(bytes) : JSON.stringify(data||{}),signal:AbortSignal.timeout(60000)});
 if(!response.ok) throw Object.assign(new Error(`Kura API returned ${response.status}`),{status:response.status});
 return response.json();
}
async function run(job: any) {
 const id = job.id || 'probe'; const dir = join('/recordings',id);
 await mkdir(dir,{recursive:true}); await mkdir('/app/storage/screenshots',{recursive:true});
 let browser: any, recorder: any, done=false, deleteLocal=false, uploaded = new Set<string>(), aloneSince=0;
 const update=async(status:string,extra:any={})=>{state=status; console.log(JSON.stringify({event:'state',state})); if(base) await api(`meetings/${id}/state`,{status,...extra});};
 setHooks({onState: async(s)=>{if(s==='joining'||s==='awaiting_admission')await update(s==='awaiting_admission'?'waiting':s); if(s==='blocked'||s==='needs_human_help')throw new Error('Meet requires human attention.');}});
 const upload=async(final=false)=>{
  const files=(await readdir(dir)).filter(f=>f.endsWith('.wav')).sort();
  for(const f of final?files:files.slice(0,-1)) {
   if(uploaded.has(f))continue;
   if(base)await api(`meetings/${id}/chunks/${Number(f.slice(0,6))}`,undefined,await readFile(join(dir,f)));
   uploaded.add(f);
  }
 };
 try {
  const proxy = process.env.KURA_BROWSER_PROXY || (process.env.HTTP_PROXY?'http://tarka-network-edge:3128':'');
  browser = await chromium.launch({headless:false,proxy:proxy?{server:proxy}:undefined,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--autoplay-policy=no-user-gesture-required','--lang=en-US',...(proxy?['--force-webrtc-ip-handling-policy=disable_non_proxied_udp']:[])]});
  const context=await browser.newContext({locale:'en-US',viewport:{width:1280,height:800},permissions:['microphone','camera']});
  const page=await context.newPage();
  // Upstream screenshots can contain participant details. Keep them opt-in and private.
  if(process.env.KURA_BOT_DIAGNOSTICS!=='1') page.screenshot=async()=>Buffer.alloc(0);
  const config={platform:'google_meet',botName:'Kura · Meeting notes',uiInteractionMode:'humanized' as const,automaticLeave:{waitingRoomTimeout:180}};
  const heartbeat=setInterval(()=>{if(base)api(`meetings/${id}/heartbeat`).then(r=>{if(r.stop)done=true;if(r.delete)deleteLocal=true;}).catch(()=>{done=true;});},10000);
  try {
   await update('joining');
   const abortWatch=setInterval(()=>{if(stopping||done)context.close().catch(()=>{});},1000);
   try {await joinGoogleMeeting(page,meetUrl(job.meet_url),config.botName,config); if(!await waitForGoogleMeetingAdmission(page,180000,config))throw new Error('Not admitted before timeout.');} finally {clearInterval(abortWatch);}
   await update('recording');
   recorder=spawn('ffmpeg',['-nostdin','-hide_banner','-loglevel','error','-f','pulse','-i','kura.monitor','-ac','1','-ar','16000','-c:a','pcm_s16le','-f','segment','-segment_time','30','-reset_timestamps','1',join(dir,'%06d.wav')],{stdio:['ignore','ignore','pipe']});
   recorder.stderr.on('data',()=>{});
   const started=Date.now();
   while(!stopping&&!done&&Date.now()-started<2*60*60*1000) {
    if(recorder.exitCode!==null)throw new Error('Audio capture stopped unexpectedly.');
    if(await checkForGoogleRemoval(page))break;
    const count=await countRealParticipantTiles(page);
    if(count<=1){aloneSince ||= Date.now(); if(Date.now()-aloneSince>120000)break;}else aloneSince=0;
    await upload();await sleep(3000);
   }
  } finally {clearInterval(heartbeat);}
  if(recorder){await new Promise<void>(resolve=>{recorder.once('exit',()=>resolve());recorder.kill('SIGINT');setTimeout(()=>{recorder.kill('SIGKILL');resolve();},10000);});recorder=null;}
  await upload(true);
  if(!uploaded.size)throw new Error('The meeting ended without an audio recording.');
  if(base)await api(`meetings/${id}/finish`,{chunks:uploaded.size});
  await update('captured');
  if(base)await rm(dir,{recursive:true,force:true});
 } catch(e:any){await update('failed',{error:publicJoinError(e)}).catch(()=>{}); console.error(JSON.stringify({event:'bot_error',kind:e.name,message:String(e.message).replace(/https?:\/\/\S+/g,'[url]').slice(0,240)}));}
 finally{if(recorder){recorder.kill('SIGINT');await new Promise(r=>setTimeout(r,1000));}if(deleteLocal)await rm(dir,{recursive:true,force:true});if(browser)await browser.close().catch(()=>{});setHooks({});state='idle';}
}
async function recoverSpool() {
 await mkdir('/recordings',{recursive:true});
 for(const id of await readdir('/recordings')) {
  if(!/^[a-f0-9-]{36}$/.test(id))continue;
  const dir=join('/recordings',id);
  try {
   const files=(await readdir(dir)).filter(f=>/^\d{6}\.wav$/.test(f)).sort();
   if(await finishEmptySpool(files,
    ()=>api(`meetings/${id}/state`,{status:'failed',error:'The meeting stopped before audio could be captured.'}),
    ()=>rm(dir,{recursive:true,force:true})))continue;
   const recovery=await api(`meetings/${id}/recover`);
   if(recovery.settled){await rm(dir,{recursive:true,force:true});continue;}
   const uploaded=new Set(recovery.uploaded_chunks);
   for(const f of files){
    const seq=Number(f.slice(0,6)); if(uploaded.has(seq))continue;
    const original=join(dir,f), repaired=original+'.repaired.wav';
    await new Promise<void>((resolve,reject)=>execFile('ffmpeg',['-nostdin','-v','error','-y','-i',original,'-c:a','pcm_s16le',repaired],{timeout:30000},e=>e?reject(e):resolve()));
    await rename(repaired,original);
    await api(`meetings/${id}/chunks/${seq}`,undefined,await readFile(original));
   }
   await api(`meetings/${id}/finish`,{chunks:files.length});
   await rm(dir,{recursive:true,force:true});
  } catch(e:any){if(e.status===404)await rm(dir,{recursive:true,force:true});else throw e;}
 }
}
async function main(){
 if(process.env.KURA_PROBE_MEET_URL){await run({meet_url:process.env.KURA_PROBE_MEET_URL});return;}
 if(!base||!token)throw new Error('KURA_API_URL and KURA_BOT_TOKEN are required.');
 while(!stopping){try{await recoverSpool();const job=await api('claim');if(job.id)await run(job);else await sleep(3000);}catch{console.error('Backend unavailable; retrying.');await sleep(5000);}}
}
main().catch(()=>{state='unavailable';console.error('Bot startup failed.');});
