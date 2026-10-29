import assert from 'node:assert/strict';
import {openDatabase} from '../src/database.mjs';
import {createBotEngine} from '../src/bot-engine.mjs';
import {plainButtonText} from '../src/button-labels.mjs';
import {PRACTICE_TESTS_TEXT,PRACTICE_ANSWERS_TEXT,PRACTICE_BOOKS,practiceSection,practiceBook} from '../src/practice-sections.mjs';
import {flushOutbox} from '../src/poller.mjs';

export async function runPracticeSectionsSuite(){
 let passed=0;const test=async(name,fn)=>{await fn();passed++;console.log('PASS',name);};
 const DB=openDatabase(),chat='910000000501',registered='910000000502';let uid=95000;
 const engine=createBotEngine(DB,{port:8787,audience:'all',adminTelegramIds:[],publicRegistrationEnabled:true});
 const update=(text,who=chat)=>({update_id:uid++,message:{chat:{type:'private',id:Number(who)},from:{id:Number(who)},text}});
 const callback=action=>({update_id:uid++,callback_query:{id:'synthetic-practice-'+uid,from:{id:Number(chat)},message:{chat:{type:'private',id:Number(chat)}},data:action}});
 const send=(text,who)=>engine(update(text,who));
 const last=()=>JSON.parse(DB.sqlite.prepare('SELECT body_json FROM bot_outbox ORDER BY id DESC LIMIT 1').get().body_json).body;
 const session=()=>DB.sqlite.prepare('SELECT * FROM bot_sessions WHERE chat_id=?').get(chat);
 try{
  await test('Both practice sections appear for new and registered parents without reviving TEST 1 or TEST 2',()=>{
   DB.sqlite.exec("INSERT INTO parents(identity_key,display_name,telegram_chat_id,chat_verified) VALUES('synthetic-practice-parent','SYNTHETIC PRACTICE PARENT','910000000502',1)");
   for(const who of [chat,registered]){send('/start',who);const keys=last().reply_markup.keyboard.flat().map(b=>plainButtonText(b.text));assert.ok(keys.includes('Testlar'));assert.ok(keys.includes('Test javoblari'));assert.ok(keys.includes('Bog‘lanish'));assert.ok(!keys.includes('TEST 1'));assert.ok(!keys.includes('TEST 2'));if(who===registered){assert.ok(!keys.includes('Ro‘yxatdan o‘tish'));assert.ok(keys.includes('Farzand qo‘shish'));}}
  });
  await test('Tests button and commands explain ten-question image sets and honestly show the empty section',()=>{
   for(const text of ['Testlar','📝 Testlar','/tests','/tests@SyntheticMathUPBot']){send(text);assert.equal(last().text,PRACTICE_TESTS_TEXT);assert.ok(last().text.includes('10 ta test'));assert.ok(last().text.includes('bitta rasm'));assert.ok(last().text.includes('Hozircha test rasmlari joylanmagan'));assert.ok(last().reply_markup.inline_keyboard.flat().some(b=>b.callback_data==='practice:answers'));}
  });
  await test('Answers button and commands show a separate empty answer section without fabricated keys',()=>{
   for(const text of ['Test javoblari','✅ Test javoblari','/answers','/answers@SyntheticMathUPBot']){send(text);assert.equal(last().text,PRACTICE_ANSWERS_TEXT);assert.ok(last().text.includes('Hozircha javoblar joylanmagan'));assert.ok(last().reply_markup.inline_keyboard.flat().some(b=>b.callback_data==='practice:tests'));}
  });
  await test('Parents can navigate between tests, answers and the persistent home keyboard',()=>{
   engine(callback('practice:tests'));assert.equal(last().text,PRACTICE_TESTS_TEXT);engine(callback('practice:answers'));assert.equal(last().text,PRACTICE_ANSWERS_TEXT);engine(callback('practice:home'));assert.ok(last().reply_markup.keyboard.flat().some(b=>b.text==='📝 Testlar'));assert.ok(last().text.includes('Materiallar tayyorlanmoqda'));
  });
  await test('Opening either section does not discard an unfinished registration or save personal details',()=>{
   send('/register');const before=session(),parentCount=DB.sqlite.prepare('SELECT COUNT(*) n FROM parents').get().n;send('📝 Testlar');assert.deepEqual(session(),before);send('✅ Test javoblari');assert.deepEqual(session(),before);assert.equal(DB.sqlite.prepare('SELECT COUNT(*) n FROM parents').get().n,parentCount);assert.equal(DB.sqlite.prepare('SELECT COUNT(*) n FROM students').get().n,0);
  });
  await test('Unknown practice callbacks cannot advance registration or invent a topic',()=>{
   const before=session();engine(callback('practice:topic:999'));assert.deepEqual(session(),before);assert.ok(!last().text.includes('999'));assert.throws(()=>practiceSection('invented'));
  });
  await test('Duplicate section callbacks are acknowledged and replied to only once',()=>{
   const u=callback('practice:tests');assert.equal(engine(u),true);const count=DB.sqlite.prepare('SELECT COUNT(*) n FROM bot_outbox').get().n;assert.equal(engine(u),false);assert.equal(DB.sqlite.prepare('SELECT COUNT(*) n FROM bot_outbox').get().n,count);
   const methods=DB.sqlite.prepare('SELECT body_json FROM bot_outbox WHERE update_id=? ORDER BY seq').all(u.update_id).map(r=>JSON.parse(r.body_json).method);assert.deepEqual(methods,['answerCallbackQuery','sendMessage']);
  });
  await test('Tests offers exactly the three requested Y_I_E book buttons in part order',()=>{
   send('/tests');const buttons=last().reply_markup.inline_keyboard.flat().filter(b=>b.callback_data.includes(':book:'));assert.deepEqual(buttons.map(b=>b.text),['Y_I_E 1-qism testlari','Y_I_E 2-qism testlari','Y_I_E 3-qism testlari']);assert.deepEqual(buttons.map(b=>b.callback_data),['practice:tests:book:1','practice:tests:book:2','practice:tests:book:3']);assert.equal(PRACTICE_BOOKS.length,3);
  });
  await test('Each book opens its own honest empty topic section without discarding a registration draft',()=>{
   send('/register');const before=session();for(const part of [1,2,3]){engine(callback('practice:tests:book:'+part));assert.equal(last().text,practiceBook('tests',part).text);assert.ok(last().text.startsWith('📘 Y_I_E '+part+'-qism testlari'));assert.ok(last().text.includes('10 tadan test'));assert.ok(last().text.includes('mavzular va test rasmlari joylanmagan'));assert.deepEqual(session(),before);assert.ok(last().reply_markup.inline_keyboard.flat().some(b=>b.callback_data==='practice:answers:book:'+part));}
  });
  await test('Book answers stay matched to the same part and support returning to the book list and home',()=>{
   for(const part of [1,2,3]){engine(callback('practice:answers:book:'+part));assert.equal(last().text,practiceBook('answers',part).text);assert.ok(last().reply_markup.inline_keyboard.flat().some(b=>b.callback_data==='practice:tests:book:'+part));engine(callback('practice:answers'));const keys=last().reply_markup.inline_keyboard.flat();assert.equal(keys.filter(b=>b.callback_data.includes(':book:')).length,3);assert.equal(keys[part-1].text,'Y_I_E '+part+'-qism javoblari');}engine(callback('practice:home'));assert.ok(last().reply_markup.keyboard.flat().some(b=>b.text==='📝 Testlar'));
  });
  await test('Invalid book callbacks cannot expose fabricated content or advance registration; payloads fit Telegram limits',()=>{
   send('/register');const before=session();for(const value of ['0','4','01','999','1:other']){engine(callback('practice:tests:book:'+value));assert.deepEqual(session(),before);assert.ok(!last().text.includes('qism testlari'));}assert.throws(()=>practiceBook('tests',4));assert.throws(()=>practiceBook('other',1));for(const kind of ['tests','answers'])for(const part of [1,2,3])for(const b of practiceBook(kind,part).rows.flat())assert.ok(Buffer.byteLength(b.callback_data)<=64);
  });
  await test('Empty sections deliver text and navigation only through the mocked outbox, with no images or scoring',async()=>{
   const methods=[];await flushOutbox(DB,async(method)=>{methods.push(method);return true;});assert.ok(methods.length>0);assert.ok(methods.every(m=>['sendMessage','answerCallbackQuery'].includes(m)));assert.equal(DB.sqlite.prepare('SELECT COUNT(*) n FROM students').get().n,0);assert.equal(DB.sqlite.prepare('SELECT COUNT(*) n FROM bot_outbox WHERE body_json IS NOT NULL').get().n,0);
  });
 }finally{DB.close();}
 return passed;
}
