import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

export function openDatabase(path=':memory:') {
  const sqlite = new DatabaseSync(path);
  sqlite.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
  if (!sqlite.prepare("SELECT name FROM sqlite_master WHERE name='parents'").get()) {
    sqlite.exec(readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));
  }
  // Never run cloud ALTER statements against an existing database.
  for (const [table, required] of [['parents',['version','archived','telegram_username']],['students',['version','archived','grade']]]) {
    const columns=sqlite.prepare(`PRAGMA table_info(${table})`).all().map(r=>r.name);
    if(required.some(c=>!columns.includes(c))) { sqlite.close(); throw Error('Baza sxemasi mos emas; avtomatik migratsiya bajarilmadi.'); }
  }
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS bot_state(key TEXT PRIMARY KEY,value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS bot_sessions(chat_id TEXT PRIMARY KEY,stage TEXT NOT NULL,data_json TEXT NOT NULL,expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS bot_updates(update_id INTEGER PRIMARY KEY,created INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS bot_outbox(id INTEGER PRIMARY KEY AUTOINCREMENT,update_id INTEGER NOT NULL,seq INTEGER NOT NULL,body_json TEXT,state TEXT NOT NULL DEFAULT 'prepared',UNIQUE(update_id,seq));
  `);
  const DB={
    sqlite,
    prepare(sql) {
      const statement=sqlite.prepare(sql); let values=[];
      return {
        bind(...v){values=v;return this},
        first(){return statement.get(...values)??null},
        all(){return {results:statement.all(...values)}},
        run(){const r=statement.run(...values);return {meta:{changes:Number(r.changes),last_row_id:Number(r.lastInsertRowid)}}}
      };
    },
    batch(statements){
      sqlite.exec('BEGIN IMMEDIATE');
      try {const results=statements.map(s=>s.run());sqlite.exec('COMMIT');return results;}
      catch(e){sqlite.exec('ROLLBACK');throw e;}
    },
    close(){sqlite.close()}
  };
  return DB;
}
