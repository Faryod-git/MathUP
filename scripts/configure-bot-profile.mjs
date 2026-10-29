import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {mkdirSync,writeFileSync} from 'node:fs';
import {loadConfig} from '../src/config.mjs';
import {profileApi,configureBotProfile} from '../src/bot-profile.mjs';
const args=process.argv.slice(2),position=args.indexOf('--project');
try{
 if(position>=0&&!args[position+1])throw Error('--project papkasi kerak');
 const root=position>=0?resolve(args[position+1]):resolve(dirname(fileURLToPath(import.meta.url)),'..');
 const config=loadConfig(root);if(!config.botToken)throw Error('Bot tokeni sozlanmagan');
 const backupIndex=args.indexOf('--backup-dir'),backupDir=backupIndex>=0?resolve(args[backupIndex+1]):resolve(root,'backups');
 const result=await configureBotProfile(config,profileApi(config.botToken),{apply:args.includes('--apply'),beforeApply:async previous=>{
  mkdirSync(backupDir,{recursive:true});writeFileSync(resolve(backupDir,'bot-profile-'+Date.now()+'.json'),JSON.stringify(previous,null,2),{mode:0o600});
 }});
 console.log(JSON.stringify(result));
}catch(e){console.error(e.message);process.exitCode=1;}
