-- Run only after PRAGMA table_info confirms these columns do not exist.
ALTER TABLE parents ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE parents ADD COLUMN archived INTEGER NOT NULL DEFAULT 0;
ALTER TABLE parents ADD COLUMN telegram_username TEXT;
ALTER TABLE students ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE students ADD COLUMN archived INTEGER NOT NULL DEFAULT 0;
ALTER TABLE students ADD COLUMN grade INTEGER CHECK(grade BETWEEN 1 AND 11);
-- Check duplicate nonempty telegram_chat_id counts before creating this index.
CREATE UNIQUE INDEX IF NOT EXISTS mathup_parent_telegram_unique ON parents(telegram_chat_id) WHERE telegram_chat_id IS NOT NULL AND telegram_chat_id!='';
CREATE INDEX IF NOT EXISTS mathup_students_parent ON students(parent_id);
CREATE TABLE IF NOT EXISTS mathup_link_tokens(hash TEXT PRIMARY KEY,parent_id INTEGER NOT NULL REFERENCES parents(id),expires INTEGER NOT NULL,used INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS mathup_registrations(id TEXT PRIMARY KEY,telegram_id TEXT NOT NULL,parent_id INTEGER NOT NULL REFERENCES parents(id),created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS mathup_deliveries(batch_id TEXT NOT NULL,parent_id INTEGER NOT NULL REFERENCES parents(id),telegram_id TEXT NOT NULL,parent_version INTEGER NOT NULL,actor TEXT NOT NULL,body_hash TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'prepared',expires INTEGER NOT NULL,PRIMARY KEY(batch_id,parent_id));
CREATE INDEX IF NOT EXISTS mathup_delivery_expiry ON mathup_deliveries(expires);