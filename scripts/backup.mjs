import { DatabaseSync, backup } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const db=new DatabaseSync(resolve(root,'data/mathup.sqlite'),{readOnly:true});
try {
  mkdirSync(resolve(root,'backups'),{recursive:true,mode:0o700});
  const target=resolve(root,'backups','mathup-'+new Date().toISOString().replace(/[:.]/g,'-')+'.sqlite');
  await backup(db,target);console.log('Zaxira nusxa yaratildi:',target);
}finally{db.close();}
