import assert from 'node:assert/strict';
import {openDatabase} from '../src/database.mjs';
import {deleteStudent,deleteParent,ensureAudience} from '../src/local-data.mjs';
import {broadcastRoute,flushBroadcasts,recoverBroadcasts} from '../src/broadcast.mjs';
import {createBotEngine} from '../src/bot-engine.mjs';
import {createLocalServer} from '../src/server.mjs';
import {passwordRecord} from '../src/auth.mjs';
import {Script} from 'node:vm';
import {runPolling} from '../src/poller.mjs';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

export async function runBroadcastSuite(){
 let passed=0;const test=async(name,fn)=>{await fn();passed++;console.log('PASS',name);};
 const DB=openDatabase(),db=DB.sqlite,config={audience:'all',adminTelegramIds:[],port:8787,botUsername:'SyntheticMathUPBot',botToken:'SYNTHETIC',publicRegistrationEnabled:true};
 const engine=createBotEngine(DB,config);let uid=50000;
 const start=(id,text='/start')=>engine({update_id:uid++,message:{chat:{type:'private',id:Number(id)},from:{id:Number(id),first_name:'PRIVATE NAME DO NOT STORE',username:'PRIVATE_USERNAME'},text}});
 const route=(path,method='GET',body,actor='test-admin')=>broadcastRoute(DB,path,method,body,actor,config,new URL('http://127.0.0.1:8787'+path));
 const prepare=ids=>route('/api/broadcasts/prepare','POST',{text:'SYNTHETIC ANNOUNCEMENT\nhttps://example.invalid',chat_ids:ids});
 const queue=p=>route('/api/broadcasts/send','POST',{id:p.id,text:p.text,confirm:true});
 const expect=(fn,status)=>assert.throws(fn,e=>e.status===status);
 const flush=api=>flushBroadcasts(DB,api,undefined,{pause:async()=>{}});
 try{
  await test('Unregistered private bot users are tracked without copying Telegram names or usernames',()=>{
   start('910000000101');start('910000000102');start('910000000101');
   const users=route('/api/bot-users');assert.equal(users.total,2);assert.equal(users.active,2);assert.equal(users.items[0].parent_id,null);assert.ok(!JSON.stringify(db.prepare('SELECT * FROM bot_users').all()).includes('PRIVATE'));
  });
  await test('Audience admins mode ignores other users and groups are not contacts',()=>{
   createBotEngine(DB,{...config,audience:'admins'} )({update_id:uid++,message:{chat:{type:'private',id:910000000199},from:{id:910000000199},text:'/start'}});
   engine({update_id:uid++,message:{chat:{type:'group',id:-1},from:{id:910000000198},text:'/start'}});assert.equal(route('/api/bot-users').total,2);
  });
  await test('Recipient preview validates selections and stores no message text',()=>{
   for(const ids of [[],['910000000101','910000000101'],['-1'],['910000000999']])expect(()=>prepare(ids),ids.includes('910000000999')?409:400);
   expect(()=>route('/api/broadcasts/prepare','POST',{all:true,chat_ids:['910000000101'],text:'x'}),400);
   const p=prepare(['910000000101']);assert.equal(p.recipients.length,1);assert.equal(db.prepare('SELECT text FROM bot_broadcasts WHERE id=?').get(p.id).text,null);
  });
  let p;
  await test('All-user preview is a fixed snapshot and does not absorb later starters',()=>{
   p=route('/api/broadcasts/prepare','POST',{text:'SYNTHETIC ALL',all:true});assert.equal(p.recipients.length,2);start('910000000103');assert.equal(db.prepare('SELECT COUNT(*) n FROM bot_broadcast_recipients WHERE batch_id=?').get(p.id).n,2);
  });
  await test('Confirmation rejects changed text, missing approval, wrong actor and expired preview',()=>{
   expect(()=>route('/api/broadcasts/send','POST',{id:p.id,text:'CHANGED',confirm:true}),409);
   expect(()=>route('/api/broadcasts/send','POST',{id:p.id,text:p.text}),400);
   expect(()=>route('/api/broadcasts/send','POST',{id:p.id,text:p.text,confirm:true},'other-admin'),409);
   const expired=prepare(['910000000103']);db.prepare('UPDATE bot_broadcasts SET expires=1 WHERE id=?').run(expired.id);expect(()=>queue(expired),409);
  });
  await test('Queue confirmation is idempotent; only frozen recipients receive mocked messages once',async()=>{
   queue(p);queue(p);const sends=[];await flush(async(method,body)=>{sends.push({method,...body});});await flush(async()=>{throw Error('must not resend');});queue(p);
   assert.deepEqual(sends.map(s=>s.chat_id).sort(),['910000000101','910000000102']);assert.ok(sends.every(s=>s.text==='SYNTHETIC ALL'));assert.equal(route('/api/broadcasts/'+p.id).counts.sent,2);assert.equal(db.prepare('SELECT text FROM bot_broadcasts WHERE id=?').get(p.id).text,null);
  });
  await test('Blocking a bot user after preview invalidates confirmation without any send',()=>{
   const p=prepare(['910000000103']);engine({update_id:uid++,my_chat_member:{chat:{type:'private',id:910000000103},new_chat_member:{status:'kicked'}}});expect(()=>queue(p),409);assert.equal(db.prepare('SELECT active FROM bot_users WHERE chat_id=?').get('910000000103').active,0);start('910000000103');assert.equal(db.prepare('SELECT active FROM bot_users WHERE chat_id=?').get('910000000103').active,1);
  });
  await test('Telegram 403 disables the contact and reports a failed delivery',async()=>{
   const p=prepare(['910000000103']);queue(p);await flush(async()=>{throw Object.assign(Error('blocked'),{rejected:true,code:403});});assert.equal(route('/api/broadcasts/'+p.id).counts.failed,1);assert.equal(db.prepare('SELECT active FROM bot_users WHERE chat_id=?').get('910000000103').active,0);
  });
  await test('Known 429 preserves one delayed queue entry without duplicating delivery',async()=>{
   const p=prepare(['910000000101']);queue(p);let calls=0;
   assert.equal(await flush(async()=>{calls++;throw Object.assign(Error('limit'),{rejected:true,code:429,retryAfter:2});}),2);
   await flush(async()=>{calls++;});assert.equal(calls,1);
   db.prepare('UPDATE bot_broadcast_recipients SET next_attempt=0 WHERE batch_id=?').run(p.id);await flush(async()=>{calls++;});assert.equal(calls,2);assert.equal(route('/api/broadcasts/'+p.id).counts.sent,1);
  });
  await test('Unknown network results and interrupted sending states are never automatically retried',async()=>{
   const p=prepare(['910000000102']);queue(p);let calls=0;await flush(async()=>{calls++;throw Error('network uncertainty');});await flush(async()=>{calls++;});assert.equal(calls,1);assert.equal(route('/api/broadcasts/'+p.id).counts.unknown,1);
   const crash=prepare(['910000000101']);queue(crash);db.prepare("UPDATE bot_broadcast_recipients SET state='sending' WHERE batch_id=?").run(crash.id);recoverBroadcasts(DB);await flush(async()=>{calls++;});assert.equal(calls,1);assert.equal(route('/api/broadcasts/'+crash.id).counts.unknown,1);
  });
  await test('Last-child deletion atomically removes parent, linking, registration, pending replies and broadcast contact',()=>{
   db.exec("INSERT INTO parents(identity_key,display_name,telegram_chat_id,chat_verified) VALUES('synthetic-delete-all','SYNTHETIC FAMILY','910000000101',1);INSERT INTO students(parent_id,full_name,status) VALUES(last_insert_rowid(),'SYNTHETIC LAST CHILD','current');");
   const s=db.prepare("SELECT * FROM students WHERE full_name='SYNTHETIC LAST CHILD'").get();
   db.prepare('INSERT INTO mathup_link_tokens(hash,parent_id,expires) VALUES(?,?,?)').run('SYNTHETIC-HASH',s.parent_id,9999999999);
   db.prepare('INSERT INTO mathup_registrations VALUES(?,?,?,?)').run('synthetic-reg-delete','910000000101',s.parent_id,1);
   db.prepare('INSERT INTO mathup_deliveries(batch_id,parent_id,telegram_id,parent_version,actor,body_hash,expires) VALUES(?,?,?,?,?,?,?)').run('synthetic-delivery',s.parent_id,'910000000101',1,'test','hash',9999999999);
   db.prepare('INSERT INTO bot_sessions VALUES(?,?,?,?)').run('910000000101','parent','{}',9999999999);
   const preview=prepare(['910000000101']);const queued=prepare(['910000000101']);queue(queued);
   const result=deleteStudent(DB,s.id,s.version);assert.equal(result.parent_deleted,true);assert.equal(db.prepare('SELECT id FROM parents WHERE id=?').get(s.parent_id),undefined);
   for(const table of ['mathup_link_tokens','mathup_registrations','mathup_deliveries'])assert.equal(db.prepare('SELECT COUNT(*) n FROM '+table+' WHERE parent_id=?').get(s.parent_id).n,0);
   assert.equal(db.prepare('SELECT chat_id FROM bot_users WHERE chat_id=?').get('910000000101'),undefined);assert.equal(db.prepare('SELECT chat_id FROM bot_sessions WHERE chat_id=?').get('910000000101'),undefined);
   assert.equal(db.prepare("SELECT COUNT(*) n FROM bot_outbox WHERE CAST(json_extract(body_json,'$.body.chat_id') AS TEXT)=?").get('910000000101').n,0);
   expect(()=>queue(preview),409);assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
  });
  await test('Deleting one sibling preserves the shared parent; failed cleanup rolls back the whole deletion',()=>{
   db.exec("INSERT INTO parents(identity_key,display_name) VALUES('synthetic-siblings','SYNTHETIC SIBLINGS');INSERT INTO students(parent_id,full_name,status) VALUES(last_insert_rowid(),'SYNTHETIC SIBLING A','current');");
   const a=db.prepare("SELECT * FROM students WHERE full_name='SYNTHETIC SIBLING A'").get();db.prepare("INSERT INTO students(parent_id,full_name,status) VALUES(?,'SYNTHETIC SIBLING B','current')").run(a.parent_id);
   assert.equal(deleteStudent(DB,a.id,a.version).parent_deleted,false);assert.ok(db.prepare('SELECT id FROM parents WHERE id=?').get(a.parent_id));
   const b=db.prepare("SELECT * FROM students WHERE full_name='SYNTHETIC SIBLING B'").get();db.exec("CREATE TRIGGER synthetic_parent_failure BEFORE DELETE ON parents BEGIN SELECT RAISE(ABORT,'synthetic failure');END;");
   assert.throws(()=>deleteStudent(DB,b.id,b.version));assert.ok(db.prepare('SELECT id FROM students WHERE id=?').get(b.id));db.exec('DROP TRIGGER synthetic_parent_failure');
  });
  await test('New start after deletion creates a new contact identity and cannot revive an old preview',()=>{
   start('910000000101');assert.equal(route('/api/bot-users').total,3);const latest=db.prepare('SELECT * FROM bot_users WHERE chat_id=?').get('910000000101');assert.ok(latest.identity);assert.equal(db.prepare('SELECT COUNT(*) n FROM parents WHERE telegram_chat_id=?').get('910000000101').n,0);
  });
  await test('Empty legacy parent can be deleted but a parent with any child cannot be deleted directly',()=>{
   const shared=db.prepare("SELECT * FROM parents WHERE identity_key='synthetic-siblings'").get();expect(()=>deleteParent(DB,shared.id,shared.version),409);
   db.exec("INSERT INTO parents(identity_key,display_name) VALUES('synthetic-empty-parent','SYNTHETIC EMPTY PARENT')");const p=db.prepare("SELECT * FROM parents WHERE identity_key='synthetic-empty-parent'").get();
   expect(()=>deleteParent(DB,p.id,p.version+1),409);assert.equal(deleteParent(DB,p.id,p.version).ok,true);expect(()=>deleteParent(DB,p.id,p.version),404);
  });
  await test('Deletion of one member invalidates the whole multi-recipient preview',()=>{
   const p=prepare(['910000000101','910000000102']);db.prepare('DELETE FROM bot_users WHERE chat_id=?').run('910000000101');expect(()=>queue(p),409);assert.equal(route('/api/broadcasts/'+p.id).state,'preview');start('910000000101');expect(()=>queue(p),409);
  });
  await test('Audience pagination and 1000-recipient limit do not silently truncate an all-user send',()=>{
   const large=openDatabase();try{
    const add=large.sqlite.prepare('INSERT INTO bot_users(chat_id,first_seen,last_seen) VALUES(?,1,1)');large.sqlite.exec('BEGIN');for(let i=1;i<=1001;i++)add.run(String(920000000000+i));large.sqlite.exec('COMMIT');
    const r=(path,method='GET',body)=>{const url=new URL('http://127.0.0.1'+path);return broadcastRoute(large,url.pathname,method,body,'test',config,url);};
    assert.equal(r('/api/bot-users?offset=1000').items.length,1);assert.equal(r('/api/bot-users').items.length,51);expect(()=>r('/api/broadcasts/prepare','POST',{text:'SYNTHETIC LARGE',all:true}),400);
   }finally{large.close();}
  });
  await test('Confirmed queue survives database restart and is delivered by the actual polling loop with a mock API',async()=>{
   const dir=mkdtempSync(join(tmpdir(),'mathup-broadcast-')),path=join(dir,'queue.sqlite');let saved=openDatabase(path);
   try{
    saved.sqlite.prepare('INSERT INTO bot_users(chat_id,first_seen,last_seen) VALUES(?,1,1)').run('910000000888');
    const r=(path,body)=>broadcastRoute(saved,path,'POST',body,'test-admin',config,new URL('http://127.0.0.1'+path));
    const p=r('/api/broadcasts/prepare',{text:'SYNTHETIC PERSISTENT QUEUE',all:true});r('/api/broadcasts/send',{id:p.id,text:p.text,confirm:true});saved.close();saved=openDatabase(path);
    const stop=new AbortController(),sent=[];await runPolling(saved,config,{signal:stop.signal,api:async(method,body)=>{
     if(method==='getMe')return {is_bot:true,username:config.botUsername};if(method==='getWebhookInfo')return {url:''};if(method==='sendMessage'){sent.push(body);return true;}if(method==='getUpdates'){stop.abort();return [];}throw Error('Unexpected method');
    }});assert.equal(sent.length,1);assert.equal(sent[0].text,'SYNTHETIC PERSISTENT QUEUE');assert.equal(saved.sqlite.prepare('SELECT text FROM bot_broadcasts WHERE id=?').get(p.id).text,null);
   }finally{saved.close();rmSync(dir,{recursive:true,force:true});}
  });
  await test('Existing verified local parents are seeded once without importing unverified contacts',()=>{
   const other=openDatabase();try{
    other.sqlite.exec("DELETE FROM bot_state WHERE key='audience-migration-1';INSERT INTO parents(identity_key,display_name,telegram_chat_id,chat_verified) VALUES('synthetic-seed','SYNTHETIC','910000000777',1),('synthetic-no-seed','SYNTHETIC','910000000778',0);");
    ensureAudience(other.sqlite);assert.equal(other.sqlite.prepare('SELECT COUNT(*) n FROM bot_users').get().n,1);other.sqlite.exec('DELETE FROM bot_users');ensureAudience(other.sqlite);assert.equal(other.sqlite.prepare('SELECT COUNT(*) n FROM bot_users').get().n,0);
   }finally{other.close();}
  });
  await test('Local HTTP broadcast API enforces login, origin, JSON and confirmation, and the UI scripts compile',async()=>{
   const {server}=createLocalServer({DB,config:{...config,adminPassword:passwordRecord('Synthetic-broadcast-http-2026')}});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
   const headers={origin:base,'content-type':'application/json'};let cookie='';const call=(path,method='GET',body,extra={})=>fetch(base+path,{method,headers:{...headers,cookie,...extra},body:body===undefined?undefined:JSON.stringify(body)});
   try{
    assert.equal((await call('/api/bot-users')).status,401);assert.equal((await call('/api/broadcasts')).status,401);
    const login=await call('/auth/login','POST',{password:'Synthetic-broadcast-http-2026'});cookie=login.headers.get('set-cookie').split(';')[0];
    assert.equal((await call('/api/broadcasts/prepare','POST',{text:'x',all:true},{origin:'https://other.invalid'})).status,403);
    assert.equal((await call('/api/broadcasts/prepare','POST',{text:'x',all:true},{'content-type':'text/plain'})).status,415);
    assert.equal((await call('/api/broadcasts/prepare','POST',null)).status,400);
    const p=await (await call('/api/broadcasts/prepare','POST',{text:'SYNTHETIC HTTP',chat_ids:['910000000101']})).json();assert.equal((await call('/api/broadcasts/send','POST',{id:p.id,text:p.text})).status,400);
    assert.equal((await call('/api/broadcasts/send','POST',{id:p.id,text:p.text,confirm:true})).status,200);
    const html=await (await call('/')).text();assert.ok(html.includes('botUsersSection'));assert.ok(html.includes('botSendDialog'));for(const [,script] of html.matchAll(/<script>([\s\S]*?)<\/script>/g))new Script(script);
   }finally{await new Promise(r=>server.close(r));}
  });
 }finally{DB.close();}
 return passed;
}
