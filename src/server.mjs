import http from 'node:http';
import { createWorker } from './core.mjs';
import { adminPage } from './ui.mjs';
import { createAuth } from './auth.mjs';

const LOGIN=`<!doctype html><html lang="uz"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MathUP — kirish</title><style>body{font:18px system-ui;background:#f1f5f9;color:#14213d;max-width:420px;margin:10vh auto;padding:24px}input,button{font:inherit;padding:12px;width:100%;box-sizing:border-box;margin:12px 0}form{background:white;padding:24px;border-radius:12px}</style><h1>MathUP Admin</h1><form><label>Admin paroli<input name="password" type="password" autocomplete="current-password" required maxlength="256"></label><button>Kirish</button><p role="status" id="status"></p></form><script>document.querySelector('form').onsubmit=async e=>{e.preventDefault();const s=document.getElementById('status');try{const r=await fetch('/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:e.target.elements.password.value})});if(r.ok)location.replace('/');else s.textContent=r.status===429?'15 daqiqa kuting.':'Parol noto‘g‘ri.'}catch{s.textContent='Server bilan aloqa yo‘q.'}};</script></html>`;
const BASE_HEADERS={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",'Permissions-Policy':'camera=(), microphone=(), geolocation=()'};
const json=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{...BASE_HEADERS,'Content-Type':'application/json; charset=utf-8',...headers}});
const page=body=>new Response(body,{headers:{...BASE_HEADERS,'Content-Type':'text/html; charset=utf-8'}});
function localAdmin(demo) {
  return adminPage
    .replace('<button id="registrationMenu">Botga ro‘yxatdan o‘tish tugmasini qo‘shish</button>','')
    .replace("$('registrationMenu').onclick=()=>act(async()=>{const r=await api('/api/telegram/registration-menu','POST',{confirm:true});notice(r.message)});",'')
    .replace("if(x.telegram_id)td.append(btn('Admin panel tugmasi',async()=>{const r=await api('/api/parents/'+x.id+'/admin-menu','POST',{confirm:true});notice(r.message)}));",'')
    .replace('>Faqat test</option>','>Faol emas</option>')
    .replace('</header>',`<p>${demo?'NAMUNA REJIMI — haqiqiy Telegram xabarlari yuborilmaydi.':'Kompyuterdagi server — ota-onalar /register orqali qo‘shiladi.'}</p><a href="/bot-status" style="color:white">Bot holati</a> <button id="logout">Chiqish</button></header>`)
    .replace('<script>(function adminScript(){',"<script>document.getElementById('logout').onclick=async()=>{await fetch('/auth/logout',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});location.replace('/login')};(function adminScript(){");
}

export function createLocalServer({DB,config,demo=false,botStatus=()=>({mode:'off'}),net=fetch}) {
  const auth=createAuth(config.adminPassword);
  const env={DB,LOCAL_MODE:true,TELEGRAM_BOT_TOKEN:demo?'':config.botToken||'',TELEGRAM_BOT_USERNAME:config.botUsername||'MathUP_LocalBot',PUBLIC_REGISTRATION_ENABLED:'false'};
  const worker=createWorker(demo?async()=>{throw Error('Demo network disabled')}:net,async request=>{
    const actor=auth.actor(request.headers);if(!actor)throw Object.assign(Error('Admin sifatida kiring'),{status:401});return actor;
  });
  const server=http.createServer(async(req,res)=>{
    try {
      // Host validation prevents DNS rebinding; localhost is deliberately not an alias.
      const expected=`127.0.0.1:${server.address().port}`;
      if(req.headers.host!==expected){await respond(json({error:'Manzil noto‘g‘ri'},421));return;}
      if(!req.url.startsWith('/')||req.url.startsWith('//')){await respond(json({error:'Manzil noto‘g‘ri'},400));return;}
      const base='http://'+expected,url=new URL(req.url,base),method=req.method;
      if(url.origin!==base){await respond(json({error:'Manzil noto‘g‘ri'},400));return;}
      const headers=new Headers();for(const [k,v] of Object.entries(req.headers))if(v!==undefined)headers.set(k,Array.isArray(v)?v.join(','):v);
      headers.delete('Cf-Access-Jwt-Assertion');
      let body;
      if(!['GET','HEAD'].includes(method)) {
        if(!['POST','PATCH'].includes(method)){await respond(json({error:'Usul ruxsat etilmagan'},405));return;}
        if(headers.get('origin')!==base||headers.get('sec-fetch-site')==='cross-site'){await respond(json({error:'So‘rov manbasi noto‘g‘ri'},403));return;}
        if(!(headers.get('content-type')||'').startsWith('application/json')){await respond(json({error:'JSON kerak'},415));return;}
        const chunks=[];let size=0;
        for await(const c of req){size+=c.length;if(size>32768){await respond(json({error:'So‘rov juda katta'},413));return;}chunks.push(c);}
        body=Buffer.concat(chunks);
      }
      const request=new Request(url,{method,headers,body});let response;
      if(url.pathname==='/auth/login'&&method==='POST'){
        let data;try{data=JSON.parse(body.toString())}catch{await respond(json({error:'JSON noto‘g‘ri'},400));return;}
        const result=auth.login(data?.password);response=json({ok:result.status===200},result.status,result.cookie?{'Set-Cookie':result.cookie}:{});
      }else if(url.pathname==='/auth/logout'&&method==='POST')response=json({ok:true},200,{'Set-Cookie':auth.logout(headers)});
      else if(url.pathname==='/login'&&method==='GET')response=page(LOGIN);
      else if(url.pathname==='/health'&&method==='GET')response=json({service:'mathup-local',status:'up',demo});
      else if(!auth.actor(headers))response=url.pathname==='/'?new Response(null,{status:302,headers:{...BASE_HEADERS,Location:'/login'}}):json({error:'Admin sifatida kiring'},401);
      else if(url.pathname==='/bot-status'&&method==='GET')response=json({...botStatus(),token_configured:!!config.botToken,tests_enabled:false,registration_enabled:!!config.publicRegistrationEnabled,audience:config.audience});
      else if(url.pathname==='/'&&method==='GET')response=page(localAdmin(demo));
      else response=await worker.fetch(request,env);
      await respond(response);
    }catch{if(!res.headersSent)await respond(json({error:'So‘rov bajarilmadi'},500));else res.end();}
    async function respond(response){res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));}
  });
  server.requestTimeout=15000;server.headersTimeout=10000;server.maxConnections=100;
  return {server,auth};
}
