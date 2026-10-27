import { mkdirSync, writeFileSync, readFileSync, unlinkSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './src/config.mjs';
import { passwordRecord } from './src/auth.mjs';
import { openDatabase } from './src/database.mjs';
import { createLocalServer } from './src/server.mjs';
import { runPolling } from './src/poller.mjs';

const root=dirname(fileURLToPath(import.meta.url)),demo=process.argv.includes('--demo');
const stop=new AbortController();let DB,server,lock,botTask,stopping=false;
function acquireLock(path){
  try{writeFileSync(path,String(process.pid),{flag:'wx',mode:0o600});}
  catch(e){
    if(e.code!=='EEXIST')throw e;
    const pid=Number(readFileSync(path,'utf8'));if(!Number.isSafeInteger(pid)||pid<=0)throw Error('Server lock faylini tekshiring.');
    try{process.kill(pid,0);throw Error('Server allaqachon ishlayapti.');}catch(check){if(check.code!=='ESRCH')throw check;}
    unlinkSync(path);writeFileSync(path,String(process.pid),{flag:'wx',mode:0o600});
  }
  lock=path;
}
async function shutdown(){
  if(stopping)return;stopping=true;stop.abort();
  if(server?.listening)await new Promise(r=>server.close(r));
  await botTask;
  DB?.close();if(lock)unlinkSync(lock);
}
try {
  if(demo&&process.argv.includes('--bot'))throw Error('Namuna rejimida bot ishga tushmaydi.');
  const config=demo?{host:'127.0.0.1',port:8788,adminPassword:passwordRecord('MathUP-demo-only-2026'),botUsername:'MathUP_LocalBot',adminTelegramIds:[],audience:'admins',publicRegistrationEnabled:false}:loadConfig(root);
  mkdirSync(resolve(root,'data'),{recursive:true,mode:0o700});
  acquireLock(resolve(root,'data',demo?'demo.lock':'server.lock'));
  DB=openDatabase(resolve(root,'data',demo?'demo.sqlite':'mathup.sqlite'));
  if(demo&&!DB.sqlite.prepare('SELECT id FROM parents LIMIT 1').get()) {
    DB.sqlite.exec("INSERT INTO parents(identity_key,display_name) VALUES('synthetic-demo','NAMUNA OTA-ONA'); INSERT INTO students(parent_id,full_name,grade,status) VALUES(1,'NAMUNA O‘QUVCHI',6,'pending_current');");
  }
  let status={mode:'off'};
  ({server}=createLocalServer({DB,config,demo,botStatus:()=>status}));
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(config.port,'127.0.0.1',resolve);});
  console.log(`MathUP Admin: http://127.0.0.1:${config.port}/`);
  if(demo)console.log('NAMUNA REJIMI. Parol: MathUP-demo-only-2026. Telegram o‘chirilgan.');
  if(process.argv.includes('--bot')) {
    botTask=runPolling(DB,config,{signal:stop.signal,onStatus:s=>{status=s;}}).catch(e=>{
      status={mode:'blocked',reason:e.message};console.error(e.message);
    });
  }else console.log('Admin ishlayapti. Telegram qabul qilish yoqilmagan.');
  for(const event of ['SIGINT','SIGTERM'])process.once(event,()=>{shutdown().catch(()=>{process.exitCode=1;});});
}catch(e){console.error(e.message);await shutdown();process.exitCode=1;}
