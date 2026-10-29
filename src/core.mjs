import { adminPage, joinPage } from './ui.mjs';
const enc=new TextEncoder(), now=()=>Math.floor(Date.now()/1000);
const id=()=>crypto.randomUUID();
const hex=b=>Array.from(new Uint8Array(b),x=>x.toString(16).padStart(2,'0')).join('');
const bytes=s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
const json=(v,status=200)=>new Response(JSON.stringify(v),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
function fail(status,message){throw Object.assign(new Error(message),{status})}
const digest=async s=>hex(await crypto.subtle.digest('SHA-256',enc.encode(s)));
function equal(a,b){if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;let n=0;for(let i=0;i<a.length;i++)n|=a.charCodeAt(i)^b.charCodeAt(i);return n===0}
async function hmac(key,s){const k=await crypto.subtle.importKey('raw',key,{name:'HMAC',hash:'SHA-256'},false,['sign']);return hex(await crypto.subtle.sign('HMAC',k,enc.encode(s)))}
function text(v,n=120){if(typeof v!=='string'||!v.trim()||v.trim().length>n||/[\u0000-\u001f]/.test(v))fail(400,'Matn noto‘g‘ri');return v.trim()}
function phone(v){const s=String(v??'').replace(/[\s()-]/g,'');if(s&&!/^\+998\d{9}$/.test(s))fail(400,'Telefon: +998 va 9 ta raqam');return s}
function integer(v){if(!Number.isInteger(v)||v<1)fail(400,'Versiya noto‘g‘ri');return v}
function grade(v){if(v===''||v==null)return null;const g=Number(v);if(!Number.isInteger(g)||g<1||g>11)fail(400,'Sinf 1–11 bo‘lishi kerak');return g}
function status(v){if(!['pending','active','lead','inactive'].includes(v))fail(400,'Holat noto‘g‘ri');return ({pending:'pending_current',active:'current',lead:'new_lead',inactive:'testing_only'})[v]}
function hydrate(row){if(!row)return row;const r={...row};if('display_name' in r){r.full_name=r.display_name;r.telegram_id=r.telegram_chat_id;r.consent=r.chat_verified?r.consent:0;}if('id' in r)r.id=String(r.id);if('parent_id' in r)r.parent_id=String(r.parent_id);if('status' in r)r.status=({pending_current:'pending',current:'active',new_lead:'lead',testing_only:'inactive'})[r.status]||r.status;return r}
const stamp=()=>new Date().toISOString();
const first=async(env,sql,...args)=>hydrate(await env.DB.prepare(sql).bind(...args).first());
const run=(env,sql,...args)=>env.DB.prepare(sql).bind(...args).run();
const all=async(env,sql,...args)=>(await env.DB.prepare(sql).bind(...args).all()).results.map(hydrate);
export async function authenticate(request,env,net=fetch){
 const domain=env.CF_ACCESS_TEAM_DOMAIN;
 if(!domain||!env.CF_ACCESS_AUD||!/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(domain))fail(503,'Cloudflare Access sozlamalari to‘ldirilmagan');
 const raw=request.headers.get('Cf-Access-Jwt-Assertion')||'';
 try {
  const parts=raw.split('.');if(parts.length!==3)throw Error();
  const header=JSON.parse(new TextDecoder().decode(bytes(parts[0]))),claim=JSON.parse(new TextDecoder().decode(bytes(parts[1])));
  if(header.alg!=='RS256'||claim.iss!=='https://'+domain||!Array.isArray(claim.aud)||!claim.aud.includes(env.CF_ACCESS_AUD)||!Number.isFinite(claim.exp)||claim.exp<=now()||!Number.isFinite(claim.iat)||claim.iat>now()+30||(claim.nbf&&claim.nbf>now()+30)||!claim.sub||!claim.email)throw Error();
  const response=await net('https://'+domain+'/cdn-cgi/access/certs',{signal:AbortSignal.timeout(8000)});
  if(!response.ok)fail(503,'Access kalitlarini tekshirib bo‘lmadi');
  const keys=await response.json(),jwk=keys.keys?.find(k=>k.kid===header.kid&&k.kty==='RSA');
  if(!jwk)throw Error();
  const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
  if(!await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,bytes(parts[2]),enc.encode(parts[0]+'.'+parts[1])))throw Error();
  return String(claim.sub);
 }catch(e){if(e.status===503)throw e;fail(401,'Admin sifatida kiring')}
}
export async function verifyTelegram(auth,token){
 if(!token)fail(503,'Telegram bot sozlanmagan');
 if(!auth||typeof auth!=='object'||Array.isArray(auth))fail(401,'Telegram tasdig‘i kerak');
 const fields=['id','first_name','last_name','username','photo_url','auth_date','hash'];
 if(Object.keys(auth).some(k=>!fields.includes(k)))fail(401,'Telegram tasdig‘i noto‘g‘ri');
 const date=Number(auth.auth_date),tid=String(auth.id);
 if(!/^[1-9]\d{0,15}$/.test(tid)||!Number.isInteger(date)||date>now()+30||now()-date>300||!/^[a-f0-9]{64}$/.test(auth.hash||''))fail(401,'Telegram tasdig‘i eskirgan yoki noto‘g‘ri');
 const data=Object.keys(auth).filter(k=>k!=='hash').sort().map(k=>k+'='+String(auth[k])).join('\n');
 const secret=await crypto.subtle.digest('SHA-256',enc.encode(token));
 if(!equal(await hmac(secret,data),auth.hash))fail(401,'Telegram imzosi noto‘g‘ri');
 return {id:tid,username:String(auth.username||'').slice(0,64)};
}
function messageText(v){if(typeof v!=='string'||!v.trim()||v.trim().length>3500||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v))fail(400,'Xabar noto‘g‘ri');return v.trim()}
function originCheck(request){
 if(request.headers.get('Origin')!==new URL(request.url).origin||request.headers.get('Sec-Fetch-Site')==='cross-site')fail(403,'So‘rov manbasi noto‘g‘ri');
 if(!(request.headers.get('Content-Type')||'').startsWith('application/json'))fail(415,'JSON kerak');
}
async function readBody(request){
 if(Number(request.headers.get('Content-Length'))>32768)fail(413,'So‘rov juda katta');
 const reader=request.body?.getReader();if(!reader)fail(400,'Ma’lumot kerak');
 let size=0,chunks=[];for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>32768){await reader.cancel();fail(413,'So‘rov juda katta')}chunks.push(value)}
 const joined=new Uint8Array(size);let off=0;for(const c of chunks){joined.set(c,off);off+=c.length}
 try{return JSON.parse(new TextDecoder().decode(joined))}catch{fail(400,'JSON noto‘g‘ri')}
}
function html(body,publicPage=false){
 const csp="default-src 'none'; script-src 'unsafe-inline' https://telegram.org; style-src 'unsafe-inline'; connect-src 'self'; frame-src https://oauth.telegram.org; img-src 'self' https://telegram.org; form-action 'self'; base-uri 'none'; frame-ancestors 'none'";
 return new Response(body,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':csp,'Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Permissions-Policy':'camera=(), microphone=(), geolocation=()'}});
}
async function parent(env,pid){const p=await first(env,'SELECT * FROM parents WHERE id=? AND archived=0',pid);if(!p)fail(404,'Ota-ona topilmadi');return p}
export function createWorker(net=fetch,authorize=authenticate){return {async fetch(request,env){
 try {
  if(!env.DB)fail(503,'DB binding sozlanmagan');
  const url=new URL(request.url),path=url.pathname,method=request.method;
  if(env.LOCAL_MODE && (['/api/register','/api/link','/join','/api/telegram/registration-menu','/api/schema'].includes(path)||path.endsWith('/admin-menu')))fail(404,'Mahalliy serverda bu yo‘l ishlatilmaydi');
  if(path==='/health'&&method==='GET')return json({service:'mathup-admin',version:'2.0.0',status:'up'});
  if(path==='/join'&&method==='GET'){
   if(!/^[A-Za-z0-9_]{5,32}$/.test(env.TELEGRAM_BOT_USERNAME||''))fail(503,'Telegram bot nomi sozlanmagan');
   return html(joinPage(env.TELEGRAM_BOT_USERNAME,env.PUBLIC_REGISTRATION_ENABLED==='true'),true);
  }
  const publicRoute=['/api/register','/api/link'].includes(path);
  let actor;
  if(!publicRoute)actor=await authorize(request,env,net);
  if(path==='/'&&method==='GET')return html(adminPage);
  let b;
  if(['POST','PATCH','DELETE'].includes(method)){originCheck(request);b=await readBody(request)}
  if(path==='/api/telegram/registration-menu'&&method==='POST'){
   if(b.confirm!==true)fail(400,'Bot menyusini sozlashni tasdiqlang');
   if(env.PUBLIC_REGISTRATION_ENABLED!=='true')fail(503,'Avval ota-onalar ro‘yxatdan o‘tishini yoqing');
   if(!env.TELEGRAM_BOT_TOKEN)fail(503,'Telegram bot tokeni sozlanmagan');
   const callTelegram=async(method,body)=>{try{const response=await net('https://api.telegram.org/bot'+env.TELEGRAM_BOT_TOKEN+'/'+method,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(8000)});const data=await response.json();if(!response.ok||data.ok!==true)fail(502,'Telegram menyu sozlamasini qabul qilmadi');return data.result}catch(e){if(e.status)throw e;fail(502,'Telegram javobini tekshirib bo‘lmadi. Bot menyusini tekshiring')}};
   const previous=await callTelegram('getChatMenuButton',{}),menu_button={type:'web_app',text:'Ro‘yxatdan o‘tish',web_app:{url:url.origin+'/join'}};
   await callTelegram('setChatMenuButton',{menu_button});
   const current=await callTelegram('getChatMenuButton',{});
   if(current?.type!=='web_app'||current.text!==menu_button.text||current.web_app?.url!==menu_button.web_app.url)fail(502,'Menyu holati tasdiqlanmadi. Botni tekshiring');
   return json({ok:true,previous,current,message:'Botdagi «Ro‘yxatdan o‘tish» menyusi yoqildi. Shaxsiy admin tugmasi saqlanadi.'});
  }
  if(path==='/api/schema'&&method==='GET')return json({tables:await all(env,"SELECT name,sql FROM sqlite_master WHERE type='table' AND name IN ('parents','students','parents','students')"),note:'Eski parents/students nusxalanmaydi. Migratsiyadan oldin sxemani solishtiring.'});
  if(path==='/api/parents'&&method==='GET'){
   const offset=Math.max(0,Math.min(Math.floor(Number(url.searchParams.get('offset'))||0),100000));
   const q=(url.searchParams.get('q')||'').trim().slice(0,120),filter=url.searchParams.get('status')||'';
   let where='p.archived=0',args=[];
   if(q){where+=' AND (instr(lower(p.display_name),lower(?))>0 OR instr(p.phone,?)>0 OR EXISTS(SELECT 1 FROM students s WHERE s.parent_id=p.id AND s.archived=0 AND instr(lower(s.full_name),lower(?))>0))';args.push(q,q,q)}
   if(filter){where+=' AND EXISTS(SELECT 1 FROM students s WHERE s.parent_id=p.id AND s.archived=0 AND s.status=?)';args.push(status(filter))}
   return json({items:await all(env,'SELECT p.*,(SELECT COUNT(*) FROM students family WHERE family.parent_id=p.id) AS student_count FROM parents p WHERE '+where+' ORDER BY p.created_at DESC,p.id LIMIT 51 OFFSET ?',...args,offset)});
  }
  if(path==='/api/parents'&&method==='POST'){
   const key='manual:'+id(),n=stamp();await run(env,'INSERT INTO parents(identity_key,display_name,phone,created_at,updated_at) VALUES(?,?,?,?,?)',key,text(b.full_name),phone(b.phone),n,n);return json(await first(env,'SELECT * FROM parents WHERE identity_key=?',key),201);
  }
  let match=path.match(/^\/api\/parents\/([1-9][0-9]{0,12})$/);
  if(match&&method==='DELETE'){
   if(!env.LOCAL_MODE)fail(404,'Sahifa topilmadi');
   if(b.confirm!==true)fail(400,'Ota-onani o‘chirishni tasdiqlang');
   if(!env.DELETE_PARENT)fail(503,'Mahalliy o‘chirish xizmati sozlanmagan');
   return json(env.DELETE_PARENT(match[1],integer(b.version)));
  }
  if(match&&method==='PATCH'){
   const p=await parent(env,match[1]),v=integer(b.version),archived=b.archived===true?1:0;
   const r=await run(env,'UPDATE parents SET display_name=?,phone=?,consent=?,archived=?,version=version+1,updated_at=? WHERE id=? AND version=?',text(b.full_name),phone(b.phone),env.LOCAL_MODE?p.consent:(b.consent===true&&p.consent&&p.telegram_id?1:0),archived,stamp(),p.id,v);
   if(!r.meta.changes)fail(409,'Ma’lumot o‘zgargan. Ro‘yxatni yangilang');
   return json({ok:true});
  }
  if(path==='/api/students'&&method==='GET'){
   const q=(url.searchParams.get('q')||'').trim().slice(0,120),filter=url.searchParams.get('status')||'';
   let where='s.archived=0 AND p.archived=0',args=[];
   if(q){where+=' AND (instr(lower(s.full_name),lower(?))>0 OR instr(lower(p.display_name),lower(?))>0 OR instr(p.phone,?)>0)';args.push(q,q,q)}
   if(filter){where+=' AND s.status=?';args.push(status(filter))}
   let groupFields='';
   if(env.LOCAL_MODE&&env.GROUPS_ENABLED){
    const gid=url.searchParams.get('group_id')||'';
    if(gid==='none')where+=' AND NOT EXISTS(SELECT 1 FROM student_group_members gm WHERE gm.student_id=s.id)';
    else if(gid){if(!/^[1-9]\d{0,12}$/.test(gid))fail(400,'Guruh noto‘g‘ri');if(!await first(env,'SELECT id FROM student_groups_catalog WHERE id=?',gid))fail(404,'Guruh topilmadi');where+=' AND EXISTS(SELECT 1 FROM student_group_members gm WHERE gm.student_id=s.id AND gm.group_id=?)';args.push(gid);}
    groupFields=",(SELECT json_group_array(json_object('id',CAST(g.id AS TEXT),'name',g.name)) FROM student_group_members gm JOIN student_groups_catalog g ON g.id=gm.group_id WHERE gm.student_id=s.id) AS groups_json";
   }
   const offset=Math.max(0,Math.min(Math.floor(Number(url.searchParams.get('offset'))||0),100000));
   return json({items:await all(env,'SELECT s.*,(SELECT COUNT(*) FROM students family WHERE family.parent_id=s.parent_id) AS parent_student_count,p.display_name AS parent_name,p.telegram_chat_id AS parent_telegram_id,p.chat_verified AS parent_chat_verified,p.consent AS parent_consent'+groupFields+' FROM students s JOIN parents p ON p.id=s.parent_id WHERE '+where+' ORDER BY s.created_at DESC,s.id LIMIT 51 OFFSET ?',...args,offset)});
  }
  if(path==='/api/students'&&method==='POST'){
   await parent(env,b.parent_id);const n=stamp();const result=await first(env,'INSERT INTO students(parent_id,full_name,grade,status,created_at,updated_at) VALUES(?,?,?,?,?,?) RETURNING id',b.parent_id,text(b.full_name),grade(b.grade),status(b.status||'pending'),n,n);return json(result,201);
  }
  match=path.match(/^\/api\/students\/([1-9][0-9]{0,12})$/);
  if(match&&method==='DELETE'){
   if(!env.LOCAL_MODE)fail(404,'Sahifa topilmadi');
   if(b.confirm!==true)fail(400,'O‘quvchini o‘chirishni tasdiqlang');
   const version=integer(b.version);
   if(!env.DELETE_STUDENT)fail(503,'Mahalliy o‘chirish xizmati sozlanmagan');
   return json(env.DELETE_STUDENT(match[1],version));
  }
  if(match&&method==='PATCH'){
   await parent(env,b.parent_id);const r=await run(env,'UPDATE students SET parent_id=?,full_name=?,grade=?,status=?,archived=?,version=version+1,updated_at=? WHERE id=? AND version=? AND archived=0',b.parent_id,text(b.full_name),grade(b.grade),status(b.status),b.archived===true?1:0,stamp(),match[1],integer(b.version));
   if(!r.meta.changes)fail(409,'O‘quvchi o‘zgargan yoki topilmadi');return json({ok:true});
  }
  match=path.match(/^\/api\/parents\/([1-9][0-9]{0,12})\/admin-menu$/);
  if(match&&method==='POST'){
   if(b.confirm!==true)fail(400,'Tugmani yoqishni tasdiqlang');
   if(!env.TELEGRAM_BOT_TOKEN)fail(503,'Telegram bot tokeni sozlanmagan');
   const p=await parent(env,match[1]);if(!p.telegram_id||!p.consent)fail(409,'Avval Telegram akkauntini tasdiqlab bog‘lang');
   const callTelegram=async(method,body)=>{try{const response=await net('https://api.telegram.org/bot'+env.TELEGRAM_BOT_TOKEN+'/'+method,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(8000)});const data=await response.json();if(!response.ok||data.ok!==true)fail(502,'Telegram menyu sozlamasini qabul qilmadi');return data.result}catch(e){if(e.status)throw e;fail(502,'Telegram javobini tekshirib bo‘lmadi. Bot chatini tekshiring')}};
   const previous=await callTelegram('getChatMenuButton',{chat_id:p.telegram_id});
   const menu_button={type:'web_app',text:'Admin panel',web_app:{url:url.origin+'/'}};
   await callTelegram('setChatMenuButton',{chat_id:p.telegram_id,menu_button});
   const current=await callTelegram('getChatMenuButton',{chat_id:p.telegram_id});
   if(current?.type!=='web_app'||current.text!==menu_button.text||current.web_app?.url!==menu_button.web_app.url)fail(502,'Tugma holati tasdiqlanmadi. Bot chatini tekshiring');
   return json({ok:true,previous,current,message:'Telegramda «Admin panel» tugmasi yoqildi. Bot chatini qayta oching.'});
  }
  match=path.match(/^\/api\/parents\/([1-9][0-9]{0,12})\/link$/);
  if(match&&method==='POST'){
   const p=await parent(env,match[1]);if(p.telegram_id)fail(409,'Akkaunt allaqachon bog‘langan');
   const token=hex(crypto.getRandomValues(new Uint8Array(32))),hash=await digest(token);
   await env.DB.batch([env.DB.prepare('UPDATE mathup_link_tokens SET used=1 WHERE parent_id=?').bind(p.id),env.DB.prepare('INSERT INTO mathup_link_tokens(hash,parent_id,expires) VALUES(?,?,?)').bind(hash,p.id,now()+1800)]);
   return json({url:env.LOCAL_MODE?'https://t.me/'+env.TELEGRAM_BOT_USERNAME+'?start=link_'+Buffer.from(token,'hex').toString('base64url'):url.origin+'/join#link='+token,expires_in:1800});
  }
  if(path==='/api/link'&&method==='POST'){
   const tg=await verifyTelegram(b.auth,env.TELEGRAM_BOT_TOKEN);
   if(b.consent!==true)fail(400,'Xabarlar uchun rozilik kerak');
   if(!/^[a-f0-9]{64}$/.test(b.token||''))fail(400,'Bog‘lash kodi noto‘g‘ri');
   const hash=await digest(b.token),link=await first(env,'SELECT * FROM mathup_link_tokens WHERE hash=? AND used=0 AND expires>?',hash,now());
   if(!link)fail(409,'Bog‘lash kodi ishlatilgan yoki eskirgan');
   const p=await parent(env,link.parent_id);
   if(p.telegram_id)fail(409,'Akkaunt bog‘langan');
   if(await first(env,'SELECT id FROM parents WHERE telegram_chat_id=?',tg.id))fail(409,'Bu Telegram akkaunti boshqa yozuvga bog‘langan');
   // Compare-and-set plus token condition keeps concurrent link attempts from rebinding.
   const result=await run(env,'UPDATE parents SET telegram_chat_id=?,telegram_username=?,chat_verified=1,consent=1,version=version+1,updated_at=? WHERE id=? AND (telegram_chat_id IS NULL OR length(telegram_chat_id)=0) AND archived=0 AND EXISTS(SELECT 1 FROM mathup_link_tokens WHERE hash=? AND used=0 AND expires>?)',tg.id,tg.username,stamp(),p.id,hash,now());
   if(!result.meta.changes)fail(409,'Kod eskirgan yoki akkaunt bog‘langan');
   await run(env,'UPDATE mathup_link_tokens SET used=1 WHERE hash=?',hash);return json({ok:true});
  }
  if(path==='/api/register'&&method==='POST'){
   if(env.PUBLIC_REGISTRATION_ENABLED!=='true')fail(503,'Ommaviy ro‘yxat hali yoqilmagan');
   const tg=await verifyTelegram(b.auth,env.TELEGRAM_BOT_TOKEN);
   if(b.consent!==true)fail(400,'Ma’lumot saqlashga rozilik kerak');
   if(!/^[a-f0-9-]{36}$/.test(b.request_id||''))fail(400,'So‘rov ID noto‘g‘ri');
   const existing=await first(env,'SELECT telegram_id FROM mathup_registrations WHERE id=?',b.request_id);
   if(existing){if(existing.telegram_id!==tg.id)fail(409,'So‘rov ID band');return json({ok:true,replayed:true})}
   const current=await first(env,'SELECT archived FROM parents WHERE telegram_chat_id=?',tg.id);if(current?.archived)fail(409,'Ma’muriyatga murojaat qiling');
   const name=text(b.full_name),child=text(b.student_name),tel=phone(b.phone),g=grade(b.grade);
   if(g===null)fail(400,'Sinfni 1–11 orasida kiriting');
   if(!tel)fail(400,'Telefon raqami kerak');
   const recent=await first(env,'SELECT COUNT(*) AS n FROM mathup_registrations WHERE telegram_id=? AND created_at>?',tg.id,now()-86400);
   if(recent.n>=5)fail(429,'Bugungi ro‘yxat limiti tugadi');
   const pid=id(),sid=id(),n=now();
   // Atomic D1 transaction. The duplicate request must roll back every write.
   await env.DB.batch([
    env.DB.prepare('INSERT INTO parents(identity_key,display_name,phone,telegram_chat_id,telegram_username,chat_verified,consent,created_at,updated_at) VALUES(?,?,?,?,?,1,?,?,?) ON CONFLICT(telegram_chat_id) WHERE telegram_chat_id IS NOT NULL AND telegram_chat_id!=\'\' DO NOTHING').bind('telegram:'+tg.id,name,tel,tg.id,tg.username,b.message_consent===true?1:0,stamp(),stamp()),
    env.DB.prepare('INSERT INTO mathup_registrations(id,telegram_id,parent_id,created_at) SELECT ?,?,id,? FROM parents WHERE telegram_chat_id=?').bind(b.request_id,tg.id,n,tg.id),
    env.DB.prepare("INSERT INTO students(parent_id,full_name,grade,status,created_at,updated_at) SELECT id,?,?,'pending_current',?,? FROM parents WHERE telegram_chat_id=? AND archived=0 ON CONFLICT(parent_id,full_name) DO NOTHING").bind(child,g,stamp(),stamp(),tg.id)
   ]);
   return json({ok:true},201);
  }
  if(path==='/api/messages/prepare'&&method==='POST'){
   const message=messageText(b.text);let pids=b.parent_ids,studentSelection;
   if(b.student_ids!==undefined){
    if(b.parent_ids!==undefined||!Array.isArray(b.student_ids)||!b.student_ids.length||b.student_ids.length>100||new Set(b.student_ids.map(String)).size!==b.student_ids.length)fail(400,'1–100 ta o‘quvchini tanlang');
    studentSelection=[];
    for(const sid of b.student_ids){if(!/^[1-9][0-9]{0,12}$/.test(String(sid)))fail(400,'O‘quvchi ID noto‘g‘ri');const s=await first(env,'SELECT s.id,s.parent_id,s.version FROM students s JOIN parents p ON p.id=s.parent_id WHERE s.id=? AND s.archived=0 AND p.archived=0',String(sid));if(!s)fail(409,'Tanlangan o‘quvchi topilmadi; ro‘yxatni yangilang');studentSelection.push({id:s.id,parent_id:s.parent_id,version:s.version});}
    pids=[...new Set(studentSelection.map(s=>s.parent_id))];
   }
   if(!Array.isArray(pids)||!pids.length||pids.length>20||new Set(pids).size!==pids.length)fail(400,'1–20 ta ota-onani tanlang');
   const parents=[];for(const pid of pids){const p=await parent(env,pid);if(!p.telegram_id||!p.chat_verified||(!env.LOCAL_MODE&&!p.consent))fail(409,'Ota-onaning Telegram akkaunti tasdiqlab bog‘lanmagan');parents.push(p)}
   const batch=id(),hash=await digest(studentSelection?JSON.stringify({text:message,students:studentSelection}):message),expires=now()+600;
   await run(env,'DELETE FROM mathup_deliveries WHERE expires<?',now()-86400);
   await env.DB.batch(parents.map(p=>env.DB.prepare('INSERT INTO mathup_deliveries(batch_id,parent_id,telegram_id,parent_version,actor,body_hash,expires) VALUES(?,?,?,?,?,?,?)').bind(batch,p.id,p.telegram_id,p.version,actor,hash,expires)));
   return json({batch_id:batch,expires_in:600,text:message,...(studentSelection?{student_selection:studentSelection}:{}),recipients:parents.map(p=>({id:p.id,full_name:p.full_name}))});
  }
  if(path==='/api/messages/send'&&method==='POST'){
   if(!env.TELEGRAM_BOT_TOKEN)fail(503,'Telegram bot tokeni sozlanmagan');
   if(b.confirm!==true)fail(400,'Yuborishni tasdiqlang');
   const message=messageText(b.text),studentSelection=b.student_selection;
   if(studentSelection!==undefined&&(!Array.isArray(studentSelection)||!studentSelection.length||studentSelection.length>100||studentSelection.some(s=>!s||typeof s.id!=='string'||typeof s.parent_id!=='string'||!Number.isInteger(s.version))))fail(400,'O‘quvchilar tasdig‘i noto‘g‘ri');
   const hash=await digest(studentSelection?JSON.stringify({text:message,students:studentSelection}):message);
   const rows=await all(env,'SELECT * FROM mathup_deliveries WHERE batch_id=? AND actor=?',b.batch_id,actor);
   if(!rows.length||rows.some(r=>r.body_hash!==hash||r.expires<now()))fail(409,'Tasdiqlash eskirgan yoki xabar o‘zgargan');
   if(studentSelection){for(const snapshot of studentSelection){const current=await first(env,'SELECT id,parent_id,version FROM students WHERE id=? AND archived=0',snapshot.id);if(!current||current.parent_id!==snapshot.parent_id||current.version!==snapshot.version)fail(409,'O‘quvchi ma’lumotlari o‘zgargan. Qabul qiluvchilarni qayta tekshiring');}}
   const results=[];
   for(const r of rows){
    const p=await first(env,'SELECT * FROM parents WHERE id=?',r.parent_id);
    if(!p||p.archived||!p.chat_verified||(!env.LOCAL_MODE&&!p.consent)||p.telegram_id!==r.telegram_id||p.version!==r.parent_version){results.push({parent_id:r.parent_id,status:'changed'});continue}
    const claim=await run(env,"UPDATE mathup_deliveries SET state='sending' WHERE batch_id=? AND parent_id=? AND state='prepared' AND NOT EXISTS(SELECT 1 FROM json_each(?) j LEFT JOIN students s ON s.id=json_extract(j.value,'$.id') WHERE s.id IS NULL OR s.archived!=0 OR s.parent_id!=json_extract(j.value,'$.parent_id') OR s.version!=json_extract(j.value,'$.version'))",r.batch_id,r.parent_id,JSON.stringify(studentSelection||[]));
    if(!claim.meta.changes){results.push({parent_id:r.parent_id,status:r.state==='prepared'?'changed':r.state});continue}
    let state='unknown';
    try {
     const response=await net('https://api.telegram.org/bot'+env.TELEGRAM_BOT_TOKEN+'/sendMessage',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:r.telegram_id,text:message}),signal:AbortSignal.timeout(8000)});
     const result=await response.json();state=response.ok&&result.ok?'sent':result.ok===false?'failed':'unknown';
    }catch{}
    await run(env,'UPDATE mathup_deliveries SET state=? WHERE batch_id=? AND parent_id=?',state,r.batch_id,r.parent_id);
    results.push({parent_id:r.parent_id,status:state});
   }
   return json({results,note:'sent — Telegram qabul qildi; o‘qilganini bildirmaydi. unknown — qayta yuborishdan oldin tekshiring.'});
  }
  fail(404,'Sahifa topilmadi');
 }catch(e){if(/UNIQUE constraint failed/.test(e.message||''))return json({error:'Bunday yozuv allaqachon mavjud'},409);return json({error:e.status?e.message:'So‘rov bajarilmadi. Sozlamalar yoki bazani tekshiring.'},e.status||500)}
}}}
export default createWorker();
