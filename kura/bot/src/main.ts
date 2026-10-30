import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdir, readdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { joinGoogleMeeting } from '../vendor/vexa/googlemeet/join';
import { waitForGoogleMeetingAdmission, countRealParticipantTiles } from '../vendor/vexa/googlemeet/admission';
import { checkForGoogleRemoval } from '../vendor/vexa/googlemeet/removal';
import { setHooks } from '../vendor/vexa/_host';
import { meetUrl } from './url';
const base = process.env.KURA_API_URL || '';
const token = process.env.KURA_BOT_TOKEN || '';
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
let stopping = false, state = 'idle';
process.on('SIGTERM', () => { stopping = true; });
process.on('SIGINT', () => { stopping = true; });
createServer((_req,res) => { res.setHeader('Content-Type','application/json'); res.end(JSON.stringify({service:'kura-meet',state})); }).listen(8081,'0.0.0.0');
async function api(path: string, data?: any, bytes?: Buffer): Promise<any> {
 const response = await fetch(`${base}/api/internal/${path}`, {method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':bytes?'application/octet-stream':'application/json'},body:bytes ? new Uint8Array(bytes) : JSON.stringify(data||{}),signal:AbortSignal.timeout(60000)});
 if(!response.ok) throw new Error(`Kura API returned ${response.status}`);
 return response.json();
}
async function run(job: any) {
 const id = job.id || 'probe'; const dir = join('/recordings',id);
 await mkdir(dir,{recursive:true}); await mkdir('/app/storage/screenshots',{recursive:true});
 let browser: any, recorder: any, done=false, uploaded = new Set<string>(), aloneSince=0;
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
  const heartbeat=setInterval(()=>{if(base)api(`meetings/${id}/heartbeat`).then(r=>{if(r.stop)done=true;}).catch(()=>{done=true;});},10000);
  try {
   await update('joining');
   const abortWatch=setInterval(()=>{if(stopping||done)context.close().catch(()=>{});},1000);
   try {await joinGoogleMeeting(page,meetUrl(job.meet_url),config.botName,config); if(!await waitForGoogleMeetingAdmission(page,180000,config))throw new Error('Not admitted before timeout.');} finally {clearInterval(abortWatch);}
   await update('recording');
   recorder=spawn('ffmpeg',['-nostdin','-hide_banner','-loglevel','error','-f','pulse','-i','kura.monitor','-ac','1','-ar','16000','-c:a','pcm_s16le','-f','segment','-segment_time','30','-reset_timestamps','1',join(dir,'%06d.wav')],{stdio:['ignore','ignore','pipe']});
   let recordError='';recorder.stderr.on('data',(b:Buffer)=>{recordError+=b.toString().slice(0,1000);});
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
 } catch(e:any){await update('failed',{error:'The bot could not finish this meeting. Check admission, network access, or try again.'}).catch(()=>{}); console.error(JSON.stringify({event:'bot_error',kind:e.name,message:String(e.message).replace(/https?:\/\/\S+/g,'[url]').slice(0,240)}));}
 finally{if(recorder)recorder.kill('SIGINT');if(browser)await browser.close().catch(()=>{});setHooks({});state='idle';}
}
async function main(){
 if(process.env.KURA_PROBE_MEET_URL){await run({meet_url:process.env.KURA_PROBE_MEET_URL});return;}
 if(!base||!token)throw new Error('KURA_API_URL and KURA_BOT_TOKEN are required.');
 while(!stopping){try{const job=await api('claim');if(job.id)await run(job);else await sleep(3000);}catch{console.error('Backend unavailable; retrying.');await sleep(5000);}}
}
main().catch(()=>{state='unavailable';console.error('Bot startup failed.');});
