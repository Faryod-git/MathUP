import {createHash,randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
const now=()=>Math.floor(Date.now()/1000);
const fail=(status,message)=>{throw Object.assign(Error(message),{status});};
const text=v=>{if(typeof v!=='string'||!v.trim()||v.trim().length>3500||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v))fail(400,'Xabar 1–3500 belgi bo‘lsin');return v.trim();};
const hash=v=>createHash('sha256').update(v).digest('hex');
const validId=v=>typeof v==='string'&&/^[1-9]\d{0,15}$/.test(v);
const labelQuery=`SELECT u.*,p.display_name AS full_name,p.id AS parent_id FROM bot_users u LEFT JOIN parents p ON p.telegram_chat_id=u.chat_id AND p.chat_verified=1 AND p.archived=0`;
const cleanup=db=>db.exec("DELETE FROM bot_broadcasts WHERE state='preview' AND expires<unixepoch();UPDATE bot_broadcasts SET state='done',text=NULL WHERE state='queued' AND NOT EXISTS(SELECT 1 FROM bot_broadcast_recipients r WHERE r.batch_id=bot_broadcasts.id AND r.state IN ('queued','sending'))");

export function broadcastRoute(DB,path,method,b,actor,config,url) {
 const db=DB.sqlite;
 if(path==='/api/bot-users'&&method==='GET'){
  const offset=Math.max(0,Math.min(100000,Math.floor(Number(url.searchParams.get('offset')))||0));
  const q=(url.searchParams.get('q')||'').trim().slice(0,120);
  const items=db.prepare(labelQuery+" WHERE instr(u.chat_id,?)>0 OR instr(lower(coalesce(p.display_name,'')),lower(?))>0 ORDER BY u.last_seen DESC,u.chat_id LIMIT 51 OFFSET ?").all(q,q,offset);
  return {items,total:db.prepare('SELECT COUNT(*) n FROM bot_users').get().n,active:db.prepare('SELECT COUNT(*) n FROM bot_users WHERE active=1').get().n};
 }
 if(path==='/api/broadcasts'&&method==='GET'){
  cleanup(db);
  return {items:db.prepare("SELECT id,state,created FROM bot_broadcasts WHERE actor=? AND state!='preview' ORDER BY created DESC,rowid DESC LIMIT 10").all(actor).map(batch=>({...batch,counts:Object.fromEntries(db.prepare('SELECT state,COUNT(*) n FROM bot_broadcast_recipients WHERE batch_id=? GROUP BY state').all(batch.id).map(r=>[r.state,r.n]))}))};
 }
 if(path==='/api/broadcasts/prepare'&&method==='POST'){
  const message=text(b.text);let recipients;
  if(b.all===true){
   if(b.chat_ids!==undefined)fail(400,'Barchasi yoki tanlovdan bittasini tanlang');
   recipients=db.prepare(labelQuery+' WHERE u.active=1 ORDER BY u.chat_id LIMIT 1001').all();
  }else{
   if(!Array.isArray(b.chat_ids)||!b.chat_ids.length||b.chat_ids.length>1000||b.chat_ids.some(v=>!validId(v))||new Set(b.chat_ids).size!==b.chat_ids.length)fail(400,'1–1000 ta foydalanuvchini tanlang');
   recipients=b.chat_ids.map(chat=>db.prepare(labelQuery+' WHERE u.chat_id=? AND u.active=1').get(chat));
   if(recipients.some(r=>!r))fail(409,'Foydalanuvchi o‘chirilgan yoki botni bloklagan. Ro‘yxatni yangilang');
  }
  if(!recipients.length)fail(400,'Xabar oluvchi yo‘q');
  if(recipients.length>1000)fail(400,'Bir navbatda 1000 tagacha. Ro‘yxatdan tanlab yuboring');
  const id=randomUUID(),expires=now()+600;
  cleanup(db);db.exec('BEGIN IMMEDIATE');
  try{
   db.prepare('INSERT INTO bot_broadcasts(id,actor,body_hash,recipient_count,expires,created) VALUES(?,?,?,?,?,?)').run(id,actor,hash(message),recipients.length,expires,now());
   const insert=db.prepare('INSERT INTO bot_broadcast_recipients(batch_id,chat_id,user_version,user_identity) VALUES(?,?,?,?)');
   for(const r of recipients)insert.run(id,r.chat_id,r.version,r.identity);
   db.exec('COMMIT');
  }catch(e){db.exec('ROLLBACK');throw e;}
  return {id,text:message,expires_in:600,recipients:recipients.map(r=>({chat_id:r.chat_id,full_name:r.full_name||'Bot foydalanuvchisi'}))};
 }
 if(path==='/api/broadcasts/send'&&method==='POST'){
  if(!config.botToken)fail(503,'Bot tokeni sozlanmagan');
  if(b.confirm!==true)fail(400,'Yuborishni tasdiqlang');
  const message=text(b.text);
  db.exec('BEGIN IMMEDIATE');
  try{
   const batch=db.prepare('SELECT * FROM bot_broadcasts WHERE id=? AND actor=?').get(String(b.id||''),actor);
   if(!batch||batch.body_hash!==hash(message))fail(409,'Xabar yoki tasdiqlash noto‘g‘ri');
   // Repeated confirmation returns the same queue; never creates duplicate sends.
   if(batch.state==='preview'){
    if(batch.expires<now())fail(409,'Tasdiqlash eskirgan. Qayta tekshiring');
    const invalid=db.prepare("SELECT COUNT(*) n FROM bot_broadcast_recipients r LEFT JOIN bot_users u ON u.chat_id=r.chat_id WHERE r.batch_id=? AND (u.chat_id IS NULL OR u.active!=1 OR u.version!=r.user_version OR u.identity!=r.user_identity)").get(batch.id).n;
    const count=db.prepare('SELECT COUNT(*) n FROM bot_broadcast_recipients WHERE batch_id=?').get(batch.id).n;
    // Cascade deletion must invalidate the whole preview, not silently shrink it.
    if(invalid||count!==Number(batch.recipient_count))fail(409,'Qabul qiluvchilar o‘zgargan. Qayta tekshiring');
    db.prepare("UPDATE bot_broadcast_recipients SET state='queued' WHERE batch_id=?").run(batch.id);
    db.prepare("UPDATE bot_broadcasts SET state='queued',text=? WHERE id=?").run(message,batch.id);
   }
   db.exec('COMMIT');return {ok:true,id:batch.id};
  }catch(e){db.exec('ROLLBACK');throw e;}
 }
 const match=path.match(/^\/api\/broadcasts\/([a-f0-9-]{36})$/);
 if(match&&method==='GET'){
  cleanup(db);
  const batch=db.prepare('SELECT id,state,created FROM bot_broadcasts WHERE id=? AND actor=?').get(match[1],actor);
  if(!batch)fail(404,'Xabar navbati topilmadi');
  const counts=Object.fromEntries(db.prepare('SELECT state,COUNT(*) n FROM bot_broadcast_recipients WHERE batch_id=? GROUP BY state').all(batch.id).map(r=>[r.state,r.n]));
  return {...batch,counts};
 }
 return undefined;
}

export function recoverBroadcasts(DB){DB.sqlite.exec("UPDATE bot_broadcast_recipients SET state='unknown' WHERE state='sending'");cleanup(DB.sqlite);}

export async function flushBroadcasts(DB,api,signal,{pause=()=>delay(60,undefined,{signal}).catch(()=>{})}={}){
 const db=DB.sqlite;
 const rows=db.prepare("SELECT r.*,b.text FROM bot_broadcast_recipients r JOIN bot_broadcasts b ON b.id=r.batch_id WHERE r.state='queued' AND b.state='queued' AND r.next_attempt<=? ORDER BY b.created,r.chat_id LIMIT 20").all(now());
 for(const r of rows){
  if(signal?.aborted)break;
  const user=db.prepare('SELECT * FROM bot_users WHERE chat_id=?').get(r.chat_id);
  if(!user||!user.active||user.version!==r.user_version||user.identity!==r.user_identity){db.prepare("UPDATE bot_broadcast_recipients SET state='changed' WHERE batch_id=? AND chat_id=?").run(r.batch_id,r.chat_id);continue;}
  const claimed=db.prepare("UPDATE bot_broadcast_recipients SET state='sending' WHERE batch_id=? AND chat_id=? AND state='queued'").run(r.batch_id,r.chat_id);
  if(!claimed.changes)continue;
  let state='sent';
  try{await api('sendMessage',{chat_id:r.chat_id,text:r.text},signal);}catch(e){
   if(e.rejected&&e.code===429&&e.retryAfter>0&&e.retryAfter<=3600){db.prepare("UPDATE bot_broadcast_recipients SET state='queued',next_attempt=? WHERE batch_id=? AND chat_id=?").run(now()+e.retryAfter,r.batch_id,r.chat_id);return e.retryAfter;}
   state=e.rejected?'failed':'unknown';
   if(e.rejected&&e.code===403)db.prepare('UPDATE bot_users SET active=0,version=version+1 WHERE chat_id=? AND identity=?').run(r.chat_id,r.user_identity);
  }
  db.prepare('UPDATE bot_broadcast_recipients SET state=? WHERE batch_id=? AND chat_id=?').run(state,r.batch_id,r.chat_id);
  await pause();
 }
 cleanup(db);return 0;
}
