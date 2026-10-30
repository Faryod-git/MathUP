import {readPracticeImage,PRACTICE_CONTENT_ROOT} from './practice-catalog.mjs';
import { setTimeout as delay } from 'node:timers/promises';
import { createBotEngine } from './bot-engine.mjs';
import {flushBroadcasts,recoverBroadcasts} from './broadcast.mjs';

export function telegramApi(token,net=fetch,{practiceRoot=PRACTICE_CONTENT_ROOT}={}) {
  const methods=new Set(['getMe','getWebhookInfo','getUpdates','sendMessage','sendPhoto','answerCallbackQuery']);
  return async(method,body={},signal)=>{
    if(!methods.has(method))throw Error('Telegram usuli ruxsat etilmagan');
    let requestBody=JSON.stringify(body),headers={'Content-Type':'application/json'};
    if(method==='sendPhoto'){
      const match=/^practice:(yie-[123]\/topic-[0-9]{2,3}\.png):([a-f0-9]{64})$/.exec(body.photo||'');
      let bytes;
      try{if(!match)throw Error('Invalid practice reference');bytes=readPracticeImage(match[1],match[2],practiceRoot);}catch{throw Object.assign(Error('Test rasmi mavjud emas yoki tekshiruvdan o‘tmadi'),{rejected:true,code:400});}
      requestBody=new FormData();
      for(const [key,value] of Object.entries(body))if(key!=='photo'&&value!==undefined)requestBody.append(key,typeof value==='object'?JSON.stringify(value):String(value));
      requestBody.append('photo',new Blob([bytes],{type:'image/png'}),match[1].split('/').at(-1));headers={};
    }
    let response,data;
    try {
      response=await net('https://api.telegram.org/bot'+token+'/'+method,{method:'POST',headers,body:requestBody,signal:signal?AbortSignal.any([signal,AbortSignal.timeout(40000)]):AbortSignal.timeout(40000)});
      data=await response.json();
    }catch{throw Object.assign(Error('Telegram bilan aloqa uzildi; natija noma’lum'),{uncertain:true});}
    if(!response.ok||data.ok!==true)throw Object.assign(Error('Telegram so‘rovni qabul qilmadi'),{rejected:data.ok===false,code:Number(data.error_code)||response.status,retryAfter:Number(data.parameters?.retry_after)||0});
    return data.result;
  };
}
export async function checkBotReady(config,api) {
  if(!config.botToken)throw Error('Bot tokeni sozlanmagan. Setup.ps1 ni bajaring.');
  if(config.audience!=='all'&&!config.adminTelegramIds.length)throw Error('Birinchi sinov uchun o‘zingizning Telegram ID raqamingizni kiriting.');
  const me=await api('getMe');
  if(!me?.is_bot||String(me.username).toLowerCase()!==config.botUsername.toLowerCase())throw Error('Bot nomi token bilan mos kelmadi.');
  const webhook=await api('getWebhookInfo');
  if(webhook?.url)throw Error('Botda webhook faol. ChatPlace ulanishi o‘zgartirilmadi; mahalliy qabul ishga tushmadi.');
  return me;
}
export async function flushOutbox(DB,api,signal) {
  const db=DB.sqlite;
  for(const row of db.prepare("SELECT * FROM bot_outbox WHERE state='prepared' ORDER BY id LIMIT 100").all()) {
    if(signal?.aborted)return 0;
    const claimed=db.prepare("UPDATE bot_outbox SET state='sending' WHERE id=? AND state='prepared'").run(row.id);
    if(!claimed.changes)continue;
    const payload=JSON.parse(row.body_json);
    try {
      await api(payload.method,payload.body,signal);
      db.prepare("UPDATE bot_outbox SET state='sent',body_json=NULL WHERE id=?").run(row.id);
    }catch(e) {
      if(e.rejected&&e.code===429&&e.retryAfter>0&&e.retryAfter<=3600){
        db.prepare("UPDATE bot_outbox SET state='prepared' WHERE id=?").run(row.id);return e.retryAfter;
      }
      db.prepare('UPDATE bot_outbox SET state=?,body_json=NULL WHERE id=?').run(e.rejected?'failed':'unknown',row.id);
    }
  }
  return 0;
}
export async function runPolling(DB,config,{api=telegramApi(config.botToken),signal,onStatus=()=>{},sleep=(ms,signal)=>delay(ms,undefined,{signal}).catch(()=>{})}={}) {
  const wait=ms=>sleep(ms,signal);
  let startupBackoff=1000,ready=false;
  while(!signal?.aborted) {
    try {await checkBotReady(config,api);ready=true;break;}
    catch(e) {
      // Read-only preflight can safely retry transient transport/server failures.
      // Configuration, bot identity, active webhook and authentication errors stay terminal.
      const transient=e.uncertain||e.code===429||(e.code>=500&&e.code<=599);
      if(!transient)throw e;
      if(signal?.aborted)break;
      onStatus({mode:'reconnecting'});
      const retry=e.code===429&&e.retryAfter>0&&e.retryAfter<=3600?e.retryAfter*1000:startupBackoff;
      await wait(retry);startupBackoff=Math.min(startupBackoff*2,30000);
    }
  }
  if(!ready){onStatus({mode:'off'});return;}
  DB.sqlite.prepare("UPDATE bot_outbox SET state='unknown',body_json=NULL WHERE state='sending'").run();
  recoverBroadcasts(DB);
  const process=createBotEngine(DB,config);let backoff=1000;
  const flush=async()=>{const retry=await flushOutbox(DB,api,signal)||await flushBroadcasts(DB,api,signal);if(retry)await wait(retry*1000);return retry;};
  onStatus({mode:'polling'});
  while(!signal?.aborted) {
    try {
      if(await flush())continue;
      const offset=Number(DB.sqlite.prepare("SELECT value FROM bot_state WHERE key='offset'").get()?.value||0);
      const pending=DB.sqlite.prepare("SELECT 1 FROM bot_broadcast_recipients WHERE state='queued' LIMIT 1").get();
      const updates=await api('getUpdates',{offset,timeout:pending?1:25,allowed_updates:['message','callback_query','my_chat_member']},signal);
      if(!Array.isArray(updates))throw Error('Telegram javobi noto‘g‘ri');
      for(const update of updates) {
        if(signal?.aborted)break;
        if(!Number.isSafeInteger(update?.update_id)||update.update_id<offset)continue;
        process(update);
        DB.sqlite.prepare("INSERT INTO bot_state(key,value) VALUES('offset',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(String(update.update_id+1));
      }
      await flush();backoff=1000;onStatus({mode:'polling'});
    }catch(e){
      if(signal?.aborted)break;
      // Authentication/conflict means another consumer or a changed webhook. Stop.
      if([401,409].includes(e.code)){onStatus({mode:'blocked',reason:'Telegram ulanishi o‘zgargan yoki boshqa bot jarayoni ishlayapti.'});return;}
      onStatus({mode:'reconnecting'});await wait(backoff);backoff=Math.min(backoff*2,30000);
    }
  }
  onStatus({mode:'off'});
}
