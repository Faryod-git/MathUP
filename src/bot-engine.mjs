import {PRACTICE_CATALOG} from './practice-catalog.mjs';
import {practiceSection,practiceBook,practiceTopic} from './practice-sections.mjs';
import {WELCOME_TEXT,CONTACT_TEXT,CONTACT_ENTITIES,contactButtons} from './bot-content.mjs';
import {decorateKeyboard,plainButtonText} from './button-labels.mjs';
import { createHash, randomBytes } from 'node:crypto';
const sha=s=>createHash('sha256').update(s).digest('hex');
const clean=(v,n=120)=>typeof v==='string'&&v.trim().length>0&&v.trim().length<=n&&!/[\u0000-\u001f]/.test(v)?v.trim():null;
const validPhone=v=>{const p=String(v||'').replace(/[\s()-]/g,'');return /^\+998\d{9}$/.test(p)?p:null;};

// Pure synchronous state machine: SQLite and a transactional reply queue only.
// Network calls belong exclusively to poller.mjs.
export function createBotEngine(DB,config,{clock=()=>Math.floor(Date.now()/1000),practiceCatalog=PRACTICE_CATALOG}={}) {
  const db=DB.sqlite,query=(sql,...v)=>db.prepare(sql).get(...v),run=(sql,...v)=>db.prepare(sql).run(...v);
  return function processUpdate(update) {
    if(!Number.isSafeInteger(update?.update_id))return false;
    const member=update.my_chat_member;
    if(member?.chat?.type==='private'&&/^[1-9]\d{0,15}$/.test(String(member.chat.id))){
      const chat=String(member.chat.id);
      if(config.audience!=='all'&&!config.adminTelegramIds.map(String).includes(chat))return false;
      const state=member.new_chat_member?.status;
      if(!['kicked','left','member'].includes(state))return false;
      db.exec('BEGIN IMMEDIATE');
      try{
        if(query('SELECT update_id FROM bot_updates WHERE update_id=?',update.update_id)){db.exec('ROLLBACK');return false;}
        run('INSERT INTO bot_updates(update_id,created) VALUES(?,?)',update.update_id,clock());
        run('UPDATE bot_users SET active=?,version=version+1 WHERE chat_id=? AND active!=?',state==='member'?1:0,chat,state==='member'?1:0);
        db.exec('COMMIT');return true;
      }catch(e){db.exec('ROLLBACK');throw e;}
    }
    const callback=update.callback_query,m=callback?.message||update.message,from=callback?.from||m?.from;
    if(m?.chat?.type!=='private'||String(m.chat.id)!==String(from?.id)||!/^\d{1,16}$/.test(String(from.id))||from.id<=0||from.is_bot)return false;
    const chat=String(from.id);
    if(config.audience!=='all'&&!config.adminTelegramIds.map(String).includes(chat))return false;
    let seq=0;
    const queue=(method,body)=>run('INSERT INTO bot_outbox(update_id,seq,body_json) VALUES(?,?,?)',update.update_id,seq++,JSON.stringify({method,body}));
    const registered=()=>!!query('SELECT id FROM parents WHERE telegram_chat_id=? AND chat_verified=1 AND archived=0',chat);
    const homeKeyboard=()=>({keyboard:[[{text:registered()?'Farzand qo‘shish':'Ro‘yxatdan o‘tish'}],[{text:'Mening farzandlarim'},{text:'Bosh menyu'}],[{text:'Testlar'},{text:'Test javoblari'}],[{text:'Bog‘lanish'}],[{text:'Bekor qilish'}],...(config.adminTelegramIds.map(String).includes(chat)?[[{text:'/admin'}]]:[])],resize_keyboard:true,is_persistent:true});
    const say=(text,rows,markup)=>queue('sendMessage',{chat_id:chat,text,reply_markup:decorateKeyboard(markup||(rows?{inline_keyboard:rows}:homeKeyboard()))});
    const session=()=>query('SELECT * FROM bot_sessions WHERE chat_id=?',chat);
    const clear=()=>run('DELETE FROM bot_sessions WHERE chat_id=?',chat);
    const save=(stage,data)=>run('INSERT INTO bot_sessions(chat_id,stage,data_json,expires) VALUES(?,?,?,?) ON CONFLICT(chat_id) DO UPDATE SET stage=excluded.stage,data_json=excluded.data_json,expires=excluded.expires',chat,stage,JSON.stringify(data),clock()+1800);
    const choice=(label,key,nonce)=>({text:label,callback_data:key+':'+nonce});
    const menu=()=>say(WELCOME_TEXT);
    const finishRegistration=(data,requestedConsent,preserveOptOut=false)=>{
            const recent=query('SELECT COUNT(*) n FROM mathup_registrations WHERE telegram_id=? AND created_at>?',chat,clock()-86400).n;
            const old=query('SELECT * FROM parents WHERE telegram_chat_id=?',chat);
            if(recent>=5)say('Bugungi ro‘yxat limiti tugadi. Ertaga yoki ma’muriyat orqali qo‘shing.');
            else if(old?.archived)say('Ma’muriyatga murojaat qiling.');
            else {
              const consent=preserveOptOut&&old&&old.consent===0?0:(requestedConsent?1:0),t=new Date(clock()*1000).toISOString();
              if(old)run('UPDATE parents SET display_name=?,phone=?,telegram_username=?,chat_verified=1,consent=?,version=version+1,updated_at=? WHERE id=?',data.name,data.phone,String(from.username||'').slice(0,64),consent,t,old.id);
              else run('INSERT INTO parents(identity_key,display_name,phone,telegram_chat_id,telegram_username,chat_verified,consent,created_at,updated_at) VALUES(?,?,?,?,?,1,?,?,?)','telegram:'+chat,data.name,data.phone,chat,String(from.username||'').slice(0,64),consent,t,t);
              const parent=query('SELECT id FROM parents WHERE telegram_chat_id=?',chat);
              run("INSERT INTO students(parent_id,full_name,grade,status,created_at,updated_at) VALUES(?,?,?,'pending_current',?,?) ON CONFLICT(parent_id,full_name) DO NOTHING",parent.id,data.child,data.grade,t,t);
              run('INSERT INTO mathup_registrations(id,telegram_id,parent_id,created_at) VALUES(?,?,?,?)','bot:'+update.update_id,chat,parent.id,clock());
              say('Ma’lumotlar saqlandi. O‘qish holatini ma’muriyat tasdiqlaydi. Yana farzand qo‘shish uchun menyudagi Farzand qo‘shish tugmasidan foydalaning.');
            }
      clear();
    };
    db.exec('BEGIN IMMEDIATE');
    try {
      if(query('SELECT update_id FROM bot_updates WHERE update_id=?',update.update_id)){db.exec('ROLLBACK');return false;}
      run('INSERT INTO bot_updates(update_id,created) VALUES(?,?)',update.update_id,clock());
      run('INSERT INTO bot_users(chat_id,first_seen,last_seen) VALUES(?,?,?) ON CONFLICT(chat_id) DO UPDATE SET last_seen=excluded.last_seen,version=bot_users.version+CASE WHEN bot_users.active=0 THEN 1 ELSE 0 END,active=1',chat,clock(),clock());
      run('DELETE FROM bot_sessions WHERE expires<=?',clock());
      if(callback?.id)queue('answerCallbackQuery',{callback_query_id:callback.id});
      const text=typeof m.text==='string'?m.text.trim():'',action=String(callback?.data||'');
      const practiceBookAction=/^practice:(tests|answers):book:([123])(?::page:(0|[1-9]\d{0,2}))?$/.exec(action);
      const practiceTopicAction=/^practice:(tests|answers):topic:([123]):([1-9]\d{0,2})$/.exec(action);
      const buttonText=plainButtonText(text);
      let command=callback?'':buttonText.split(/\s+/)[0].replace(/@[A-Za-z0-9_]+$/,'').toLowerCase();
      const shortcuts={'Ro‘yxatdan o‘tish':'/register','Farzand qo‘shish':'/register','Mening farzandlarim':'/children','Bosh menyu':'/start','Bog‘lanish':'/contact','Testlar':'/tests','Test javoblari':'/answers','Bekor qilish':'/cancel','Xabarlarni to‘xtatish':'/stop'};
      if(!callback&&shortcuts[buttonText])command=shortcuts[buttonText];if(action==='cancel')command='/cancel';if(action==='children')command='/children';if(action==='practice:tests')command='/tests';if(action==='practice:answers')command='/answers';if(action==='practice:home')command='/start';
      if(command==='/cancel'){clear();say('Jarayon bekor qilindi. /register orqali qayta boshlashingiz mumkin.');}
      else if(command==='/stop'){
        clear();run('UPDATE parents SET consent=0,version=version+1,updated_at=? WHERE telegram_chat_id=?',new Date(clock()*1000).toISOString(),chat);
        say('Xabarlar bo‘yicha ma’muriyatga murojaat qiling. Telegram xabarlarini to‘xtatish uchun botni bloklashingiz mumkin.');
      }
      else if(practiceBookAction){const section=practiceBook(practiceBookAction[1],practiceBookAction[2],Number(practiceBookAction[3]||0),practiceCatalog);say(section.text,section.rows);}
      else if(practiceTopicAction){
        const section=practiceTopic(practiceTopicAction[1],practiceTopicAction[2],Number(practiceTopicAction[3]),practiceCatalog);
        if(section.photo)queue('sendPhoto',{chat_id:chat,photo:section.photo,caption:section.text,reply_markup:decorateKeyboard({inline_keyboard:section.rows})});
        else say(section.text,section.rows);
      }
      else if(action.startsWith('practice:')&&!['practice:tests','practice:answers','practice:home'].includes(action))say('Mavzu yoki sahifa topilmadi. Kitobni qayta tanlang.',practiceSection('tests').rows);
      else if(command==='/tests'||command==='/answers'){const section=practiceSection(command==='/tests'?'tests':'answers');say(section.text,section.rows);}
      else if(command==='/contact') {queue('sendMessage',{chat_id:chat,text:CONTACT_TEXT,entities:CONTACT_ENTITIES,reply_markup:{inline_keyboard:contactButtons()}});}
      else if(command==='/children') {
        clear();const parent=query('SELECT id FROM parents WHERE telegram_chat_id=? AND chat_verified=1 AND archived=0',chat);
        if(!parent)say('Hozircha ro‘yxatdan o‘tmagansiz. Ro‘yxatdan o‘tish tugmasini bosing.');
        else {const children=db.prepare('SELECT full_name,grade,status FROM students WHERE parent_id=? AND archived=0 ORDER BY id LIMIT 20').all(parent.id);const labels={pending_current:'Tasdiqlash kutilmoqda',current:'O‘qiydi',new_lead:'Yangi murojaat',testing_only:'Faol emas'};say(children.length?'Farzandlaringiz (20 tagacha):\n'+children.map((c,i)=>(i+1)+'. '+c.full_name+' — '+(c.grade?c.grade+'-sinf':'sinf kiritilmagan')+' — '+labels[c.status]).join('\n'):'Hozircha farzand yozuvi yo‘q. Farzand qo‘shish tugmasini bosing.');}
      }
      else if(command==='/admin') {
        if(config.adminTelegramIds.map(String).includes(chat))say(`Admin panelni server ishlayotgan kompyuterda oching: http://127.0.0.1:${config.port}/`);
        else say('Bu buyruq faqat administrator uchun.');
      }
      else if(command==='/start'&&text.split(/\s+/)[1]?.startsWith('link_')) {
        clear();const code=text.split(/\s+/)[1].slice(5);let token='';
        if(/^[A-Za-z0-9_-]{43}$/.test(code)){const b=Buffer.from(code,'base64url');if(b.length===32&&b.toString('base64url')===code)token=b.toString('hex');}
        const hash=sha(token),link=token?query('SELECT * FROM mathup_link_tokens WHERE hash=? AND used=0 AND expires>?',hash,clock()):null;
        const p=link?query('SELECT * FROM parents WHERE id=? AND archived=0',link.parent_id):null;
        if(!p||p.telegram_chat_id||query('SELECT id FROM parents WHERE telegram_chat_id=?',chat))say('Bog‘lash havolasi yaroqsiz yoki akkaunt allaqachon bog‘langan. Ma’muriyatdan yangi havola oling.');
        else {const nonce=randomBytes(8).toString('hex');save('link',{hash,parentId:p.id,parentVersion:p.version,nonce});say('Shu Telegram akkauntingizni ma’muriyat bergan ota-ona yozuviga bog‘lash va o‘quv markazi xabarlarini olishga rozimisiz? Havola faqat o‘zingizga tegishli bo‘lsa tasdiqlang.',[[choice('Roziman','link-yes',nonce),choice('Bekor qilish','link-no',nonce)]]);}
      }
      else if(command==='/register'||action==='register') {
        clear();
        if(!config.publicRegistrationEnabled)say('Ro‘yxatdan o‘tish hozir yoqilmagan. Ma’muriyatga murojaat qiling.');
        else if(query('SELECT id FROM parents WHERE telegram_chat_id=? AND archived=1',chat))say('Ma’muriyatga murojaat qiling.');
        else {const nonce=randomBytes(8).toString('hex');save('consent',{nonce,noticeVersion:2});say('Ro‘yxatdan o‘tishda o‘zingiz va farzandingizning ism-familiyasi, telefon raqami, sinfi va Telegram akkauntingiz o‘quv markazi bazasida saqlanadi. Ushbu bot orqali o‘quv markazining xabarlari ham yuboriladi. Ota-ona yoki qonuniy vakil sifatida bunga rozimisiz? Bekor qilish mumkin.',[[choice('Roziman','consent-yes',nonce),choice('Bekor qilish','consent-no',nonce)]]);}
      }
      else if(command==='/start'||command==='/help') {clear();menu();}
      else {
        const s=session(),data=s?JSON.parse(s.data_json):{};
        const matches=prefix=>action===prefix+':'+data.nonce;
        if(!s){if(callback)say('Tugma eskirgan. /register orqali qayta boshlang.');else menu();}
        else if(s.stage==='link') {
          if(matches('link-no')){clear();say('Bog‘lash bekor qilindi.');}
          else if(matches('link-yes')) {
            const t=new Date(clock()*1000).toISOString();
            const r=run(`UPDATE parents SET telegram_chat_id=?,telegram_username=?,chat_verified=1,consent=1,version=version+1,updated_at=?
              WHERE id=? AND version=? AND archived=0 AND (telegram_chat_id IS NULL OR telegram_chat_id='')
              AND NOT EXISTS(SELECT 1 FROM parents WHERE telegram_chat_id=?)
              AND EXISTS(SELECT 1 FROM mathup_link_tokens WHERE hash=? AND parent_id=? AND used=0 AND expires>?)`,chat,String(from.username||'').slice(0,64),t,data.parentId,data.parentVersion,chat,data.hash,data.parentId,clock());
            if(r.changes){run('UPDATE mathup_link_tokens SET used=1 WHERE hash=?',data.hash);say('Telegram akkauntingiz bog‘landi.');}
            else say('Bog‘lash kodi eskirgan yoki yozuv o‘zgargan. Ma’muriyatdan yangi havola oling.');
            clear();
          }else say('Joriy tasdiqlash tugmasidan foydalaning yoki /cancel yuboring.');
        }
        else if(s.stage==='consent') {
          if(matches('consent-no')){clear();say('Ro‘yxatdan o‘tish bekor qilindi.');}
          else if(matches('consent-yes')){save('parent',{messageNoticeAccepted:data.noticeVersion===2});say('Ota-onaning ism-familiyasini kiriting (120 belgigacha).');}
          else say('Joriy rozilik tugmasini bosing yoki /cancel yuboring.');
        }
        else if(callback&&!['messages','grade'].includes(s.stage))say('Bu tugma eskirgan. Joriy savolga javob yozing.');
        else if(s.stage==='parent') {
          const name=clean(text);if(!name)say('Ism-familiyani 1–120 belgi bilan kiriting.');else {save('phone',{...data,name});say('Telefon raqamingizni tugma orqali ulashing yoki +998 va 9 ta raqamni yozing.',null,{keyboard:[[{text:'Telefon raqamimni ulashish',request_contact:true}],[{text:'Bekor qilish'}]],resize_keyboard:true,one_time_keyboard:true});}
        }
        else if(s.stage==='phone') {
          const ownContact=m.contact&&String(m.contact.user_id)===chat;const supplied=m.contact?(ownContact?String(m.contact.phone_number).replace(/^\+?/,'+'):''):text;const phone=validPhone(supplied);if(!phone)say('Telefon formati: +998 va 9 ta raqam.');else {save('child',{...data,phone});say('Farzandingizning ism-familiyasini kiriting (120 belgigacha).');}
        }
        else if(s.stage==='child') {
          const child=clean(text);if(!child)say('Farzandingizning ism-familiyasini 1–120 belgi bilan kiriting.');else {const nonce=randomBytes(8).toString('hex');save('grade',{...data,child,nonce});const buttons=Array.from({length:11},(_,i)=>({text:(i+1)+'-sinf',callback_data:'grade_'+nonce+'_'+(i+1)}));say('Farzandingiz sinfini tanlang yoki 1–11 raqamini yozing.',[buttons.slice(0,4),buttons.slice(4,8),buttons.slice(8)]);}
        }
        else if(s.stage==='grade') {
          const picked=/^grade_([a-f0-9]{16})_([1-9]|10|11)$/.exec(action);const value=callback?(picked&&picked[1]===data.nonce?picked[2]:''):text;
          if(!/^(?:[1-9]|10|11)$/.test(value))say('Sinfni 1–11 oralig‘ida kiriting.');
          else if(data.messageNoticeAccepted!==true){clear();say('Ro‘yxat shakli yangilandi. Menyudan qayta boshlang.');}
          else finishRegistration({...data,grade:Number(value)},true,true);
        }
        else if(s.stage==='messages') {
          if(!matches('messages-yes')&&!matches('messages-no'))say('Joriy xabarlar roziligi tugmasini bosing.');
          else {
            finishRegistration(data,matches('messages-yes'));

          }
        }
      }
      db.exec('COMMIT');return true;
    }catch(e){db.exec('ROLLBACK');throw e;}
  };
}
