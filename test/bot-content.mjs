import assert from 'node:assert/strict';
import {openDatabase} from '../src/database.mjs';
import {createBotEngine} from '../src/bot-engine.mjs';
import {plainButtonText} from '../src/button-labels.mjs';
import {WELCOME_TEXT,CONTACTS,CONTACT_TEXT,CONTACT_ENTITIES,CONTACT_PHONE_COMPLETE,BOT_DESCRIPTION,BOT_SHORT_DESCRIPTION} from '../src/bot-content.mjs';
import {configureBotProfile,profileApi} from '../src/bot-profile.mjs';

export async function runBotContentSuite(){
 let count=0;const test=async(name,fn)=>{await fn();count++;console.log('PASS',name);};
 const DB=openDatabase(),config={port:8787,audience:'all',adminTelegramIds:['910000000601'],publicRegistrationEnabled:true,botUsername:'SyntheticMathUPBot'};
 const engine=createBotEngine(DB,config);let uid=90000;
 const update=(text,id='910000000601')=>({update_id:uid++,message:{chat:{type:'private',id:Number(id)},from:{id:Number(id)},text}});
 const send=(text,id)=>engine(update(text,id));const last=()=>JSON.parse(DB.sqlite.prepare('SELECT body_json FROM bot_outbox ORDER BY id DESC LIMIT 1').get().body_json).body;
 try{
  await test('Bot welcome explains only implemented parent functions and includes contact on the keyboard',()=>{
   send('/start');assert.equal(last().text,WELCOME_TEXT);for(const phrase of ['ro‘yxatdan','o‘qish holatini','xabar va e’lonlarini','bog‘lanasiz'])assert.ok(last().text.includes(phrase));assert.ok(last().reply_markup.keyboard.flat().some(b=>b.text==='📞 Bog‘lanish'));assert.ok(!last().text.includes('TEST 1'));assert.ok(!last().text.includes('TEST 2'));
  });
  await test('Contact button and slash command send the exact corrected phone, channel and group',()=>{
   for(const text of ['📞 Bog‘lanish','Bog‘lanish','/contact','/contact@SyntheticMathUPBot']){
    send(text);const body=last();assert.equal(body.text,CONTACT_TEXT);assert.ok(body.text.includes('+998 88 729 66 67'));assert.ok(body.text.includes('@MathUP_Course_Gallaorol'));assert.ok(body.text.includes('@MathUP_Gallaorol'));assert.deepEqual(body.reply_markup.inline_keyboard.flat().map(b=>b.url),['https://t.me/MathUP_Course_Gallaorol','https://t.me/MathUP_Gallaorol']);
   }
  });
  await test('Corrected phone is tappable with UTF-16 entity offsets, without fabricating a Telegram tel URL',()=>{
   assert.equal(CONTACT_PHONE_COMPLETE,true);const e=CONTACT_ENTITIES[0];assert.equal(CONTACT_TEXT.slice(e.offset,e.offset+e.length),CONTACTS.phone);assert.equal(e.type,'phone_number');send('/contact');assert.deepEqual(last().entities,CONTACT_ENTITIES);assert.ok(last().reply_markup.inline_keyboard.flat().every(b=>b.url.startsWith('https://t.me/')));
  });
  await test('Contact access preserves an unfinished registration and duplicate updates create no extra replies',()=>{
   send('/register');const state=DB.sqlite.prepare('SELECT * FROM bot_sessions WHERE chat_id=?').get('910000000601');send('/contact');assert.deepEqual(DB.sqlite.prepare('SELECT * FROM bot_sessions WHERE chat_id=?').get('910000000601'),state);const u=update('📞 Bog‘lanish');engine(u);const n=DB.sqlite.prepare('SELECT COUNT(*) n FROM bot_outbox').get().n;assert.equal(engine(u),false);assert.equal(DB.sqlite.prepare('SELECT COUNT(*) n FROM bot_outbox').get().n,n);
  });
  await test('Registered parents keep contact and add-child buttons while a different account retains registration',()=>{
   DB.sqlite.exec("INSERT INTO parents(identity_key,display_name,telegram_chat_id,chat_verified) VALUES('synthetic-content','SYNTHETIC CONTENT PARENT','910000000601',1)");send('/start');const buttons=last().reply_markup.keyboard.flat().map(b=>plainButtonText(b.text));assert.ok(buttons.includes('Farzand qo‘shish'));assert.ok(buttons.includes('Bog‘lanish'));assert.ok(!buttons.includes('Ro‘yxatdan o‘tish'));send('/start','910000000602');assert.ok(last().reply_markup.keyboard.flat().map(b=>plainButtonText(b.text)).includes('Ro‘yxatdan o‘tish'));
  });
 }finally{DB.close();}
 await test('Telegram description and short description fit their API length limits',()=>{assert.ok(BOT_DESCRIPTION.length<=512);assert.ok(BOT_SHORT_DESCRIPTION.length<=120);assert.ok(BOT_DESCRIPTION.includes('START'));});
 const profiles=new Map(['','uz'].map(l=>[l,{description:'SYNTHETIC PREVIOUS',short_description:'SYNTHETIC PREVIOUS SHORT'}]));const methods=[];
 const api=async(method,body={})=>{methods.push(method);if(method==='getMe')return {is_bot:true,username:config.botUsername};const p=profiles.get(body.language_code);if(method==='getMyDescription')return {description:p.description};if(method==='getMyShortDescription')return {short_description:p.short_description};if(method==='setMyDescription'){p.description=body.description;return true;}if(method==='setMyShortDescription'){p.short_description=body.short_description;return true;}throw Error('Unexpected method');};
 await test('Profile preview does not mutate the bot; wrong bot identity prevents every profile write',async()=>{
  assert.equal((await configureBotProfile(config,api)).applied,false);assert.ok(!methods.some(m=>m.startsWith('set')));await assert.rejects(()=>configureBotProfile({...config,botUsername:'OtherSyntheticBot'},api,{apply:true}),/mos kelmadi/);assert.ok(!methods.some(m=>m.startsWith('set')));
 });
 await test('Profile update backs up public text before writes and verifies default and Uzbek descriptions',async()=>{
  let saved=false;const r=await configureBotProfile(config,api,{apply:true,beforeApply:async previous=>{assert.equal(methods.filter(m=>m.startsWith('set')).length,0);assert.equal(previous.previous.length,2);assert.ok(!JSON.stringify(previous).includes('token'));saved=true;}});assert.equal(saved,true);assert.equal(r.verified,true);assert.equal(r.changed,4);assert.ok(!methods.includes('sendMessage'));assert.ok(!methods.includes('deleteWebhook'));
 });
 await test('Reapplying identical bot profile is idempotent',async()=>{const n=methods.filter(m=>m.startsWith('set')).length;const r=await configureBotProfile(config,api,{apply:true});assert.equal(r.changed,0);assert.equal(methods.filter(m=>m.startsWith('set')).length,n);});
 await test('Profile adapter blocks messaging and strips credential-bearing network failures',async()=>{
  const call=profileApi('SYNTHETIC_PRIVATE_TOKEN',async()=>{throw Error('https://api.telegram.org/botSYNTHETIC_PRIVATE_TOKEN/getMe');});await assert.rejects(()=>call('sendMessage'),/ruxsat etilmagan/);await assert.rejects(()=>call('getMe'),e=>!e.message.includes('SYNTHETIC_PRIVATE_TOKEN'));
 });
 return count;
}
