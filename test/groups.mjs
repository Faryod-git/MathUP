import assert from 'node:assert/strict';
import {Script} from 'node:vm';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openDatabase} from '../src/database.mjs';
import {groupsRoute} from '../src/groups.mjs';
import {deleteStudent} from '../src/local-data.mjs';
import {createLocalServer} from '../src/server.mjs';
import {passwordRecord} from '../src/auth.mjs';

export async function runGroupsSuite(){
 let passed=0;const test=async(name,fn)=>{await fn();passed++;console.log('PASS',name);};
 const DB=openDatabase(),db=DB.sqlite,sends=[];
 db.exec("INSERT INTO parents(identity_key,display_name,telegram_chat_id,chat_verified,consent) VALUES('synthetic-g-family','SYNTHETIC GROUP FAMILY','910000000701',1,0),('synthetic-g-unlinked','SYNTHETIC UNLINKED',NULL,0,0);INSERT INTO students(parent_id,full_name,grade,status) VALUES(1,'SYNTHETIC ALI',5,'current'),(1,'SYNTHETIC VALI',6,'pending_current'),(2,'SYNTHETIC UNLINKED CHILD',5,'new_lead');");
 const config={adminPassword:passwordRecord('Synthetic-groups-http-2026'),port:8787,audience:'admins',adminTelegramIds:[],publicRegistrationEnabled:false,botUsername:'SyntheticMathUPBot',botToken:'SYNTHETIC'};
 const {server}=createLocalServer({DB,config,net:async(url,options)=>{sends.push(JSON.parse(options.body));return Response.json({ok:true,result:{message_id:1}});}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;let cookie='';
 const call=async(path,method='GET',body,headers={})=>{const r=await fetch(base+path,{method,headers:{cookie,origin:base,'content-type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,data:r.headers.get('content-type')?.includes('json')?await r.json():await r.text()};};
 const group=id=>db.prepare('SELECT * FROM student_groups_catalog WHERE id=?').get(id),student=id=>db.prepare('SELECT * FROM students WHERE id=?').get(id);
 const members=(gid,changes)=>call('/api/groups/'+gid+'/members','PATCH',{version:group(gid).version,changes:changes.map(([id,member])=>({student_id:String(id),student_version:student(id).version,member}))});
 let a,b,preview;
 try{
  await test('Group HTTP routes require admin login, origin and JSON; page scripts compile',async()=>{
   assert.equal((await call('/api/groups')).status,401);assert.equal((await call('/api/groups','POST',{name:'SYNTHETIC'})).status,401);
   const login=await fetch(base+'/auth/login',{method:'POST',headers:{origin:base,'content-type':'application/json'},body:JSON.stringify({password:'Synthetic-groups-http-2026'})});cookie=login.headers.get('set-cookie').split(';')[0];
   assert.equal((await call('/api/groups','POST',{name:'x'},{origin:'https://other.invalid'})).status,403);assert.equal((await call('/api/groups','POST',{name:'x'},{'content-type':'text/plain'})).status,415);assert.equal((await call('/api/groups','POST',null)).status,400);
   const html=(await call('/')).data;for(const [,script]of html.matchAll(/<script>([\s\S]*?)<\/script>/g))new Script(script);assert.ok(html.includes('groupMembersDialog'));assert.ok(html.includes('studentGroupFilter'));assert.ok(html.includes('data-group-close="deleteGroupDialog" autofocus'));
  });
  await test('Group create normalizes names and rejects empty, oversized or duplicate names',async()=>{
   for(const name of ['', ' ', 'x'.repeat(81)])assert.equal((await call('/api/groups','POST',{name})).status,400);
   const created=await call('/api/groups','POST',{name:'  SYNTHETIC   5-sinf  '});assert.equal(created.status,200);a=created.data;assert.equal(a.name,'SYNTHETIC 5-sinf');
   assert.equal((await call('/api/groups','POST',{name:'synthetic 5-SINF'})).status,409);b=(await call('/api/groups','POST',{name:'SYNTHETIC Olimpiada'})).data;assert.equal((await call('/api/groups')).data.items.length,2);
  });
  await test('Group rename uses optimistic versions and rejects collisions',async()=>{
   assert.equal((await call('/api/groups/'+a.id,'PATCH',{version:a.version+1,name:'STALE'})).status,409);
   assert.equal((await call('/api/groups/'+a.id,'PATCH',{version:a.version,name:b.name})).status,409);
   assert.equal((await call('/api/groups/'+a.id,'PATCH',{version:a.version,name:'SYNTHETIC 5-sinf ertalab'})).status,200);a=group(a.id);
  });
  await test('Membership accepts unlinked students and one student can join multiple groups',async()=>{
   assert.equal((await members(a.id,[[1,true],[2,true],[3,true]])).status,200);assert.equal((await members(b.id,[[1,true]])).status,200);
   assert.equal(db.prepare('SELECT COUNT(*) n FROM student_group_members WHERE student_id=1').get().n,2);assert.equal((await call('/api/groups')).data.items.find(g=>g.id===String(a.id)).student_count,3);
  });
  await test('Duplicate membership is idempotent and cannot create duplicate rows',async()=>{
   const v=student(1).version;assert.equal((await members(a.id,[[1,true]])).data.changed,0);assert.equal(student(1).version,v);assert.equal(db.prepare('SELECT COUNT(*) n FROM student_group_members WHERE group_id=? AND student_id=1').get(a.id).n,1);
  });
  await test('Roster group and ungrouped filters work with search, status and group labels',async()=>{
   const all=(await call('/api/students?group_id='+b.id)).data.items;assert.deepEqual(all.map(s=>s.id),['1']);assert.equal(JSON.parse(all[0].groups_json).length,2);
   assert.equal((await call('/api/students?group_id='+a.id+'&status=active&q=ALI')).data.items.length,1);assert.equal((await call('/api/students?group_id=none')).data.items.length,0);assert.equal((await call('/api/students?group_id=unknown')).status,400);assert.equal((await call('/api/students?group_id=999999')).status,404);
  });
  await test('Group recipient selection skips unlinked students and deduplicates the same parent on preview',async()=>{
   const selected=(await call('/api/groups/'+a.id+'/recipients')).data;assert.equal(selected.items.length,2);assert.equal(selected.skipped,1);
   preview=(await call('/api/messages/prepare','POST',{text:'SYNTHETIC GROUP NOTICE',student_ids:selected.items.map(s=>s.id)})).data;assert.equal(preview.recipients.length,1);assert.equal(sends.length,0);
  });
  await test('Removing a group member preserves student, parent and other group and invalidates message preview',async()=>{
   assert.equal((await members(a.id,[[1,false]])).status,200);assert.ok(student(1));assert.ok(db.prepare('SELECT id FROM parents WHERE id=1').get());assert.equal(db.prepare('SELECT COUNT(*) n FROM student_group_members WHERE student_id=1').get().n,1);
   assert.equal((await call('/api/messages/send','POST',{batch_id:preview.batch_id,text:preview.text,student_selection:preview.student_selection,confirm:true})).status,409);assert.equal(sends.length,0);
  });
  await test('Stale group or student versions reject the entire membership batch atomically',async()=>{
   const g=group(a.id),s=student(1),second=student(2);db.prepare('UPDATE students SET version=version+1 WHERE id=2').run();
   assert.equal((await call('/api/groups/'+a.id+'/members','PATCH',{version:g.version,changes:[{student_id:'1',student_version:s.version,member:true},{student_id:'2',student_version:second.version,member:false}]})).status,409);
   assert.equal(student(1).version,s.version);assert.equal(db.prepare('SELECT COUNT(*) n FROM student_group_members WHERE group_id=? AND student_id=1').get(a.id).n,0);
   assert.equal((await call('/api/groups/'+a.id+'/members','PATCH',{version:g.version-1,changes:[{student_id:'1',student_version:s.version,member:true}]})).status,409);
  });
  await test('Malformed, duplicate, missing and archived student assignments cannot mutate groups',async()=>{
   const path='/api/groups/'+a.id+'/members',v=group(a.id).version;
   for(const changes of [[],[{student_id:'1',student_version:1,member:'yes'}],[{student_id:'1',student_version:1,member:true},{student_id:'1',student_version:1,member:false}]])assert.equal((await call(path,'PATCH',{version:v,changes})).status,400);
   assert.equal((await call(path,'PATCH',{version:v,changes:[{student_id:'999999',student_version:1,member:true}]})).status,409);
   db.exec('UPDATE students SET archived=1 WHERE id=3');assert.equal((await members(a.id,[[3,false]])).status,409);db.exec('UPDATE students SET archived=0 WHERE id=3');
  });
  await test('Group membership transaction rolls back insertion and versions when SQLite fails',async()=>{
   const v=student(1).version,gv=group(a.id).version;db.exec("CREATE TRIGGER synthetic_group_failure BEFORE UPDATE ON student_groups_catalog BEGIN SELECT RAISE(ABORT,'synthetic group failure');END;");
   assert.equal((await members(a.id,[[1,true]])).status,500);assert.equal(student(1).version,v);assert.equal(group(a.id).version,gv);assert.equal(db.prepare('SELECT COUNT(*) n FROM student_group_members WHERE group_id=? AND student_id=1').get(a.id).n,0);db.exec('DROP TRIGGER synthetic_group_failure');
  });
  await test('Member search includes unlinked students and pagination does not truncate assignment choices',async()=>{
   assert.equal((await call('/api/groups/'+a.id+'/students?q=UNLINKED')).data.items.length,1);assert.equal((await call('/api/groups/'+a.id+'/students?members=true')).data.items.length,2);
   const add=db.prepare("INSERT INTO students(parent_id,full_name,status) VALUES(2,?,'current')");for(let i=0;i<55;i++)add.run('SYNTHETIC PAGE '+String(i).padStart(2,'0'));
   assert.equal((await call('/api/groups/'+a.id+'/students')).data.items.length,51);assert.equal((await call('/api/groups/'+a.id+'/students?offset=50')).data.items.length,8);
   assert.equal((await call('/api/groups/'+a.id+'/students?q='+encodeURIComponent("%' OR 1=1 --"))).data.items.length,0);
  });
  await test('Group deletion requires explicit confirmation and current version and preserves family records',async()=>{
   const selected=(await call('/api/groups/'+b.id+'/recipients')).data;const p=(await call('/api/messages/prepare','POST',{text:'SYNTHETIC DELETED GROUP',student_ids:selected.items.map(s=>s.id)})).data;
   assert.equal((await call('/api/groups/'+b.id,'DELETE',{version:group(b.id).version})).status,400);assert.equal((await call('/api/groups/'+b.id,'DELETE',{version:group(b.id).version+1,confirm:true})).status,409);
   assert.equal((await call('/api/groups/'+b.id,'DELETE',{version:group(b.id).version,confirm:true})).status,200);assert.ok(student(1));assert.ok(db.prepare('SELECT id FROM parents WHERE id=1').get());assert.ok(group(a.id));assert.equal(db.prepare('SELECT COUNT(*) n FROM student_group_members WHERE group_id=?').get(b.id).n,0);
   assert.equal((await call('/api/messages/send','POST',{batch_id:p.batch_id,text:p.text,student_selection:p.student_selection,confirm:true})).status,409);assert.equal(sends.length,0);
  });
  await test('Deleting a student cascades only its group memberships and keeps the group',async()=>{
   deleteStudent(DB,3,student(3).version);assert.equal(db.prepare('SELECT COUNT(*) n FROM student_group_members WHERE student_id=3').get().n,0);assert.ok(group(a.id));assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
  });
  await test('Group definitions and multi-group membership survive reopening the existing database',()=>{
   const dir=mkdtempSync(join(tmpdir(),'mathup-groups-')),path=join(dir,'persist.sqlite');let saved=openDatabase(path);
   try{saved.sqlite.exec("INSERT INTO parents(identity_key,display_name) VALUES('synthetic-persist-g','SYNTHETIC');INSERT INTO students(parent_id,full_name,status) VALUES(1,'SYNTHETIC PERSIST GROUP CHILD','current');");
    const url=new URL('http://127.0.0.1/api/groups');const g=groupsRoute(saved,'/api/groups','POST',{name:'SYNTHETIC PERSIST'},url);groupsRoute(saved,'/api/groups/'+g.id+'/members','PATCH',{version:1,changes:[{student_id:'1',student_version:1,member:true}]},url);saved.close();saved=openDatabase(path);assert.equal(saved.sqlite.prepare('SELECT name FROM student_groups_catalog').get().name,'SYNTHETIC PERSIST');assert.equal(saved.sqlite.prepare('SELECT COUNT(*) n FROM student_group_members').get().n,1);assert.equal(saved.sqlite.prepare('SELECT full_name FROM students').get().full_name,'SYNTHETIC PERSIST GROUP CHILD');
   }finally{saved.close();rmSync(dir,{recursive:true,force:true});}
  });
  await test('Whole-group recipient selection rejects oversized student or parent sets without partial selection',()=>{
   const large=openDatabase();
   try{
    large.sqlite.exec("INSERT INTO parents(identity_key,display_name,telegram_chat_id,chat_verified) VALUES('synthetic-large-g','SYNTHETIC','910000000801',1);INSERT INTO student_groups_catalog(name,name_key) VALUES('SYNTHETIC LARGE','synthetic large');");
    for(let i=0;i<101;i++){const s=large.sqlite.prepare("INSERT INTO students(parent_id,full_name,status) VALUES(1,?,'current') RETURNING id").get('SYNTHETIC LARGE '+i);large.sqlite.prepare('INSERT INTO student_group_members VALUES(1,?)').run(s.id);}
    const request=()=>groupsRoute(large,'/api/groups/1/recipients','GET',undefined,new URL('http://127.0.0.1/api/groups/1/recipients'));assert.throws(request,e=>e.status===400);
    large.sqlite.exec('DELETE FROM student_group_members;DELETE FROM students;');
    for(let i=0;i<21;i++){const p=large.sqlite.prepare('INSERT INTO parents(identity_key,display_name,telegram_chat_id,chat_verified) VALUES(?,?,?,1) RETURNING id').get('synthetic-family-'+i,'SYNTHETIC',String(910000001000+i));const s=large.sqlite.prepare("INSERT INTO students(parent_id,full_name,status) VALUES(?,'SYNTHETIC LARGE FAMILY','current') RETURNING id").get(p.id);large.sqlite.prepare('INSERT INTO student_group_members VALUES(1,?)').run(s.id);}
    assert.throws(request,e=>e.status===400);
   }finally{large.close();}
  });
 }finally{await new Promise(r=>server.close(r));DB.close();}
 return passed;
}
