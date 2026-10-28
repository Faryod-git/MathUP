function audienceScript(){
 const $=id=>document.getElementById(id),chosen=new Set();let offset=0,q='',rows=[],preview=null;
 const error=e=>{$('botNotice').textContent=e.message||String(e);};
 async function api(path,method='GET',body){const r=await fetch(path,{method,headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});const d=await r.json();if(!r.ok)throw Error(d.error||'So‘rov bajarilmadi');return d;}
 const act=fn=>async()=>{try{await fn();}catch(e){error(e);}};
 const el=(tag,value)=>{const n=document.createElement(tag);n.textContent=value;return n;};
 function count(){$('botSelected').textContent=$('botAll').checked?'Barcha faol foydalanuvchilar (tekshirish paytidagi ro‘yxat)':chosen.size+' ta foydalanuvchi tanlangan';}
 async function load(){
  const d=await api('/api/bot-users?offset='+offset+'&q='+encodeURIComponent(q));rows=d.items.slice(0,50);
  $('botTotal').textContent=d.total+' ta foydalanuvchi, '+d.active+' tasi faol';$('botUsers').replaceChildren();
  for(const row of rows){
   const tr=el('tr',''),td=el('td',''),c=document.createElement('input');c.type='checkbox';c.setAttribute('aria-label',row.chat_id+' foydalanuvchini tanlash');c.checked=chosen.has(row.chat_id);c.disabled=!row.active||$('botAll').checked;
   c.onchange=()=>{if(c.checked){if(chosen.size>=1000){c.checked=false;error(Error('1000 tagacha foydalanuvchi tanlang'));return;}chosen.add(row.chat_id);}else chosen.delete(row.chat_id);count();};
   td.append(c);tr.append(td,el('td',row.full_name||'Bot foydalanuvchisi'),el('td',row.chat_id),el('td',row.parent_id?'Ota-ona':'Ro‘yxatdan o‘tmagan'),el('td',row.active?'Faol':'Bot bloklangan'));$('botUsers').append(tr);
  }
  if(!rows.length){const tr=el('tr',''),td=el('td','Hozircha foydalanuvchi yo‘q. Botga /start yuborilganda shu yerga qo‘shiladi.');td.colSpan=5;tr.append(td);$('botUsers').append(tr);}
  $('botPrev').disabled=!offset;$('botNext').disabled=d.items.length<=50;$('botPage').textContent=(offset/50+1)+'-sahifa';count();
 }
 const states={queued:'Navbatda',sending:'Yuborilmoqda',sent:'Telegram qabul qildi',failed:'Yuborilmadi',unknown:'Natija noma’lum — tekshiring',changed:'Ma’lumot o‘zgargan'};
 async function jobs(){
  const data=await api('/api/broadcasts');$('botJobs').replaceChildren();
  for(const job of data.items){const li=el('li',new Date(job.created*1000).toLocaleString('uz-UZ')+' — '+(job.state==='done'?'Yakunlangan':'Navbatda')+': '+Object.entries(job.counts).map(([k,v])=>(states[k]||k)+' '+v).join('; '));$('botJobs').append(li);}
  if(!data.items.length)$('botJobs').append(el('li','Hali umumiy xabar yuborilmagan.'));
 }
 $('botSearchForm').onsubmit=e=>{e.preventDefault();q=$('botSearch').value.trim();offset=0;act(load)();};
 $('botAll').onchange=()=>act(load)();$('botPrev').onclick=act(async()=>{offset=Math.max(0,offset-50);await load();});$('botNext').onclick=act(async()=>{offset+=50;await load();});
 $('botRefresh').onclick=act(async()=>{await load();await jobs();});
 $('botClear').onclick=act(async()=>{chosen.clear();$('botAll').checked=false;await load();});
 $('botSelectPage').onclick=act(async()=>{for(const r of rows)if(r.active&&chosen.size<1000)chosen.add(r.chat_id);$('botAll').checked=false;await load();});
 $('botPreview').onclick=act(async()=>{
  preview=await api('/api/broadcasts/prepare','POST',{text:$('botMessage').value,...($('botAll').checked?{all:true}:{chat_ids:[...chosen]})});
  $('botPreviewText').textContent=preview.text;$('botPreviewCount').textContent=preview.recipients.length+' ta foydalanuvchiga yuboriladi';$('botPreviewRecipients').replaceChildren();
  for(const r of preview.recipients)$('botPreviewRecipients').append(el('li',r.full_name+' · '+r.chat_id));
  $('botSendError').textContent='';$('botSend').disabled=false;$('botSendDialog').showModal();
 });
 $('botSend').onclick=act(async()=>{
  if(!preview)return;$('botSend').disabled=true;
  try{await api('/api/broadcasts/send','POST',{id:preview.id,text:preview.text,confirm:true});$('botSendDialog').close();preview=null;$('botNotice').textContent='Xabar navbatga qo‘yildi. Start.ps1 -Bot ishlayotganida yuboriladi. Natijalar quyida yangilanadi.';await jobs();}
  catch(e){$('botSendError').textContent=e.message;$('botSend').disabled=false;throw e;}
 });
 $('botSendCancel').onclick=()=>$('botSendDialog').close();
 act(async()=>{await load();await jobs();})();
 setInterval(()=>{if(!document.hidden)act(jobs)();},5000);
}

export function applyBroadcastUi(html){
 const section=`<section id="botUsersSection"><h2>Bot foydalanuvchilariga xabar / reklama</h2>
 <p class="muted">Botga yozgan foydalanuvchilar, jumladan ro‘yxatdan o‘tmaganlar. Eski ro‘yxatdan o‘tmagan foydalanuvchi qayta /start yuborsa ko‘rinadi. Matn va havola yuborish mumkin; bir navbatda 1000 tagacha.</p>
 <p id="botTotal"></p><form id="botSearchForm"><label>Ism yoki Telegram ID<input id="botSearch" type="search" maxlength="120"></label><button>Qidirish</button></form>
 <button id="botRefresh">Yangilash</button><button id="botSelectPage">Sahifadagilarni tanlash</button><button id="botClear">Tanlovni tozalash</button>
 <label><input id="botAll" type="checkbox"> Barcha faol foydalanuvchilarga yuborish</label>
 <div class="scroll"><table><thead><tr><th>Tanlash</th><th>Foydalanuvchi</th><th>Telegram ID</th><th>Ro‘yxat</th><th>Holat</th></tr></thead><tbody id="botUsers"></tbody></table></div>
 <button id="botPrev">Oldingi</button><span id="botPage"></span><button id="botNext">Keyingi</button><p id="botSelected" class="selection-summary"></p>
 <label>Xabar yoki reklama matni<textarea id="botMessage" rows="5" maxlength="3500"></textarea></label><button id="botPreview">Xabar oluvchilarni tekshirish</button>
 <p id="botNotice" role="status" class="notice"></p><h3>Oxirgi yuborishlar</h3><ul id="botJobs"></ul>
 <p class="muted">Kompyuter va Start.ps1 -Bot ishlab turishi kerak. Bloklaganlarga yuborilmaydi. “Telegram qabul qildi” o‘qilganini anglatmaydi. Natijasi noma’lum xabar avtomatik takrorlanmaydi. Navbatdagi matn yuborish yakunlangach bazadan tozalanadi.</p></section>
 <dialog id="botSendDialog" aria-labelledby="botSendTitle"><h2 id="botSendTitle">Umumiy xabarni tasdiqlash</h2><p id="botPreviewCount"></p><details><summary>Qabul qiluvchilar</summary><ul id="botPreviewRecipients"></ul></details><p id="botPreviewText" style="white-space:pre-wrap;overflow-wrap:anywhere"></p><p>Tasdiqlasangiz, haqiqiy Telegram xabari navbatga qo‘yiladi.</p><p id="botSendError" role="alert"></p><button id="botSend">Tasdiqlash va yuborish</button><button id="botSendCancel" autofocus>Bekor qilish</button></dialog>`;
 return html.replace('</nav>','<a class="nav-item" href="#botUsersSection">📣 Bot foydalanuvchilari</a></nav>').replace('</main>',section+'</main>').replace('</html>','<script>('+audienceScript.toString()+')();</script></html>');
}
