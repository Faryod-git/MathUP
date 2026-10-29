import {BOT_DESCRIPTION,BOT_SHORT_DESCRIPTION} from './bot-content.mjs';

// Profile-only API adapter: no chat messaging, token changes or webhook methods.
export function profileApi(token,net=fetch){
 const methods=new Set(['getMe','getMyDescription','getMyShortDescription','setMyDescription','setMyShortDescription']);
 return async(method,body={})=>{
  if(!methods.has(method))throw Error('Profil uchun bu usul ruxsat etilmagan');
  let response,data;
  try{response=await net('https://api.telegram.org/bot'+token+'/'+method,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(40000)});data=await response.json();}
  catch{throw Error('Telegram profiliga ulanish bajarilmadi. Natijani qayta tekshiring.');}
  if(!response.ok||data.ok!==true)throw Error('Telegram profil sozlamasini qabul qilmadi');
  return data.result;
 };
}

export async function configureBotProfile(config,api,{apply=false,beforeApply=async()=>{}}={}){
 const me=await api('getMe');
 if(!me?.is_bot||String(me.username).toLowerCase()!==String(config.botUsername).toLowerCase())throw Error('Bot nomi token bilan mos kelmadi. Profil o‘zgartirilmadi.');
 const previous=[];
 for(const language_code of ['', 'uz']){
  const [description,short]=await Promise.all([api('getMyDescription',{language_code}),api('getMyShortDescription',{language_code})]);
  previous.push({language_code,description:description.description||'',short_description:short.short_description||''});
 }
 if(!apply)return {username:me.username,previous,desired:{description:BOT_DESCRIPTION,short_description:BOT_SHORT_DESCRIPTION},applied:false};
 await beforeApply({username:me.username,previous});
 let changed=0;
 for(const p of previous){
  if(p.description!==BOT_DESCRIPTION){await api('setMyDescription',{language_code:p.language_code,description:BOT_DESCRIPTION});changed++;}
  if(p.short_description!==BOT_SHORT_DESCRIPTION){await api('setMyShortDescription',{language_code:p.language_code,short_description:BOT_SHORT_DESCRIPTION});changed++;}
 }
 for(const p of previous){
  const [description,short]=await Promise.all([api('getMyDescription',{language_code:p.language_code}),api('getMyShortDescription',{language_code:p.language_code})]);
  if(description.description!==BOT_DESCRIPTION||short.short_description!==BOT_SHORT_DESCRIPTION)throw Error('Profil matni tasdiqlanmadi. Qayta tekshiring.');
 }
 return {username:me.username,applied:true,verified:true,changed};
}
