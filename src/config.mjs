import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { validRecord } from './auth.mjs';

export function validateConfig(config,secrets={}) {
  const c={host:'127.0.0.1',port:8787,botUsername:'MathUP_Gallaorol_Testbot',adminTelegramIds:[],audience:'admins',publicRegistrationEnabled:false,...config,...secrets};
  if(c.host!=='127.0.0.1'||!Number.isInteger(c.port)||c.port<1024||c.port>65535)throw Error('Faqat 127.0.0.1 va 1024–65535 portlar ruxsat etilgan');
  if(!validRecord(c.adminPassword))throw Error('Avval Setup.ps1 orqali admin parolini sozlang');
  if(!['admins','all'].includes(c.audience)||!Array.isArray(c.adminTelegramIds)||c.adminTelegramIds.some(id=>!/^\d{1,16}$/.test(String(id))||Number(id)<=0))throw Error('Telegram foydalanuvchi sozlamalari noto‘g‘ri');
  c.adminTelegramIds=c.adminTelegramIds.map(String);
  if(typeof c.publicRegistrationEnabled!=='boolean'||!/^[A-Za-z0-9_]{5,32}$/.test(c.botUsername))throw Error('Bot sozlamalari noto‘g‘ri');
  if(c.botToken&&!/^\d{5,16}:[A-Za-z0-9_-]{30,100}$/.test(c.botToken))throw Error('Bot tokeni formati noto‘g‘ri');
  return c;
}

export function loadConfig(root) {
  let config;try{config=JSON.parse(readFileSync(resolve(root,'config.json'),'utf8').replace(/^\uFEFF/,''));}catch{throw Error('config.json topilmadi. Windows’da Setup.ps1 ni ishga tushiring.');}
  if(process.platform!=='win32')throw Error('Maxfiy sozlamalar Windows DPAPI bilan saqlanadi. Shu foydalanuvchining Windows kompyuterida ishga tushiring.');
  const command="Add-Type -AssemblyName System.Security; $b=[IO.File]::ReadAllBytes($env:MATHUP_SECRET_FILE); $p=[Security.Cryptography.ProtectedData]::Unprotect($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::OutputEncoding=[Text.Encoding]::UTF8; [Console]::Write([Text.Encoding]::UTF8.GetString($p))";
  const r=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',command],{env:{...process.env,MATHUP_SECRET_FILE:resolve(root,'secrets.dpapi')},encoding:'utf8',windowsHide:true,maxBuffer:65536});
  let secrets;try{if(r.status!==0)throw Error();secrets=JSON.parse(r.stdout.replace(/^\uFEFF/,''));}catch{throw Error('Maxfiy sozlamalarni ochib bo‘lmadi. Setup.ps1 ni shu Windows foydalanuvchisida bajaring.');}
  return validateConfig(config,secrets);
}
