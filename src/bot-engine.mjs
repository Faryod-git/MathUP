import { createHash, randomBytes } from 'node:crypto';
const sha=s=>createHash('sha256').update(s).digest('hex');
const clean=(v,n=120)=>typeof v==='string'&&v.trim().length>0&&v.trim().length<=n&&!/[\u0000-\u001f]/.test(v)?v.trim():null;
const validPhone=v=>{const p=String(v||'').replace(/[\s()-]/g,'');return /^\+998\d{9}$/.test(p)?p:null;};

// Pure synchronous state machine: SQLite and a transactional reply queue only.
// Network calls belong exclusively to poller.mjs.
export function createBotEngine(DB,config,{clock=()=>Math.floor(Date.now()/1000)}={}) {
  const db=DB.sqlite,query=(sql,...v)=>db.prepare(sql).get(...v),run=(sql,...v)=>db.prepare(sql).run(...v);
  return function processUpdate(update) {
    if(!Number.isSafeInteger(update?.update_id))return false;
    const callback=update.callback_query,m=callback?.message||update.message,from=callback?.from||m?.from;
    if(m?.chat?.type!=='private'||String(m.chat.id)!==String(from?.id)||!/^\d{1,16}$/.test(String(from.id))||from.id<=0||from.is_bot)return false;
    const chat=String(from.id);
    if(config.audience!=='all'&&!config.adminTelegramIds.map(String).includes(chat))return false;
    let seq=0;
    const queue=(method,body)=>run('INSERT INTO bot_outbox(update_id,seq,body_json) VALUES(?,?,?)',update.update_id,seq++,JSON.stringify({method,body}));
    const say=(text,rows)=>queue('sendMessage',{chat_id:chat,text,...(rows?{reply_markup:{inline_keyboard:rows}}:{})});
    const session=()=>query('SELECT * FROM bot_sessions WHERE chat_id=?',chat);
    const clear=()=>run('DELETE FROM bot_sessions WHERE chat_id=?',chat);
    const save=(stage,data)=>run('INSERT INTO bot_sessions(chat_id,stage,data_json,expires) VALUES(?,?,?,?) ON CONFLICT(chat_id) DO UPDATE SET stage=excluded.stage,data_json=excluded.data_json,expires=excluded.expires',chat,stage,JSON.stringify(data),clock()+1800);
    const choice=(label,key,nonce)=>({text:label,callback_data:key+':'+nonce});
    const menu=()=>say('MathUP. Ota-ona sifatida ro‘yxatdan o‘tish yoki farzand qo‘shish uchun tugmani bosing. /cancel — bekor qilish; /stop — xabarlar roziligini bekor qilish.',[[{text:'Ota-ona sifatida ro‘yxatdan o‘tish',callback_data:'register'}]]);
    db.exec('BEGIN IMMEDIATE');
    try {
      if(query('SELECT update_id FROM bot_updates WHERE update_id=?',update.update_id)){db.exec('ROLLBACK');return false;}
      run('INSERT INTO bot_updates(update_id,created) VALUES(?,?)',update.update_id,clock());
      run('DELETE FROM bot_sessions WHERE expires<=?',clock());
      if(callback?.id)queue('answerCallbackQuery',{callback_query_id:callback.id});
      const text=typeof m.text==='string'?m.text.trim():'',action=String(callback?.data||'');
      const command=callback?'':text.split(/\s+/)[0].replace(/@[A-Za-z0-9_]+$/,'').toLowerCase();
      if(command==='/cancel'){clear();say('Jarayon bekor qilindi. /register orqali qayta boshlashingiz mumkin.');}
      else if(command==='/stop'){
        clear();run('UPDATE parents SET consent=0,version=version+1,updated_at=? WHERE telegram_chat_id=?',new Date(clock()*1000).toISOString(),chat);
        say('Xabarlar roziligi bekor qilindi. Qayta rozilik berish uchun /register.');
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
        else {const nonce=randomBytes(8).toString('hex');save('consent',{nonce});say('Siz ota-ona yoki qonuniy vakil sifatida o‘zingiz va farzandingizning ism-familiyasi, telefon raqami, sinfi va Telegram akkauntingizni o‘quv markazi bazasida saqlashga rozimisiz? Xabarlar uchun rozilik keyin alohida so‘raladi. /cancel bilan bekor qilishingiz mumkin.',[[choice('Roziman','consent-yes',nonce),choice('Bekor qilish','consent-no',nonce)]]);}
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
            if(r.changes){run('UPDATE mathup_link_tokens SET used=1 WHERE hash=?',data.hash);say('Telegram akkauntingiz bog‘landi. Xabarlar roziligini /stop orqali bekor qilishingiz mumkin.');}
            else say('Bog‘lash kodi eskirgan yoki yozuv o‘zgargan. Ma’muriyatdan yangi havola oling.');
            clear();
          }else say('Joriy tasdiqlash tugmasidan foydalaning yoki /cancel yuboring.');
        }
        else if(s.stage==='consent') {
          if(matches('consent-no')){clear();say('Ro‘yxatdan o‘tish bekor qilindi.');}
          else if(matches('consent-yes')){save('parent',{});say('Ota-onaning ism-familiyasini kiriting (120 belgigacha).');}
          else say('Joriy rozilik tugmasini bosing yoki /cancel yuboring.');
        }
        else if(callback&&s.stage!=='messages')say('Bu tugma eskirgan. Joriy savolga javob yozing.');
        else if(s.stage==='parent') {
          const name=clean(text);if(!name)say('Ism-familiyani 1–120 belgi bilan kiriting.');else {save('phone',{name});say('Telefon raqamingizni +998 va 9 ta raqam ko‘rinishida kiriting.');}
        }
        else if(s.stage==='phone') {
          const phone=validPhone(text);if(!phone)say('Telefon formati: +998 va 9 ta raqam.');else {save('child',{...data,phone});say('Farzandingizning ism-familiyasini kiriting (120 belgigacha).');}
        }
        else if(s.stage==='child') {
          const child=clean(text);if(!child)say('Farzandingizning ism-familiyasini 1–120 belgi bilan kiriting.');else {save('grade',{...data,child});say('Farzandingiz nechanchi sinfda o‘qiydi? 1–11 oralig‘ida raqam yuboring.');}
        }
        else if(s.stage==='grade') {
          if(!/^(?:[1-9]|10|11)$/.test(text))say('Sinfni 1–11 oralig‘ida kiriting.');
          else {const nonce=randomBytes(8).toString('hex');save('messages',{...data,grade:Number(text),nonce});say('O‘quv markazining Telegram xabarlarini olishga rozimisiz? Rad etsangiz ham ro‘yxatga olinasiz. /stop orqali rozilikni keyin bekor qilishingiz mumkin.',[[choice('Xabarlarni olaman','messages-yes',nonce),choice('Hozircha yo‘q','messages-no',nonce)]]);}
        }
        else if(s.stage==='messages') {
          if(!matches('messages-yes')&&!matches('messages-no'))say('Joriy xabarlar roziligi tugmasini bosing.');
          else {
            const recent=query('SELECT COUNT(*) n FROM mathup_registrations WHERE telegram_id=? AND created_at>?',chat,clock()-86400).n;
            const old=query('SELECT * FROM parents WHERE telegram_chat_id=?',chat);
            if(recent>=5)say('Bugungi ro‘yxat limiti tugadi. Ertaga yoki ma’muriyat orqali qo‘shing.');
            else if(old?.archived)say('Ma’muriyatga murojaat qiling.');
            else {
              const consent=matches('messages-yes')?1:0,t=new Date(clock()*1000).toISOString();
              if(old)run('UPDATE parents SET display_name=?,phone=?,telegram_username=?,chat_verified=1,consent=?,version=version+1,updated_at=? WHERE id=?',data.name,data.phone,String(from.username||'').slice(0,64),consent,t,old.id);
              else run('INSERT INTO parents(identity_key,display_name,phone,telegram_chat_id,telegram_username,chat_verified,consent,created_at,updated_at) VALUES(?,?,?,?,?,1,?,?,?)','telegram:'+chat,data.name,data.phone,chat,String(from.username||'').slice(0,64),consent,t,t);
              const parent=query('SELECT id FROM parents WHERE telegram_chat_id=?',chat);
              run("INSERT INTO students(parent_id,full_name,grade,status,created_at,updated_at) VALUES(?,?,?,'pending_current',?,?) ON CONFLICT(parent_id,full_name) DO NOTHING",parent.id,data.child,data.grade,t,t);
              run('INSERT INTO mathup_registrations(id,telegram_id,parent_id,created_at) VALUES(?,?,?,?)','bot:'+update.update_id,chat,parent.id,clock());
              say('Ma’lumotlar saqlandi. O‘qish holatini ma’muriyat tasdiqlaydi. Yana farzand qo‘shish uchun /register. Xabarlar roziligini bekor qilish: /stop.');
            }
            clear();
          }
        }
      }
      db.exec('COMMIT');return true;
    }catch(e){db.exec('ROLLBACK');throw e;}
  };
}
