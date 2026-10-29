import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {openDatabase} from '../src/database.mjs';
import {createBotEngine} from '../src/bot-engine.mjs';
import {practiceBook,practiceTopic} from '../src/practice-sections.mjs';
import {loadPracticeCatalog,readPracticeImage} from '../src/practice-catalog.mjs';
import {telegramApi,flushOutbox} from '../src/poller.mjs';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jN1sAAAAASUVORK5CYII=','base64');
const hash=createHash('sha256').update(png).digest('hex');
// Entirely synthetic material. Real course images and answer keys stay private.
const fixture=()=>Array.from({length:18},(_,i)=>({book_id:'1',number:i+1,title:'SYNTHETIC TOPIC '+(i+1),answers:Array(10).fill('A'),explanations:Array.from({length:10},(_,q)=>(q+1)+'. A) Synthetic explanation.'),image:{path:'yie-1/topic-'+String(i+1).padStart(2,'0')+'.png',sha256:hash}}));
export async function runPracticeTopicsSuite(){
 let passed=0;const test=async(name,fn)=>{await fn();passed++;console.log('PASS',name);};
 const dir=mkdtempSync(join(tmpdir(),'mathup-practice-')),DB=openDatabase();
 let catalog=fixture(),uid=200000;
 const save=items=>writeFileSync(join(dir,'catalog.json'),JSON.stringify({schema_version:1,topics:items}));
 const chat=910000000601,engine=createBotEngine(DB,{audience:'all',adminTelegramIds:[],publicRegistrationEnabled:true},{practiceCatalog:catalog});
 const act=data=>({update_id:uid++,callback_query:{id:'synthetic-'+uid,from:{id:chat},message:{chat:{id:chat,type:'private'}},data}});
 const message=text=>engine({update_id:uid++,message:{chat:{id:chat,type:'private'},from:{id:chat},text}});
 const last=()=>JSON.parse(DB.sqlite.prepare('SELECT body_json FROM bot_outbox ORDER BY id DESC LIMIT 1').get().body_json);
 try{
  mkdirSync(join(dir,'yie-1'));for(const t of catalog)writeFileSync(join(dir,t.image.path),png);save([...catalog].reverse());
  await test('Private catalog sorts topic numbers numerically and checks exactly ten matched keys and explanations',()=>{
   const loaded=loadPracticeCatalog(dir);assert.deepEqual(loaded.map(t=>t.number),Array.from({length:18},(_,i)=>i+1));assert.equal(loaded.filter(t=>t.image).length,18);assert.deepEqual(loadPracticeCatalog(join(dir,'absent')),[]);
   for(const mutate of [x=>x.push(x[0]),x=>x[0].answers.pop(),x=>x[0].explanations[0]='1. B) Mismatch',x=>x[0].book_id='4']){const bad=fixture();mutate(bad);save(bad);assert.deepEqual(loadPracticeCatalog(dir),[]);}save(catalog);
  });
  await test('Bad image hashes and paths disable only the image and never read arbitrary local files',()=>{
   const bad=fixture();bad[0].image.sha256='0'.repeat(64);bad[1].image.path='../secret.png';save(bad);const loaded=loadPracticeCatalog(dir);assert.equal(loaded.length,18);assert.equal(loaded[0].image,null);assert.equal(loaded[1].image,null);assert.ok(loaded[2].image);assert.throws(()=>readPracticeImage('../secret.png',hash,dir));assert.throws(()=>readPracticeImage('yie-1/topic-01.png','0'.repeat(64),dir));save(catalog);
  });
  await test('Topic list has two ordered pages with same-page tests and answers navigation',()=>{
   const first=practiceBook('tests',1,0,[...catalog].reverse()),second=practiceBook('tests',1,1,catalog);
   const numbers=s=>s.rows.flat().filter(b=>b.callback_data.includes(':topic:')).map(b=>Number(b.callback_data.split(':').at(-1)));
   assert.deepEqual(numbers(first),[1,2,3,4,5,6,7,8,9]);assert.deepEqual(numbers(second),[10,11,12,13,14,15,16,17,18]);assert.ok(second.rows.flat().some(b=>b.callback_data==='practice:answers:book:1:page:1'));
   assert.match(practiceBook('tests',1,2,catalog).text,/topilmadi/);assert.match(practiceBook('tests',2,0,catalog).text,/joylanmagan/);
  });
  await test('Each topic sends its own image and ten exact answers, with bounded previous and next navigation',()=>{
   for(const t of catalog){const photo=practiceTopic('tests','1',t.number,catalog),answer=practiceTopic('answers','1',t.number,catalog);assert.equal(photo.photo,'practice:'+t.image.path+':'+hash);assert.ok(answer.text.includes(t.explanations.join('\n')));assert.ok(answer.text.includes('10–A'));assert.ok(answer.text.length<=4096);assert.ok(photo.text.length<=1024);const buttons=photo.rows.flat();assert.ok(buttons.some(b=>b.callback_data==='practice:answers:topic:1:'+t.number));assert.ok(buttons.some(b=>b.callback_data==='practice:tests:book:1:page:'+Math.floor((t.number-1)/9)));for(const b of [...buttons,...answer.rows.flat()])assert.ok(Buffer.byteLength(b.callback_data)<=64);}
   assert.ok(!practiceTopic('tests','1',1,catalog).rows.flat().some(b=>b.callback_data.includes(':topic:')&&b.callback_data.endsWith(':0')));assert.ok(!practiceTopic('tests','1',18,catalog).rows.flat().some(b=>b.callback_data.endsWith(':19')));
   assert.match(practiceTopic('tests','1',1,[{...catalog[0],image:null}]).text,/rasmi hozir mavjud emas/);
  });
  await test('Topic callbacks use the outbox, deduplicate taps and preserve registration drafts',()=>{
   message('/register');const draft=DB.sqlite.prepare('SELECT * FROM bot_sessions WHERE chat_id=?').get(String(chat));
   const update=act('practice:tests:topic:1:10');assert.equal(engine(update),true);assert.equal(last().method,'sendPhoto');assert.equal(last().body.photo,'practice:yie-1/topic-10.png:'+hash);const n=DB.sqlite.prepare('SELECT COUNT(*) n FROM bot_outbox').get().n;assert.equal(engine(update),false);assert.equal(DB.sqlite.prepare('SELECT COUNT(*) n FROM bot_outbox').get().n,n);
   engine(act('practice:answers:topic:1:10'));assert.equal(last().method,'sendMessage');assert.ok(last().body.text.includes('10–A'));engine(act('practice:tests:book:1:page:1'));assert.ok(last().body.text.includes('2/2-sahifa'));assert.deepEqual(DB.sqlite.prepare('SELECT * FROM bot_sessions WHERE chat_id=?').get(String(chat)),draft);assert.equal(DB.sqlite.prepare('SELECT COUNT(*) n FROM students').get().n,0);
  });
  await test('Malformed, missing and stale practice callbacks safely return navigation',()=>{
   const draft=DB.sqlite.prepare('SELECT * FROM bot_sessions WHERE chat_id=?').get(String(chat));for(const c of ['practice:tests:topic:1:999','practice:tests:topic:2:1','practice:tests:topic:1:01','practice:answers:book:1:page:99','practice:tests:topic:1:1:other']){engine(act(c));assert.equal(last().method,'sendMessage');assert.match(last().body.text,/topilmadi/);assert.deepEqual(DB.sqlite.prepare('SELECT * FROM bot_sessions WHERE chat_id=?').get(String(chat)),draft);}
  });
  await test('Photo adapter sends local PNG bytes and keyboard as multipart without exposing a file URL',async()=>{
   let calls=0;const api=telegramApi('SYNTHETIC',async(url,request)=>{calls++;assert.ok(url.endsWith('/sendPhoto'));assert.equal(request.headers['Content-Type'],undefined);const form=request.body;assert.ok(form instanceof FormData);assert.equal(form.get('chat_id'),String(chat));assert.equal(form.get('caption'),'Synthetic caption');assert.equal(form.get('photo').type,'image/png');assert.deepEqual(Buffer.from(await form.get('photo').arrayBuffer()),png);assert.deepEqual(JSON.parse(form.get('reply_markup')),{inline_keyboard:[]});return {ok:true,json:async()=>({ok:true,result:{message_id:1}})};},{practiceRoot:dir});
   await api('sendPhoto',{chat_id:chat,photo:'practice:yie-1/topic-01.png:'+hash,caption:'Synthetic caption',reply_markup:{inline_keyboard:[]}});assert.equal(calls,1);
   for(const value of ['https://synthetic.invalid/photo.png','practice:../secret.png:'+hash,'practice:yie-1/topic-99.png:'+hash,'practice:yie-1/topic-01.png:'+'0'.repeat(64)])await assert.rejects(()=>api('sendPhoto',{photo:value}),e=>e.rejected&&e.code===400);assert.equal(calls,1);
  });
  await test('Image sends with uncertain delivery are never retried automatically',async()=>{
   await flushOutbox(DB,async()=>true);engine(act('practice:tests:topic:1:18'));let photos=0;const mock=async(method)=>{if(method==='sendPhoto'){photos++;throw Object.assign(Error('synthetic network failure'),{uncertain:true});}return true;};await flushOutbox(DB,mock);await flushOutbox(DB,mock);assert.equal(photos,1);assert.equal(DB.sqlite.prepare('SELECT state FROM bot_outbox ORDER BY id DESC LIMIT 1').get().state,'unknown');
  });
 }finally{DB.close();rmSync(dir,{recursive:true,force:true});}
 return passed;
}
