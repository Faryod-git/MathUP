import { setTimeout as delay } from 'node:timers/promises';
import { createBotEngine } from './bot-engine.mjs';

export function telegramApi(token,net=fetch) {
  const methods=new Set(['getMe','getWebhookInfo','getUpdates','sendMessage','answerCallbackQuery']);
  return async(method,body={},signal)=>{
    if(!methods.has(method))throw Error('Telegram usuli ruxsat etilmagan');
    let response,data;
    try {
      response=await net('https://api.telegram.org/bot'+token+'/'+method,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:signal?AbortSignal.any([signal,AbortSignal.timeout(40000)]):AbortSignal.timeout(40000)});
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
export async function runPolling(DB,config,{api=telegramApi(config.botToken),signal,onStatus=()=>{}}={}) {
  await checkBotReady(config,api);
  DB.sqlite.prepare("UPDATE bot_outbox SET state='unknown',body_json=NULL WHERE state='sending'").run();
  const process=createBotEngine(DB,config);let backoff=1000;
  const wait=ms=>delay(ms,undefined,{signal}).catch(()=>{});
  const flush=async()=>{const retry=await flushOutbox(DB,api,signal);if(retry)await wait(retry*1000);return retry;};
  onStatus({mode:'polling'});
  while(!signal?.aborted) {
    try {
      if(await flush())continue;
      const offset=Number(DB.sqlite.prepare("SELECT value FROM bot_state WHERE key='offset'").get()?.value||0);
      const updates=await api('getUpdates',{offset,timeout:25,allowed_updates:['message','callback_query']},signal);
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
