export function ensureAudience(db) {
 db.exec(`
 CREATE TABLE IF NOT EXISTS bot_users(chat_id TEXT PRIMARY KEY,active INTEGER NOT NULL DEFAULT 1,version INTEGER NOT NULL DEFAULT 1,identity TEXT NOT NULL DEFAULT (lower(hex(randomblob(16)))),first_seen INTEGER NOT NULL,last_seen INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS bot_broadcasts(id TEXT PRIMARY KEY,actor TEXT NOT NULL,body_hash TEXT NOT NULL,recipient_count INTEGER NOT NULL,text TEXT,expires INTEGER NOT NULL,state TEXT NOT NULL DEFAULT 'preview',created INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS bot_broadcast_recipients(batch_id TEXT NOT NULL REFERENCES bot_broadcasts(id) ON DELETE CASCADE,chat_id TEXT NOT NULL REFERENCES bot_users(chat_id) ON DELETE CASCADE,user_version INTEGER NOT NULL,user_identity TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'preview',next_attempt INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(batch_id,chat_id));
 CREATE INDEX IF NOT EXISTS bot_broadcast_pending ON bot_broadcast_recipients(state,next_attempt);
 `);
 // Only locally verified bindings are known contacts. No Telegram/ChatPlace import.
 if(!db.prepare("SELECT value FROM bot_state WHERE key='audience-migration-1'").get()){
  db.exec('BEGIN IMMEDIATE');
  try{
   db.prepare("INSERT OR IGNORE INTO bot_users(chat_id,first_seen,last_seen) SELECT telegram_chat_id,?,0 FROM parents WHERE archived=0 AND chat_verified=1 AND telegram_chat_id GLOB '[1-9]*' AND telegram_chat_id NOT GLOB '*[^0-9]*'").run(Math.floor(Date.now()/1000));
   db.exec("INSERT INTO bot_state(key,value) VALUES('audience-migration-1','done');COMMIT");
  }catch(e){db.exec('ROLLBACK');throw e;}
 }
}

export function deleteStudent(DB,id,version) {
 const db=DB.sqlite,fail=(status,message)=>{throw Object.assign(Error(message),{status});};
 db.exec('BEGIN IMMEDIATE');
 try{
  const s=db.prepare('SELECT * FROM students WHERE id=?').get(id);
  if(!s)fail(404,'O‘quvchi topilmadi');
  if(s.version!==version)fail(409,'O‘quvchi ma’lumotlari o‘zgargan. Ro‘yxatni yangilang');
  db.prepare('DELETE FROM students WHERE id=? AND version=?').run(id,version);
  let parentDeleted=false;
  if(!db.prepare('SELECT id FROM students WHERE parent_id=? LIMIT 1').get(s.parent_id)){
   removeParent(db,s.parent_id);parentDeleted=true;
  }
  db.exec('COMMIT');
  return {ok:true,deleted_id:String(id),parent_deleted:parentDeleted,parent_id:String(s.parent_id)};
 }catch(e){db.exec('ROLLBACK');throw e;}
}

function removeParent(db,parentId){
   const p=db.prepare('SELECT * FROM parents WHERE id=?').get(parentId);
   if(p?.telegram_chat_id){
    const has=table=>!!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table);
    if(has('bot_sessions'))db.prepare('DELETE FROM bot_sessions WHERE chat_id=?').run(p.telegram_chat_id);
    if(has('bot_outbox'))db.prepare("DELETE FROM bot_outbox WHERE body_json IS NOT NULL AND CAST(json_extract(body_json,'$.body.chat_id') AS TEXT)=?").run(p.telegram_chat_id);
    if(has('bot_users'))db.prepare('DELETE FROM bot_users WHERE chat_id=?').run(p.telegram_chat_id);
   }
   for(const table of ['mathup_link_tokens','mathup_registrations','mathup_deliveries'])db.prepare('DELETE FROM '+table+' WHERE parent_id=?').run(parentId);
   db.prepare('DELETE FROM parents WHERE id=?').run(parentId);
   // Completed/cancelled broadcasts must not retain message text indefinitely.
   if(db.prepare("SELECT name FROM sqlite_master WHERE name='bot_broadcasts'").get())db.exec("UPDATE bot_broadcasts SET text=NULL,state='done' WHERE state='queued' AND NOT EXISTS(SELECT 1 FROM bot_broadcast_recipients r WHERE r.batch_id=bot_broadcasts.id AND r.state IN ('queued','sending'))");
}

export function deleteParent(DB,id,version){
 const db=DB.sqlite,fail=(status,message)=>{throw Object.assign(Error(message),{status});};
 db.exec('BEGIN IMMEDIATE');
 try{
  const p=db.prepare('SELECT * FROM parents WHERE id=?').get(id);
  if(!p)fail(404,'Ota-ona topilmadi');
  if(p.version!==version)fail(409,'Ota-ona ma’lumotlari o‘zgargan. Ro‘yxatni yangilang');
  if(db.prepare('SELECT id FROM students WHERE parent_id=? LIMIT 1').get(id))fail(409,'Ota-onaning farzandi bor. Avval kerakli o‘quvchilarni o‘chiring');
  removeParent(db,id);db.exec('COMMIT');return {ok:true,deleted_id:String(id)};
 }catch(e){db.exec('ROLLBACK');throw e;}
}
