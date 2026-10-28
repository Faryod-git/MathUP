import assert from 'node:assert/strict';
import {Script} from 'node:vm';
import {makeHarness} from './legacy.mjs';
import {openDatabase} from '../src/database.mjs';
import {createLocalServer} from '../src/server.mjs';
import {passwordRecord} from '../src/auth.mjs';
import {adminPage} from '../src/ui.mjs';
import {deleteStudent} from '../src/local-data.mjs';
export async function runDeletionSuite(){
 let count=0;const test=async(name,fn)=>{await fn();count++;console.log('PASS',name)};
 const h=await makeHarness();h.env.LOCAL_MODE=true;h.env.DELETE_STUDENT=(id,version)=>deleteStudent({sqlite:h.sqlite},id,version);
 try{
  const parent=(await h.call('/api/parents','POST',{full_name:'SYNTHETIC DELETE FAMILY'})).data;
  h.sqlite.prepare('UPDATE parents SET telegram_chat_id=?,chat_verified=1,consent=0 WHERE id=?').run('910000000071',parent.id);
  const a=(await h.call('/api/students','POST',{parent_id:parent.id,full_name:'SYNTHETIC LEAVING CHILD',grade:6})).data.id;
  const sibling=(await h.call('/api/students','POST',{parent_id:parent.id,full_name:'SYNTHETIC REMAINING CHILD',grade:4})).data.id;
  const child=()=>h.sqlite.prepare('SELECT * FROM students WHERE id=?').get(a);
  const request={confirm:true,version:child().version};
  const preview=(await h.call('/api/messages/prepare','POST',{text:'SYNTHETIC DELETED PREVIEW',student_ids:[a]})).data;
  await test('Student deletion requires an authenticated admin and same origin',async()=>{assert.equal((await h.call('/api/students/'+a,'DELETE',request,{auth:false})).status,401);assert.equal((await h.call('/api/students/'+a,'DELETE',request,{origin:'https://other.invalid'})).status,403);assert.ok(child());});
  await test('Missing delete confirmation and invalid version cannot remove a student',async()=>{assert.equal((await h.call('/api/students/'+a,'DELETE',{version:request.version})).status,400);assert.equal((await h.call('/api/students/'+a,'DELETE',{confirm:true,version:0})).status,400);assert.ok(child());});
  await test('A changed student cannot be deleted using a stale version',async()=>{h.sqlite.prepare('UPDATE students SET version=version+1 WHERE id=?').run(a);assert.equal((await h.call('/api/students/'+a,'DELETE',request)).status,409);assert.ok(child());});
  await test('Confirmed deletion removes the row while preserving parent and sibling',async()=>{const response=await h.call('/api/students/'+a,'DELETE',{confirm:true,version:child().version});assert.equal(response.status,200);assert.equal(response.data.deleted_id,a);assert.equal(child(),undefined);assert.ok(h.sqlite.prepare('SELECT id FROM parents WHERE id=?').get(parent.id));assert.ok(h.sqlite.prepare('SELECT id FROM students WHERE id=?').get(sibling));assert.deepEqual(h.sqlite.prepare('PRAGMA foreign_key_check').all(),[]);assert.equal(h.sends.length,0);});
  await test('Deleting a selected student invalidates its prepared message without sending',async()=>{const response=await h.call('/api/messages/send','POST',{batch_id:preview.batch_id,text:preview.text,student_selection:preview.student_selection,confirm:true});assert.equal(response.status,409);assert.equal(h.sends.length,0);});
  await test('Repeated or unknown student deletion returns not found',async()=>{assert.equal((await h.call('/api/students/'+a,'DELETE',{confirm:true,version:1})).status,404);assert.equal((await h.call('/api/students/99999999','DELETE',{confirm:true,version:1})).status,404);});
  await test('Student delete UI shows the student, permanence warning and cancellation',()=>{for(const [,script] of adminPage.matchAll(/<script>([\s\S]*?)<\/script>/g))new Script(script);assert.ok(adminPage.includes('deleteStudentName'));assert.ok(adminPage.includes('confirmDeleteStudent'));assert.ok(adminPage.includes('butunlay o‘chiriladi'));assert.ok(adminPage.includes('data-close="deleteDialog" autofocus'));assert.ok(adminPage.includes('selected.delete(student.id)'));});
 }finally{h.sqlite.close();}
 await test('Local HTTP transport supports protected JSON DELETE requests',async()=>{
  const DB=openDatabase();DB.sqlite.exec("INSERT INTO parents(identity_key,display_name) VALUES('synthetic-http-delete','SYNTHETIC HTTP PARENT');INSERT INTO students(parent_id,full_name,grade,status) VALUES(1,'SYNTHETIC HTTP CHILD',5,'current');");
  const {server}=createLocalServer({DB,config:{adminPassword:passwordRecord('Synthetic-delete-http-2026'),port:8787,audience:'admins',adminTelegramIds:[],publicRegistrationEnabled:false}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;const headers={origin:base,'content-type':'application/json'};
  try{
   let r=await fetch(base+'/auth/login',{method:'POST',headers,body:JSON.stringify({password:'Synthetic-delete-http-2026'})});assert.equal(r.status,200);const cookie=r.headers.get('set-cookie').split(';')[0];
   r=await fetch(base+'/api/students/1',{method:'DELETE',headers:{...headers,cookie,origin:'https://other.invalid'},body:JSON.stringify({version:1,confirm:true})});assert.equal(r.status,403);
   r=await fetch(base+'/api/students/1',{method:'DELETE',headers:{...headers,cookie},body:JSON.stringify({version:1,confirm:true})});assert.equal(r.status,200);assert.equal((await r.json()).parent_deleted,true);assert.equal(DB.sqlite.prepare('SELECT COUNT(*) n FROM students').get().n,0);assert.equal(DB.sqlite.prepare('SELECT COUNT(*) n FROM parents').get().n,0);
  }finally{await new Promise(r=>server.close(r));DB.close();}
 });return count;
}
