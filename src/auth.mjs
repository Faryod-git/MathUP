import { randomBytes, pbkdf2Sync, timingSafeEqual, createHash } from 'node:crypto';
export const ITERATIONS=600000;
export function passwordRecord(password) {
  if(typeof password!=='string'||password.length<12||password.length>256) throw Error('Parol 12–256 belgi bo‘lsin');
  const salt=randomBytes(16).toString('hex');
  return {salt,iterations:ITERATIONS,hash:pbkdf2Sync(password,Buffer.from(salt,'hex'),ITERATIONS,32,'sha256').toString('hex')};
}
export function validRecord(r) {
  return r && /^[a-f0-9]{32}$/.test(r.salt) && /^[a-f0-9]{64}$/.test(r.hash) && Number.isInteger(r.iterations) && r.iterations>=ITERATIONS && r.iterations<=2000000;
}
const digest=s=>createHash('sha256').update(s).digest('hex');
export function createAuth(record,{clock=Date.now,secure=false}={}) {
  if(!validRecord(record))throw Error('Admin paroli sozlanmagan');
  const sessions=new Map();let failures=0,blockedUntil=0;
  const cookie=(value,age)=>`mathup_session=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${secure?'; Secure':''}`;
  function key(headers){const m=/(?:^|;\s*)mathup_session=([A-Za-z0-9_-]{43})(?:;|$)/.exec(headers.get('cookie')||'');return m?digest(m[1]):'';}
  return {
    login(password){
      if(clock()<blockedUntil)return {status:429};
      const p=typeof password==='string'&&password.length<=256?password:'';
      const hash=pbkdf2Sync(p,Buffer.from(record.salt,'hex'),record.iterations,32,'sha256');
      if(!timingSafeEqual(hash,Buffer.from(record.hash,'hex'))){
        if(++failures>=5){blockedUntil=clock()+900000;failures=0;}return {status:401};
      }
      failures=0;blockedUntil=0;
      for(const [k,exp] of sessions)if(exp<=clock())sessions.delete(k);
      if(sessions.size>=100)sessions.delete(sessions.keys().next().value);
      const token=randomBytes(32).toString('base64url');sessions.set(digest(token),clock()+28800000);
      return {status:200,cookie:cookie(token,28800)};
    },
    actor(headers){const k=key(headers),exp=sessions.get(k);if(!exp||exp<=clock()){sessions.delete(k);return null}return 'local-admin';},
    logout(headers){sessions.delete(key(headers));return cookie('',0);}
  };
}
