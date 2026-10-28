export function createStudentSelection(){
 const rows=new Map();
 const eligible=s=>!!s.parent_telegram_id&&!!s.parent_consent&&!!s.parent_chat_verified;
 return {get size(){return rows.size},parentCount(){return new Set([...rows.values()].map(s=>String(s.parent_id))).size},has(id){return rows.has(String(id))},delete(id){return rows.delete(String(id))},clear(){rows.clear()},ids(){return [...rows.keys()]},add(s){if(!eligible(s))throw Error('Telegram yoki xabarlar roziligi yetishmaydi');const next=new Map(rows);next.set(String(s.id),s);if(next.size>100||new Set([...next.values()].map(r=>String(r.parent_id))).size>20)throw Error('Bir yuborishda 100 tagacha o‘quvchi va 20 tagacha ota-ona tanlang');rows.set(String(s.id),s)},eligible};
}
