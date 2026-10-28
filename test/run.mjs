import {runDeletionSuite} from './deletion.mjs';
import {runBroadcastSuite} from './broadcast.mjs';
import {plainButtonText} from '../src/button-labels.mjs';
import {runFeatureSuite} from './features.mjs';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Script } from 'node:vm';
import { spawnSync } from 'node:child_process';
import { request as httpRequest } from 'node:http';
import { DatabaseSync, backup } from 'node:sqlite';
import { openDatabase } from '../src/database.mjs';
import { passwordRecord, createAuth } from '../src/auth.mjs';
import { validateConfig } from '../src/config.mjs';
import { createLocalServer } from '../src/server.mjs';
import { createBotEngine } from '../src/bot-engine.mjs';
import { telegramApi, checkBotReady, flushOutbox, runPolling } from '../src/poller.mjs';
import { runSuite } from './legacy.mjs';

let passed=0;
async function test(name,fn){await fn();passed++;console.log('PASS',name);}
const added=await runFeatureSuite();passed+=added;
passed+=await runDeletionSuite();
passed+=await runBroadcastSuite();
const legacy=await runSuite();passed+=legacy.passed;console.log(`PASS ${legacy.passed} existing API regression cases (mock Telegram only)`);
const dir=mkdtempSync(join(tmpdir(),'mathup-tests-'));
const record=passwordRecord('Synthetic-password-2026');
const config={host:'127.0.0.1',port:8787,adminPassword:record,botToken:'',botUsername:'MathUP_SyntheticBot',adminTelegramIds:['910000000001'],audience:'admins',publicRegistrationEnabled:true};

try {
  await test('SQLite survives restart and produces a consistent online backup',async()=>{
    const path=join(dir,'persist.sqlite');let db=openDatabase(path);
    db.sqlite.prepare('INSERT INTO parents(identity_key,display_name) VALUES(?,?)').run('synthetic-persistence','Synthetic parent');
    await backup(db.sqlite,join(dir,'backup.sqlite'));db.close();db=openDatabase(path);
    assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM parents').get().n,1);db.close();
    const snapshot=new DatabaseSync(join(dir,'backup.sqlite'),{readOnly:true});assert.equal(snapshot.prepare('PRAGMA integrity_check').get().integrity_check,'ok');assert.equal(snapshot.prepare('SELECT display_name FROM parents').get().display_name,'Synthetic parent');snapshot.close();
  });
  await test('D1-compatible batch rolls back every statement on failure',()=>{
    const db=openDatabase();assert.throws(()=>db.batch([db.prepare("INSERT INTO parents(identity_key) VALUES('rollback')"),db.prepare("INSERT INTO parents(identity_key) VALUES('rollback')")]));assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM parents').get().n,0);db.close();
  });
  await test('Configuration refuses public binds, invalid ports, missing passwords and bad tokens',()=>{
    assert.equal(validateConfig(config).host,'127.0.0.1');
    for(const patch of [{host:'0.0.0.0'},{port:80},{adminPassword:null},{botToken:'secret'},{adminTelegramIds:['abc']},{audience:'public'},{publicRegistrationEnabled:'true'}])assert.throws(()=>validateConfig({...config,...patch}));
  });
  await test('Password hash has independent salt; no password stored',()=>{
    assert.equal(record.hash.length,64);assert.equal(record.salt.length,32);assert.ok(!JSON.stringify(record).includes('Synthetic-password'));assert.throws(()=>passwordRecord('short'));
  });
  await test('Session expires, logout invalidates it, and repeated bad passwords are limited',()=>{
    let now=0;const a=createAuth(record,{clock:()=>now});
    const login=a.login('Synthetic-password-2026');assert.equal(login.status,200);assert.match(login.cookie,/HttpOnly; SameSite=Strict/);
    const h=new Headers({cookie:login.cookie.split(';')[0]});assert.equal(a.actor(h),'local-admin');now=28800000;assert.equal(a.actor(h),null);
    for(let i=0;i<5;i++)assert.equal(a.login('wrong').status,401);
    assert.equal(a.login('Synthetic-password-2026').status,429);now+=900001;const fresh=a.login('Synthetic-password-2026');const hh=new Headers({cookie:fresh.cookie.split(';')[0]});a.logout(hh);assert.equal(a.actor(hh),null);
  });
  const DB=openDatabase(),local=createLocalServer({DB,config,net:async()=>{throw Error('No external network allowed');}});
  await new Promise(r=>local.server.listen(0,'127.0.0.1',r));
  const base='http://127.0.0.1:'+local.server.address().port;let cookie='';
  const call=async(path,method='GET',body,headers={})=>fetch(base+path,{method,headers:{...(cookie?{cookie}:{}),...(body!==undefined?{'content-type':'application/json',origin:base}:{}),...headers},body:body===undefined?undefined:JSON.stringify(body),redirect:'manual'});
  let parent;
  try {
    await test('Local HTTP guards admin routes; forged Cloudflare header gives no session',async()=>{
      assert.equal((await call('/')).status,302);assert.equal((await call('/api/parents')).status,401);assert.equal((await call('/api/parents','GET',undefined,{'Cf-Access-Jwt-Assertion':'forged'})).status,401);assert.equal((await call('/health')).status,200);
    });
    await test('Host and cross-origin writes are rejected',async()=>{
      const status=await new Promise((resolve,reject)=>{const req=httpRequest(base+'/health',{headers:{Host:'attacker.invalid'}},res=>{res.resume();resolve(res.statusCode);});req.on('error',reject);req.end();});
      assert.equal(status,421);assert.equal((await call('/auth/login','POST',{password:'Synthetic-password-2026'},{Origin:'https://other.invalid'})).status,403);
    });
    await test('Login rejects malformed JSON and oversized bodies',async()=>{
      assert.equal((await fetch(base+'/auth/login',{method:'POST',headers:{origin:base,'content-type':'application/json'},body:'{'})).status,400);
      assert.equal((await call('/auth/login','POST',{password:'x'.repeat(33000)})).status,413);
    });
    await test('Local login sets an HttpOnly cookie and admits admin UI',async()=>{
      const r=await call('/auth/login','POST',{password:'Synthetic-password-2026'});assert.equal(r.status,200);cookie=r.headers.get('set-cookie').split(';')[0];
      const html=await (await call('/')).text();assert.match(html,/MathUP Admin/);assert.ok(!html.includes('registrationMenu'));assert.ok(!html.includes('Admin panel tugmasi'));
      for(const [,source] of html.matchAll(/<script>([\s\S]*?)<\/script>/g))new Script(source);
      const loginHtml=await (await call('/login')).text();for(const [,source] of loginHtml.matchAll(/<script>([\s\S]*?)<\/script>/g))new Script(source);
    });
    await test('Local parent and student CRUD share the persistent SQLite adapter',async()=>{
      let r=await call('/api/parents','POST',{full_name:'SYNTHETIC LOCAL',phone:'+998000000001'});assert.equal(r.status,201);parent=await r.json();
      r=await call('/api/students','POST',{parent_id:parent.id,full_name:'SYNTHETIC CHILD',grade:5});assert.equal(r.status,201);
      let child=(await (await call('/api/students')).json()).items[0];assert.equal(child.status,'pending');
      assert.equal((await call('/api/students/'+child.id,'PATCH',{...child,grade:6,status:'active'})).status,200);
      assert.equal((await call('/api/parents/'+parent.id,'PATCH',{...parent,full_name:'EDITED LOCAL',consent:true})).status,200);
      assert.equal((await call('/api/parents/'+parent.id,'PATCH',parent)).status,409);parent=(await (await call('/api/parents')).json()).items[0];assert.equal(parent.consent,0);
    });
    await test('Telegram link uses a canonical short deep-link payload; no raw token in database',async()=>{
      const link=await (await call('/api/parents/'+parent.id+'/link','POST',{})).json();const u=new URL(link.url);assert.equal(u.origin,'https://t.me');const payload=u.searchParams.get('start');assert.ok(payload.length<=64);assert.match(payload,/^link_[A-Za-z0-9_-]{43}$/);assert.notEqual(DB.sqlite.prepare('SELECT hash FROM mathup_link_tokens').get().hash,Buffer.from(payload.slice(5),'base64url').toString('hex'));parent.link=payload;
    });
    await test('Cloud-only registration and menu endpoints are disabled locally',async()=>{
      for(const path of ['/api/register','/api/link','/api/telegram/registration-menu','/api/parents/'+parent.id+'/admin-menu'])assert.equal((await call(path,'POST',{})).status,404);
      const status=await (await call('/bot-status')).json();assert.equal(status.tests_enabled,false);assert.ok(!JSON.stringify(status).includes('adminPassword'));assert.ok(!JSON.stringify(status).includes(record.hash));
    });

    let uid=1000;const chat='910000000001',engine=createBotEngine(DB,config);
    const update=(text,{id=chat,action=null,type='private'}={})=>{const m={chat:{id:Number(id),type},from:{id:Number(id),first_name:'PRIVATE NAME NEVER COPY'},text};return {update_id:uid++,...(action?{callback_query:{id:'synthetic-callback-'+uid,from:m.from,message:{chat:m.chat},data:action}}:{message:m})};};
    const text=(value,options)=>engine(update(value,options));
    const state=()=>DB.sqlite.prepare('SELECT * FROM bot_sessions WHERE chat_id=?').get(chat);
    const choose=prefix=>text('',{action:prefix+':'+JSON.parse(state().data_json).nonce});
    const register=(name='SYNTHETIC REGISTERED CHILD')=>{text('/register');choose('consent-yes');text('SYNTHETIC PARENT');text('+998000000002');text(name);text('7');};
    await test('Bot ignores groups and non-admin accounts in first-test mode',()=>{
      const n=DB.sqlite.prepare('SELECT COUNT(*) n FROM bot_updates').get().n;text('/register',{id:'910000000099'});text('/register',{type:'group'});assert.equal(DB.sqlite.prepare('SELECT COUNT(*) n FROM bot_updates').get().n,n);
    });
    await test('Bot has registration menu without TEST 1 or TEST 2',()=>{
      text('/start');const payload=JSON.parse(DB.sqlite.prepare('SELECT body_json FROM bot_outbox ORDER BY id DESC LIMIT 1').get().body_json);assert.ok(payload.body.reply_markup.keyboard.flat().some(b=>plainButtonText(b.text)==='Ro‘yxatdan o‘tish'));assert.ok(!JSON.stringify(payload).includes('TEST 1'));assert.ok(!JSON.stringify(payload).includes('TEST 2'));
    });
    await test('Registration asks consent before names and stores no implicit Telegram name',()=>{
      text('/register');assert.equal(state().stage,'consent');assert.ok(!state().data_json.includes('PRIVATE'));text('UNCONSENTED NAME');assert.equal(state().stage,'consent');assert.ok(!state().data_json.includes('UNCONSENTED'));choose('consent-yes');assert.equal(state().stage,'parent');
    });
    await test('Bot validates phone and grade; stale callbacks cannot move a conversation',()=>{
      text('SYNTHETIC PARENT');text('bad phone');assert.equal(state().stage,'phone');text('+998000000002');text('SYNTHETIC REGISTERED CHILD');text('12');assert.equal(state().stage,'grade');text('',{action:'grade_0000000000000000_7'});assert.equal(state().stage,'grade');text('7');assert.equal(state(),undefined);
    });
    await test('Consent creates verified parent and pending student atomically',()=>{
      assert.equal(state(),undefined);const p=DB.sqlite.prepare('SELECT * FROM parents WHERE telegram_chat_id=?').get(chat);assert.equal(p.chat_verified,1);assert.equal(p.consent,1);const s=DB.sqlite.prepare('SELECT * FROM students WHERE parent_id=?').get(p.id);assert.equal(s.grade,7);assert.equal(s.status,'pending_current');
    });
    await test('Duplicate Telegram update adds no rows or replies',()=>{
      const u=update('/start');assert.equal(engine(u),true);const n=DB.sqlite.prepare('SELECT COUNT(*) n FROM bot_outbox').get().n;assert.equal(engine(u),false);assert.equal(DB.sqlite.prepare('SELECT COUNT(*) n FROM bot_outbox').get().n,n);
    });
    await test('Second child reuses same parent; duplicate name creates no extra child',()=>{
      const n=DB.sqlite.prepare('SELECT COUNT(*) n FROM parents').get().n;register('SYNTHETIC SECOND CHILD');register('SYNTHETIC SECOND CHILD');assert.equal(DB.sqlite.prepare('SELECT COUNT(*) n FROM parents').get().n,n);const p=DB.sqlite.prepare('SELECT * FROM parents WHERE telegram_chat_id=?').get(chat);assert.equal(p.consent,1);assert.equal(DB.sqlite.prepare('SELECT COUNT(*) n FROM students WHERE parent_id=?').get(p.id).n,2);
    });
    await test('Cancel deletes a partial registration; sessions expire',()=>{
      text('/register');choose('consent-yes');text('SYNTHETIC CANCELLED');text('/cancel');assert.equal(state(),undefined);text('/register');DB.sqlite.prepare('UPDATE bot_sessions SET expires=1').run();text('EXPIRED');assert.equal(state(),undefined);
    });
    await test('Failure during child insert rolls back parent, update and outbox',()=>{
      text('/register');choose('consent-yes');text('ROLLBACK NAME');text('+998000000003');text('ROLLBACK CHILD');
      DB.sqlite.exec("CREATE TRIGGER synthetic_failure BEFORE INSERT ON students BEGIN SELECT RAISE(ABORT,'synthetic failure'); END;");
      const u=update('3');const n=DB.sqlite.prepare('SELECT COUNT(*) n FROM bot_outbox').get().n;
      assert.throws(()=>engine(u));assert.equal(DB.sqlite.prepare('SELECT COUNT(*) n FROM bot_outbox').get().n,n);assert.equal(DB.sqlite.prepare('SELECT * FROM bot_updates WHERE update_id=?').get(u.update_id),undefined);assert.notEqual(DB.sqlite.prepare('SELECT display_name FROM parents WHERE telegram_chat_id=?').get(chat).display_name,'ROLLBACK NAME');DB.sqlite.exec('DROP TRIGGER synthetic_failure');text('/cancel');
    });
    await test('Daily registration limit stops the sixth accepted request',()=>{
      register('LIMIT FOUR');register('LIMIT FIVE');const n=DB.sqlite.prepare('SELECT COUNT(*) n FROM students').get().n;register('LIMIT SIX');assert.equal(DB.sqlite.prepare('SELECT COUNT(*) n FROM students').get().n,n);assert.equal(DB.sqlite.prepare('SELECT COUNT(*) n FROM mathup_registrations WHERE telegram_id=?').get(chat).n,5);
    });
    await test('Legacy stop command updates the retained profile field',()=>{
      DB.sqlite.prepare('UPDATE parents SET consent=1 WHERE telegram_chat_id=?').run(chat);text('/stop');assert.equal(DB.sqlite.prepare('SELECT consent FROM parents WHERE telegram_chat_id=?').get(chat).consent,0);
    });
    const linkChat='910000000003';config.adminTelegramIds.push(linkChat);
    await test('One-time bot link requires confirmation and cannot be stolen by stale callbacks',()=>{
      text('/start '+parent.link,{id:linkChat});let s=DB.sqlite.prepare('SELECT * FROM bot_sessions WHERE chat_id=?').get(linkChat);assert.equal(s.stage,'link');assert.equal(DB.sqlite.prepare('SELECT telegram_chat_id FROM parents WHERE id=?').get(parent.id).telegram_chat_id,null);
      const action='link-yes:'+JSON.parse(s.data_json).nonce;text('',{action});assert.equal(DB.sqlite.prepare('SELECT telegram_chat_id FROM parents WHERE id=?').get(parent.id).telegram_chat_id,null);
      text('',{id:linkChat,action});assert.equal(DB.sqlite.prepare('SELECT telegram_chat_id FROM parents WHERE id=?').get(parent.id).telegram_chat_id,linkChat);assert.equal(DB.sqlite.prepare('SELECT used FROM mathup_link_tokens WHERE parent_id=?').get(parent.id).used,1);text('/start '+parent.link,{id:linkChat});assert.equal(DB.sqlite.prepare('SELECT * FROM bot_sessions WHERE chat_id=?').get(linkChat),undefined);
    });
    await test('A changed parent invalidates previously issued link consent',async()=>{
      const p=await (await call('/api/parents','POST',{full_name:'SYNTHETIC LINK CONFLICT'})).json();const link=await (await call('/api/parents/'+p.id+'/link','POST',{})).json();const code=new URL(link.url).searchParams.get('start');const other='910000000004';config.adminTelegramIds.push(other);text('/start '+code,{id:other});const data=JSON.parse(DB.sqlite.prepare('SELECT data_json FROM bot_sessions WHERE chat_id=?').get(other).data_json);DB.sqlite.prepare('UPDATE parents SET version=version+1 WHERE id=?').run(p.id);text('',{id:other,action:'link-yes:'+data.nonce});assert.equal(DB.sqlite.prepare('SELECT telegram_chat_id FROM parents WHERE id=?').get(p.id).telegram_chat_id,null);
    });
    await test('Local broadcast previews selected parent; missing token sends nothing',async()=>{
      const prepared=await (await call('/api/messages/prepare','POST',{text:'SYNTHETIC MESSAGE',parent_ids:[parent.id]})).json();assert.equal(prepared.recipients.length,1);assert.equal((await call('/api/messages/send','POST',{text:prepared.text,batch_id:prepared.batch_id,confirm:true})).status,503);
    });
    await test('Outbox clears payload after delivery and never retries uncertain sends',async()=>{
      const delivered=[];await flushOutbox(DB,async(method,body)=>{delivered.push({method,body});return true;});assert.ok(delivered.length>0);assert.equal(DB.sqlite.prepare('SELECT COUNT(*) n FROM bot_outbox WHERE body_json IS NOT NULL').get().n,0);
      text('/start');let count=0;const uncertain=async()=>{count++;throw Object.assign(Error('network'),{uncertain:true});};await flushOutbox(DB,uncertain);await flushOutbox(DB,uncertain);assert.equal(count,1);assert.equal(DB.sqlite.prepare('SELECT state,body_json FROM bot_outbox ORDER BY id DESC LIMIT 1').get().state,'unknown');assert.equal(DB.sqlite.prepare('SELECT body_json FROM bot_outbox ORDER BY id DESC LIMIT 1').get().body_json,null);
    });
    await test('Known Telegram 429 keeps one pending action for delayed retry',async()=>{
      text('/start');assert.equal(await flushOutbox(DB,async()=>{throw Object.assign(Error('limited'),{rejected:true,code:429,retryAfter:3});}),3);assert.equal(DB.sqlite.prepare("SELECT COUNT(*) n FROM bot_outbox WHERE state='prepared'").get().n,1);await flushOutbox(DB,async()=>true);
    });
    await test('Logout makes the old cookie unusable',async()=>{
      assert.equal((await call('/auth/logout','POST',{})).status,200);assert.equal((await call('/api/parents')).status,401);
    });
  }finally{await new Promise(r=>local.server.close(r));DB.close();}

  await test('Bot preflight refuses active webhook without changing it or polling',async()=>{
    const methods=[];await assert.rejects(()=>checkBotReady({...config,botToken:'synthetic'},async method=>{methods.push(method);return method==='getMe'?{is_bot:true,username:config.botUsername}:{url:'https://synthetic.invalid/webhook'};}),/webhook/);assert.deepEqual(methods,['getMe','getWebhookInfo']);
    await assert.rejects(()=>checkBotReady({...config,botToken:'synthetic'},async()=>({is_bot:true,username:'WrongBot'})),/mos kelmadi/);
    await assert.rejects(()=>checkBotReady({...config,adminTelegramIds:[],botToken:'synthetic'},async()=>{throw Error('Should not call')}),/Telegram ID/);
  });
  await test('Telegram adapter rejects dangerous methods and sanitizes credential-bearing errors',async()=>{
    const api=telegramApi('SYNTHETIC_SECRET',async()=>{throw Error('https://api.telegram.org/botSYNTHETIC_SECRET/getMe');});await assert.rejects(()=>api('deleteWebhook'),/ruxsat etilmagan/);await assert.rejects(()=>api('getMe'),e=>!e.message.includes('SYNTHETIC_SECRET')&&e.uncertain);
  });
  await test('Polling saves offset and processes duplicate updates only once',async()=>{
    const db=openDatabase(),abort=new AbortController();let polls=0;
    const update={update_id:888,message:{chat:{type:'private',id:910000000001},from:{id:910000000001},text:'/start'}};
    const api=async(method,body)=>{
      if(method==='getMe')return {is_bot:true,username:config.botUsername};if(method==='getWebhookInfo')return {url:''};
      if(method==='getUpdates'){if(polls++===0)return [update,update];assert.equal(body.offset,889);abort.abort();return [];}
      return true;
    };
    await runPolling(db,{...config,botToken:'synthetic'},{api,signal:abort.signal});assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM bot_updates').get().n,1);assert.equal(db.sqlite.prepare("SELECT value FROM bot_state WHERE key='offset'").get().value,'889');db.close();
  });
  await test('Registration can be disabled without disabling one-time linking',()=>{
    const db=openDatabase(),engine=createBotEngine(db,{...config,publicRegistrationEnabled:false});engine({update_id:1,message:{chat:{type:'private',id:910000000001},from:{id:910000000001},text:'/register'}});assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM bot_sessions').get().n,0);assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM parents').get().n,0);db.close();
  });
  if(process.platform==='win32')await test('Windows DPAPI and .NET PBKDF2 agree with Node',()=>{
    const r=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',new URL('./windows-secrets.ps1',import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);const synthetic=JSON.parse(r.stdout.replace(/^\uFEFF/,''));assert.equal(createAuth(synthetic).login('Synthetic-cross-runtime-2026').status,200);
  });
  console.log(JSON.stringify({passed,failed:0,real_messages_sent:0,live_credentials_used:false,windows_dpapi:process.platform==='win32'?'passed':'not run on this OS'}));
} finally {rmSync(dir,{recursive:true,force:true});}
