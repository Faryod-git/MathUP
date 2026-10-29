const fail=(status,message)=>{throw Object.assign(Error(message),{status});};
const validId=v=>/^[1-9]\d{0,12}$/.test(String(v));
const version=v=>{if(!Number.isSafeInteger(v)||v<1)fail(400,'Versiya noto‘g‘ri');return v;};
const groupName=v=>{if(typeof v!=='string')fail(400,'Guruh nomini kiriting');const n=v.normalize('NFC').trim().replace(/\s+/g,' ');if(!n||n.length>80||/[\u0000-\u001f]/.test(n))fail(400,'Guruh nomi 1–80 belgi bo‘lsin');return n;};
const tx=(db,fn)=>{db.exec('BEGIN IMMEDIATE');try{const r=fn();db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}};
const getGroup=(db,id)=>{const g=db.prepare('SELECT * FROM student_groups_catalog WHERE id=?').get(id);if(!g)fail(404,'Guruh topilmadi');return g;};
const active='s.archived=0 AND p.archived=0';

export function ensureGroups(db){
 db.exec(`
  CREATE TABLE IF NOT EXISTS student_groups_catalog(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,name_key TEXT NOT NULL UNIQUE,version INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL DEFAULT (datetime('now')));
  CREATE TABLE IF NOT EXISTS student_group_members(group_id INTEGER NOT NULL REFERENCES student_groups_catalog(id) ON DELETE CASCADE,student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,PRIMARY KEY(group_id,student_id));
  CREATE INDEX IF NOT EXISTS mathup_groups_student ON student_group_members(student_id);
 `);
}

export function groupsRoute(DB,path,method,b,url){
 const db=DB.sqlite;
 if(path==='/api/groups'&&method==='GET')return {items:db.prepare(`SELECT g.id,g.name,g.version,COUNT(s.id) student_count FROM student_groups_catalog g LEFT JOIN student_group_members m ON m.group_id=g.id LEFT JOIN students s ON s.id=m.student_id AND s.archived=0 AND EXISTS(SELECT 1 FROM parents p WHERE p.id=s.parent_id AND p.archived=0) GROUP BY g.id ORDER BY g.name_key,g.id`).all().map(g=>({...g,id:String(g.id)}))};
 if(path==='/api/groups'&&method==='POST'){
  const name=groupName(b.name);
  return tx(db,()=>{
   if(db.prepare('SELECT COUNT(*) n FROM student_groups_catalog').get().n>=1000)fail(400,'1000 tagacha guruh yaratish mumkin');
   if(db.prepare('SELECT id FROM student_groups_catalog WHERE name_key=?').get(name.toLowerCase()))fail(409,'Bu nomli guruh allaqachon bor');
   const g=db.prepare('INSERT INTO student_groups_catalog(name,name_key) VALUES(?,?) RETURNING id,name,version').get(name,name.toLowerCase());return {...g,id:String(g.id)};
  });
 }
 let match=path.match(/^\/api\/groups\/([1-9]\d{0,12})$/);
 if(match&&method==='PATCH'){
  const name=groupName(b.name),v=version(b.version);
  return tx(db,()=>{const g=getGroup(db,match[1]);if(g.version!==v)fail(409,'Guruh o‘zgargan. Ro‘yxatni yangilang');if(db.prepare('SELECT id FROM student_groups_catalog WHERE name_key=? AND id!=?').get(name.toLowerCase(),g.id))fail(409,'Bu nomli guruh allaqachon bor');db.prepare('UPDATE student_groups_catalog SET name=?,name_key=?,version=version+1 WHERE id=?').run(name,name.toLowerCase(),g.id);return {ok:true};});
 }
 if(match&&method==='DELETE'){
  if(b.confirm!==true)fail(400,'Guruhni o‘chirishni tasdiqlang');const v=version(b.version);
  return tx(db,()=>{const g=getGroup(db,match[1]);if(g.version!==v)fail(409,'Guruh o‘zgargan. Ro‘yxatni yangilang');db.prepare('UPDATE students SET version=version+1,updated_at=? WHERE id IN (SELECT student_id FROM student_group_members WHERE group_id=?)').run(new Date().toISOString(),g.id);db.prepare('DELETE FROM student_groups_catalog WHERE id=?').run(g.id);return {ok:true,students_deleted:false};});
 }
 match=path.match(/^\/api\/groups\/([1-9]\d{0,12})\/students$/);
 if(match&&method==='GET'){
  const group=getGroup(db,match[1]),q=(url.searchParams.get('q')||'').trim().slice(0,120),offset=Math.max(0,Math.min(100000,Math.floor(Number(url.searchParams.get('offset')))||0)),onlyMembers=url.searchParams.get('members')==='true';
  const where=active+" AND (instr(lower(s.full_name),lower(?))>0 OR instr(lower(p.display_name),lower(?))>0)"+(onlyMembers?' AND EXISTS(SELECT 1 FROM student_group_members m WHERE m.student_id=s.id AND m.group_id=?)':'');
  const args=onlyMembers?[q,q,group.id]:[q,q];
  const items=db.prepare(`SELECT s.id,s.full_name,s.grade,s.version,p.display_name parent_name,EXISTS(SELECT 1 FROM student_group_members m WHERE m.student_id=s.id AND m.group_id=?) member FROM students s JOIN parents p ON p.id=s.parent_id WHERE ${where} ORDER BY s.full_name,s.id LIMIT 51 OFFSET ?`).all(group.id,...args,offset).map(s=>({...s,id:String(s.id)}));
  return {group:{...group,id:String(group.id)},items,member_count:db.prepare(`SELECT COUNT(*) n FROM student_group_members m JOIN students s ON s.id=m.student_id JOIN parents p ON p.id=s.parent_id WHERE m.group_id=? AND ${active}`).get(group.id).n};
 }
 match=path.match(/^\/api\/groups\/([1-9]\d{0,12})\/members$/);
 if(match&&method==='PATCH'){
  const v=version(b.version),changes=b.changes;
  if(!Array.isArray(changes)||!changes.length||changes.length>100||new Set(changes.map(c=>String(c?.student_id))).size!==changes.length||changes.some(c=>!c||!validId(c.student_id)||typeof c.member!=='boolean'))fail(400,'1–100 ta o‘quvchi o‘zgarishini yuboring');
  for(const c of changes)version(c.student_version);
  return tx(db,()=>{
   const g=getGroup(db,match[1]);if(g.version!==v)fail(409,'Guruh tarkibi o‘zgargan. Qayta oching');
   for(const c of changes){const s=db.prepare(`SELECT s.version FROM students s JOIN parents p ON p.id=s.parent_id WHERE s.id=? AND ${active}`).get(String(c.student_id));if(!s||s.version!==c.student_version)fail(409,'O‘quvchi o‘zgargan yoki o‘chirilgan. Guruhni qayta oching');}
   let changed=0;
   for(const c of changes){const result=c.member?db.prepare('INSERT OR IGNORE INTO student_group_members(group_id,student_id) VALUES(?,?)').run(g.id,String(c.student_id)):db.prepare('DELETE FROM student_group_members WHERE group_id=? AND student_id=?').run(g.id,String(c.student_id));if(result.changes){changed++;db.prepare('UPDATE students SET version=version+1,updated_at=? WHERE id=?').run(new Date().toISOString(),String(c.student_id));}}
   if(changed)db.prepare('UPDATE student_groups_catalog SET version=version+1 WHERE id=?').run(g.id);
   return {ok:true,changed};
  });
 }
 match=path.match(/^\/api\/groups\/([1-9]\d{0,12})\/recipients$/);
 if(match&&method==='GET'){
  const g=getGroup(db,match[1]);
  const items=db.prepare(`SELECT s.*,p.telegram_chat_id parent_telegram_id,p.chat_verified parent_chat_verified FROM student_group_members m JOIN students s ON s.id=m.student_id JOIN parents p ON p.id=s.parent_id WHERE m.group_id=? AND ${active} AND p.chat_verified=1 AND p.telegram_chat_id IS NOT NULL AND p.telegram_chat_id!='' ORDER BY s.id LIMIT 101`).all(g.id).map(s=>({...s,id:String(s.id),parent_id:String(s.parent_id)}));
  if(!items.length)fail(409,'Guruhda Telegram akkaunti bog‘langan ota-ona yo‘q');
  if(items.length>100||new Set(items.map(s=>s.parent_id)).size>20)fail(400,'Xabar uchun 100 tagacha o‘quvchi va 20 tagacha ota-ona tanlanadi. Guruhni filtrlab, o‘quvchilarni qo‘lda tanlang');
  const total=db.prepare(`SELECT COUNT(*) n FROM student_group_members m JOIN students s ON s.id=m.student_id JOIN parents p ON p.id=s.parent_id WHERE m.group_id=? AND ${active}`).get(g.id).n;
  return {items,skipped:total-items.length,group:{id:String(g.id),name:g.name}};
 }
 return undefined;
}
