import {DatabaseSync} from 'node:sqlite';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createWorker,verifyTelegram} from '../src/core.mjs';
const enc=new TextEncoder(), now=()=>Math.floor(Date.now()/1000);
const b64=b=>Buffer.from(b).toString('base64url');
export async function makeHarness(extraNet){
 const sqlite=new DatabaseSync(':memory:');sqlite.exec(await readFile(new URL('../src/schema.sql',import.meta.url),'utf8'));
 const DB={prepare(sql){let values=[];return {bind(...v){values=v;return this},async first(){return sqlite.prepare(sql).get(...values)??null},async all(){return {results:sqlite.prepare(sql).all(...values)}},async run(){const r=sqlite.prepare(sql).run(...values);return {meta:{changes:Number(r.changes)}}}}},async batch(statements){sqlite.exec('BEGIN');try{const result=[];for(const s of statements)result.push(await s.run());sqlite.exec('COMMIT');return result}catch(e){sqlite.exec('ROLLBACK');throw e}}};
 const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
 const jwk=await crypto.subtle.exportKey('jwk',pair.publicKey);jwk.kid='synthetic-key';jwk.alg='RS256';
 const env={DB,CF_ACCESS_TEAM_DOMAIN:'synthetic-team.cloudflareaccess.com',CF_ACCESS_AUD:'synthetic-audience',TELEGRAM_BOT_USERNAME:'MathUP_Gallaorol_Testbot',TELEGRAM_BOT_TOKEN:'SYNTHETIC_TOKEN_NOT_REAL',PUBLIC_REGISTRATION_ENABLED:'true'};
 const sends=[];let behavior='success';
 const net=async(url,options)=>{
  if(url==='https://synthetic-team.cloudflareaccess.com/cdn-cgi/access/certs')return Response.json({keys:[jwk]});
  if(url==='https://api.telegram.org/botSYNTHETIC_TOKEN_NOT_REAL/sendMessage'){
   sends.push(JSON.parse(options.body));if(behavior==='timeout')throw Error('Synthetic timeout');
   if(behavior==='blocked')return Response.json({ok:false,error_code:403},{status:403});
   return Response.json({ok:true,result:{message_id:1}});
  }
  if(extraNet)return extraNet(url,options);
  throw Error('External network is disabled in tests');
 };
 const worker=createWorker(net);
 async function jwt(extra={}){const header=b64(JSON.stringify({alg:'RS256',kid:'synthetic-key'})),claim=b64(JSON.stringify({iss:'https://synthetic-team.cloudflareaccess.com',aud:['synthetic-audience'],sub:'synthetic-admin',email:'admin@example.invalid',iat:now(),exp:now()+600,...extra}));const signature=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',pair.privateKey,enc.encode(header+'.'+claim));return header+'.'+claim+'.'+b64(signature)}
 const token=await jwt();
 async function call(path,method='GET',body,options={}){
  const origin=options.origin||'https://mathup.invalid',headers={'Origin':origin,'Content-Type':'application/json'};
  if(options.auth!==false)headers['Cf-Access-Jwt-Assertion']=options.jwt||token;
  const r=await worker.fetch(new Request('https://mathup.invalid'+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)}),env);
  const type=r.headers.get('Content-Type')||'';const data=type.includes('json')?await r.json():await r.text();return {status:r.status,data,headers:r.headers};
 }
 async function tg(id='910000000001',extra={}){
  const auth={id,first_name:'Synthetic',auth_date:now(),...extra};
  const data=Object.keys(auth).sort().map(k=>k+'='+String(auth[k])).join('\n');
  const secret=await crypto.subtle.digest('SHA-256',enc.encode(env.TELEGRAM_BOT_TOKEN));
  const key=await crypto.subtle.importKey('raw',secret,{name:'HMAC',hash:'SHA-256'},false,['sign']);
  auth.hash=Buffer.from(await crypto.subtle.sign('HMAC',key,enc.encode(data))).toString('hex');return auth;
 }
 return {sqlite,env,worker,call,tg,jwt,token,sends,setBehavior(v){behavior=v}};
}
export async function runSuite(){
 const h=await makeHarness(),{call,tg,sqlite,env}=h,cases=[];
 async function test(name,fn){await fn();cases.push({name,status:'passed'})}
 let parent,student,link,auth=await tg(),batch;
 await test('Admin endpoint rejects unauthenticated requests',async()=>assert.equal((await call('/api/parents','GET',undefined,{auth:false})).status,401));
 await test('Forged Access JWT is rejected',async()=>assert.equal((await call('/api/parents','GET',undefined,{jwt:h.token.slice(0,-12)+'AAAAAAAAAAAA'})).status,401));
 await test('Expired Access JWT is rejected',async()=>assert.equal((await call('/api/parents','GET',undefined,{jwt:await h.jwt({exp:1})})).status,401));
 await test('Wrong Access audience is rejected',async()=>assert.equal((await call('/api/parents','GET',undefined,{jwt:await h.jwt({aud:['other']})})).status,401));
 await test('Cross-origin writes are rejected',async()=>assert.equal((await call('/api/parents','POST',{full_name:'Synthetic'},{origin:'https://other.invalid'})).status,403));
 await test('Invalid phone is rejected',async()=>assert.equal((await call('/api/parents','POST',{full_name:'Synthetic',phone:'123'})).status,400));
 await test('Parent create and list',async()=>{const r=await call('/api/parents','POST',{full_name:'Sinov ota-ona',phone:'+998000000001'});assert.equal(r.status,201);parent=r.data;assert.equal((await call('/api/parents')).data.items.length,1)});
 await test('Parent edit uses optimistic concurrency',async()=>{assert.equal((await call('/api/parents/'+parent.id,'PATCH',{...parent,full_name:'Sinov ota-ona tahrir',consent:true})).status,200);const p=(await call('/api/parents')).data.items[0];assert.equal(p.full_name,'Sinov ota-ona tahrir');assert.equal(p.consent,0);assert.equal((await call('/api/parents/'+parent.id,'PATCH',parent)).status,409);parent=p});
 await test('Student create and edit',async()=>{let r=await call('/api/students','POST',{parent_id:parent.id,full_name:'Ali Sinov',grade:5,status:'pending'});assert.equal(r.status,201);student=(await call('/api/students')).data.items[0];r=await call('/api/students/'+student.id,'PATCH',{...student,grade:6,status:'active'});assert.equal(r.status,200);assert.equal((await call('/api/students')).data.items[0].grade,6)});
 await test('Duplicate student for one parent returns conflict',async()=>assert.equal((await call('/api/students','POST',{parent_id:parent.id,full_name:'Ali Sinov',grade:5,status:'pending'})).status,409));
 await test('Search and status filters preserve existing roster features',async()=>{assert.equal((await call('/api/parents?q=Ali')).data.items.length,1);assert.equal((await call('/api/students?q=Ali&status=active')).data.items.length,1);assert.equal((await call('/api/students?q=Ali&status=lead')).data.items.length,0);assert.equal((await call('/api/parents?q='+encodeURIComponent("%' OR 1=1 --"))).data.items.length,0)});
 await test('Student grade and foreign parent validation',async()=>{assert.equal((await call('/api/students','POST',{parent_id:parent.id,full_name:'Synthetic',grade:12})).status,400);assert.equal((await call('/api/students','POST',{parent_id:crypto.randomUUID(),full_name:'Synthetic',grade:4})).status,404)});
 await test('Unlinked recipients cannot be selected for sending',async()=>assert.equal((await call('/api/messages/prepare','POST',{text:'Sinov',parent_ids:[parent.id]})).status,409));
 await test('Telegram forged signature and stale authorization rejected',async()=>{await assert.rejects(()=>verifyTelegram({...auth,id:'910000000999'},env.TELEGRAM_BOT_TOKEN),e=>e.status===401);await assert.rejects(async()=>verifyTelegram(await tg('910000000005',{auth_date:1}),env.TELEGRAM_BOT_TOKEN),e=>e.status===401)});
 await test('One-time Telegram link creation and consent required',async()=>{const r=await call('/api/parents/'+parent.id+'/link','POST',{});assert.equal(r.status,200);link=r.data.url.split('#link=')[1];assert.equal((await call('/api/link','POST',{token:link,auth,consent:false},{auth:false})).status,400)});
 await test('Telegram link binds only verified identity and blocks replay',async()=>{assert.equal((await call('/api/link','POST',{token:link,auth,consent:true},{auth:false})).status,200);assert.equal((await call('/api/link','POST',{token:link,auth,consent:true},{auth:false})).status,409);parent=(await call('/api/parents')).data.items[0];assert.equal(parent.telegram_id,'910000000001')});
 await test('Duplicate Telegram identity cannot bind to another parent',async()=>{const p=(await call('/api/parents','POST',{full_name:'Ikkinchi sinov'})).data;const token=(await call('/api/parents/'+p.id+'/link','POST',{})).data.url.split('#link=')[1];assert.equal((await call('/api/link','POST',{token,auth,consent:true},{auth:false})).status,409)});
 await test('Expired linking token cannot be used',async()=>{const p=(await call('/api/parents','POST',{full_name:'Expired synthetic'})).data;const token=(await call('/api/parents/'+p.id+'/link','POST',{})).data.url.split('#link=')[1];sqlite.prepare('UPDATE mathup_link_tokens SET expires=1 WHERE parent_id=?').run(p.id);assert.equal((await call('/api/link','POST',{token,auth:await tg('910000000007'),consent:true},{auth:false})).status,409)});
 await test('Free registration saves parent and student atomically; repeated request adds nothing',async()=>{const b={request_id:crypto.randomUUID(),auth:await tg('910000000002'),full_name:'Sinov forma',student_name:'Vali Sinov',phone:'+998000000002',grade:4,consent:true,message_consent:true};assert.equal((await call('/api/register','POST',b,{auth:false})).status,201);const n=sqlite.prepare('SELECT COUNT(*) n FROM students').get().n;assert.equal((await call('/api/register','POST',b,{auth:false})).data.replayed,true);assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM students').get().n,n)});
 await test('Public registration disabled by default configuration',async()=>{env.PUBLIC_REGISTRATION_ENABLED='false';assert.equal((await call('/api/register','POST',{}, {auth:false})).status,503);env.PUBLIC_REGISTRATION_ENABLED='true'});
 await test('Preview has exact selected parent and preserves multiline text',async()=>{const r=await call('/api/messages/prepare','POST',{text:'Birinchi satr\nIkkinchi satr',parent_ids:[parent.id]});assert.equal(r.status,200);batch=r.data;assert.equal(JSON.stringify(batch.recipients.map(p=>p.id)),JSON.stringify([parent.id]));assert.equal(h.sends.length,0)});
 await test('Changed message and missing confirmation cannot send',async()=>{assert.equal((await call('/api/messages/send','POST',{batch_id:batch.batch_id,text:'different',confirm:true})).status,409);assert.equal((await call('/api/messages/send','POST',{batch_id:batch.batch_id,text:batch.text})).status,400);assert.equal(h.sends.length,0)});
 await test('Only selected recipient reaches mocked Telegram; repeating send is deduplicated',async()=>{let r=await call('/api/messages/send','POST',{batch_id:batch.batch_id,text:batch.text,confirm:true});assert.equal(r.data.results[0].status,'sent');assert.equal(JSON.stringify(h.sends.map(s=>s.chat_id)),JSON.stringify(['910000000001']));assert.equal(h.sends[0].text,batch.text);r=await call('/api/messages/send','POST',{batch_id:batch.batch_id,text:batch.text,confirm:true});assert.equal(r.data.results[0].status,'sent');assert.equal(h.sends.length,1)});
 await test('Recipient edit after preview prevents delivery',async()=>{const b=(await call('/api/messages/prepare','POST',{text:'Changed check',parent_ids:[parent.id]})).data;const p=sqlite.prepare('SELECT * FROM parents WHERE id=?').get(parent.id);await call('/api/parents/'+p.id,'PATCH',{...p,full_name:'Changed synthetic',consent:true});const r=await call('/api/messages/send','POST',{batch_id:b.batch_id,text:b.text,confirm:true});assert.equal(r.data.results[0].status,'changed');assert.equal(h.sends.length,1)});
 await test('Telegram blocked response is reported as failed',async()=>{h.setBehavior('blocked');const b=(await call('/api/messages/prepare','POST',{text:'Blocked synthetic',parent_ids:[parent.id]})).data;assert.equal((await call('/api/messages/send','POST',{batch_id:b.batch_id,text:b.text,confirm:true})).data.results[0].status,'failed')});
 await test('Network uncertainty is not retried automatically',async()=>{h.setBehavior('timeout');const b=(await call('/api/messages/prepare','POST',{text:'Timeout synthetic',parent_ids:[parent.id]})).data;assert.equal((await call('/api/messages/send','POST',{batch_id:b.batch_id,text:b.text,confirm:true})).data.results[0].status,'unknown');const n=h.sends.length;await call('/api/messages/send','POST',{batch_id:b.batch_id,text:b.text,confirm:true});assert.equal(h.sends.length,n)});
 await test('Legacy tables are unchanged',async()=>assert.ok(sqlite.prepare("SELECT sql FROM sqlite_master WHERE name='parents'").get().sql.includes('identity_key')));
 await test('No message bodies or raw link tokens stored in DB',async()=>{const tables=sqlite.prepare("SELECT sql FROM sqlite_master WHERE type='table'").all().map(r=>r.sql).join('\n');assert.ok(!tables.includes('message_text'));assert.ok(!sqlite.prepare("SELECT hash FROM mathup_link_tokens").all().some(r=>r.hash===link))});
 await test('Admin UI and join page render with no-store headers',async()=>{const r=await call('/');assert.equal(r.status,200);assert.ok(r.data.includes('MathUP Admin'));assert.equal(r.headers.get('Cache-Control'),'no-store');assert.ok((await call('/join','GET',undefined,{auth:false})).data.includes('telegram-widget.js'))});
 await test('Revoking consent blocks future previews',async()=>{const p=sqlite.prepare('SELECT * FROM parents WHERE id=?').get(parent.id);await call('/api/parents/'+p.id,'PATCH',{...p,full_name:p.display_name,consent:false});assert.equal((await call('/api/messages/prepare','POST',{text:'Sinov',parent_ids:[parent.id]})).status,409)});
 await test('Migration preserves existing parent, child and status',async()=>{const old=new DatabaseSync(':memory:');old.exec(await readFile(new URL('./schema-legacy.sql',import.meta.url),'utf8'));old.exec("INSERT INTO parents(identity_key,display_name) VALUES('synthetic-existing','Existing synthetic');INSERT INTO students(parent_id,full_name,status) VALUES(1,'Existing synthetic child','current');");old.exec(await readFile(new URL('./migration.sql',import.meta.url),'utf8'));assert.equal(old.prepare('SELECT display_name FROM parents WHERE id=1').get().display_name,'Existing synthetic');assert.equal(old.prepare('SELECT parent_id,status FROM students WHERE id=1').get().status,'current');old.close()});
 sqlite.close();return {passed:cases.length,failed:0,real_messages_sent:0,network:'Mock only. No external requests.',cases};
}
