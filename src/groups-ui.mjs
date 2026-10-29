function groupsScript(){
 const $=id=>document.getElementById(id);let groups=[],editing=null,deleting=null,current=null,rows=[],offset=0,query='',hasNext=false,busy=false;const changes=new Map();
 const say=s=>{$('groupsNotice').textContent=s;};
 const node=(tag,text)=>{const el=document.createElement(tag);el.textContent=text;return el;};
 async function api(path,method='GET',body){const r=await fetch(path,{method,headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});const d=await r.json();if(!r.ok)throw Error(d.error||'So‘rov bajarilmadi');return d;}
 const act=fn=>async()=>{try{await fn();}catch(e){if($('groupMembersDialog').open)$('memberError').textContent=e.message;else say(e.message);}};
 const button=(text,fn,danger=false)=>{const b=node('button',text);b.dataset.mathupIcon=danger?'trash':text.startsWith('Nomini')?'edit':text.startsWith('Xabar')?'send':text.startsWith('Ro‘yxat')?'book':'users';if(danger)b.className='danger';b.onclick=act(fn);return b;};
 async function list(){
  groups=(await api('/api/groups')).items;
  const select=$('studentGroupFilter'),old=select.value;select.replaceChildren();
  for(const [value,label] of [['','Barcha guruhlar'],['none','Guruhga qo‘shilmaganlar'],...groups.map(g=>[g.id,g.name+' ('+g.student_count+')'])]){const o=node('option',label);o.value=value;select.append(o);}select.value=[...select.options].some(o=>o.value===old)?old:'';
  $('groupsCount').textContent=groups.length+' ta guruh';$('groupsList').replaceChildren();
  for(const group of groups){const card=node('article','');card.className='group-card';card.append(node('h3',group.name),node('p',group.student_count+' ta o‘quvchi'));const actions=node('div','');actions.append(button('O‘quvchilarni boshqarish',()=>openMembers(group)),button('Ro‘yxatni ko‘rish',async()=>{await window.mathupRoster.filter(group.id);$('studentsSection').scrollIntoView({block:'start'});}),button('Xabar uchun tanlash',async()=>{const d=await api('/api/groups/'+group.id+'/recipients');await window.mathupRoster.choose(d.items,group.id);say(group.name+': '+d.items.length+' ta o‘quvchi tanlandi'+(d.skipped?'; '+d.skipped+' ta o‘quvchining ota-onasi Telegramga bog‘lanmaganligi sababli tanlanmadi.':'.'));}),button('Nomini o‘zgartirish',()=>edit(group)),button('Guruhni o‘chirish',()=>{deleting={...group};$('deleteGroupName').textContent=group.name;$('deleteGroupError').textContent='';$('deleteGroupDialog').showModal();},true));card.append(actions);$('groupsList').append(card);}
  if(!groups.length)$('groupsList').append(node('p','Hali guruh yo‘q. Yangi guruh yaratib, o‘quvchilarni qo‘shing.'));
 }
 function edit(g){editing=g?{...g}:null;$('groupName').value=g?.name||'';$('groupFormError').textContent='';$('groupDialogTitle').textContent=g?'Guruh nomini o‘zgartirish':'Yangi guruh';$('groupDialog').showModal();}
 function controls(){
  for(const input of $('memberRows').querySelectorAll('input'))input.disabled=busy;
  $('memberSearch').disabled=busy;$('membersOnly').disabled=busy;
  $('memberSave').disabled=busy||changes.size===0;$('memberPrev').disabled=busy||changes.size>0||offset===0;$('memberNext').disabled=busy||changes.size>0||!hasNext;
  $('memberPending').textContent=changes.size?changes.size+' ta o‘zgarish. Sahifani almashtirishdan oldin Saqlash tugmasini bosing.':'Kataklarni belgilab yoki olib tashlab, Saqlash tugmasini bosing.';
 }
 async function members(){
  const d=await api('/api/groups/'+current.id+'/students?offset='+offset+'&q='+encodeURIComponent(query)+($('membersOnly').checked?'&members=true':''));current=d.group;rows=d.items.slice(0,50);hasNext=d.items.length>50;
  $('memberTitle').textContent=current.name+' — o‘quvchilar';$('memberCount').textContent=d.member_count+' ta o‘quvchi guruhda';$('memberRows').replaceChildren();
  for(const s of rows){const tr=node('tr',''),td=node('td',''),c=document.createElement('input');c.type='checkbox';c.checked=!!s.member;c.setAttribute('aria-label',s.full_name+' guruhga qo‘shish');c.onchange=()=>{if(c.checked===!!s.member)changes.delete(s.id);else changes.set(s.id,{student_id:s.id,student_version:s.version,member:c.checked});controls();};td.append(c);tr.append(td,node('td',s.full_name),node('td',s.grade?s.grade+'-sinf':'—'),node('td',s.parent_name));$('memberRows').append(tr);}
  if(!rows.length){const tr=node('tr',''),td=node('td','O‘quvchi topilmadi.');td.colSpan=4;tr.append(td);$('memberRows').append(tr);}
  $('memberPage').textContent=(offset/50+1)+'-sahifa';controls();
 }
 async function openMembers(g){current={...g};offset=0;query='';changes.clear();$('memberSearch').value='';$('membersOnly').checked=false;$('memberError').textContent='';await members();$('groupMembersDialog').showModal();}
 $('newGroup').onclick=()=>edit(null);$('groupsRefresh').onclick=act(async()=>{await list();await window.mathupRoster.reload();});
 $('studentGroupFilter').onchange=act(async()=>{await window.mathupRoster.filter($('studentGroupFilter').value);});
 $('groupForm').onsubmit=async e=>{
  e.preventDefault();$('groupSave').disabled=true;
  try{await api('/api/groups'+(editing?'/'+editing.id:''),editing?'PATCH':'POST',{name:$('groupName').value,version:editing?.version});$('groupDialog').close();await list();await window.mathupRoster.reload();say('Guruh saqlandi');}
  catch(e){$('groupFormError').textContent=e.message;}finally{$('groupSave').disabled=false;}
 };
 $('confirmDeleteGroup').onclick=async()=>{
  if(!deleting)return;$('confirmDeleteGroup').disabled=true;
  try{await api('/api/groups/'+deleting.id,'DELETE',{version:deleting.version,confirm:true});$('deleteGroupDialog').close();deleting=null;await list();await window.mathupRoster.reload();say('Guruh o‘chirildi. O‘quvchilar va ota-onalar saqlandi.');}
  catch(e){$('deleteGroupError').textContent=e.message;}finally{$('confirmDeleteGroup').disabled=false;}
 };
 $('memberSearchForm').onsubmit=e=>{e.preventDefault();if(changes.size){$('memberError').textContent='Avval o‘zgarishlarni saqlang yoki oynani yopib bekor qiling.';return;}query=$('memberSearch').value.trim();offset=0;act(members)();};
 $('membersOnly').onchange=()=>{if(changes.size){$('membersOnly').checked=!$('membersOnly').checked;$('memberError').textContent='Avval o‘zgarishlarni saqlang.';return;}offset=0;act(members)();};
 for(const [id,delta]of [['memberPrev',-50],['memberNext',50]])$(id).onclick=act(async()=>{if(changes.size)return;offset=Math.max(0,offset+delta);await members();});
 $('memberSave').onclick=async()=>{
  if(!current||!changes.size||busy)return;busy=true;controls();$('memberError').textContent='';
  try{const r=await api('/api/groups/'+current.id+'/members','PATCH',{version:current.version,changes:[...changes.values()]});changes.clear();await members();await list();await window.mathupRoster.reload();say(r.changed+' ta o‘quvchining guruhga a’zoligi yangilandi.');}
  catch(e){$('memberError').textContent=e.message;}finally{busy=false;controls();}
 };
 for(const b of document.querySelectorAll('[data-group-close]'))b.onclick=()=>{if(busy&&b.dataset.groupClose==='groupMembersDialog')return;$(b.dataset.groupClose).close();};
 $('groupMembersDialog').addEventListener('cancel',e=>{if(busy)e.preventDefault();});
 window.addEventListener('mathup-roster-loaded',()=>act(list)());
 act(list)();
}

export function applyGroupsUi(html){
 const replace=(a,b)=>{if(!html.includes(a))throw Error('Groups UI template mismatch: '+a.slice(0,70));html=html.replace(a,b);};
 replace('</nav>','<a class="nav-item" href="#groupsSection">👥 Guruhlar</a></nav>');
 replace('<button id="newS">','<label>O‘quvchilar guruhi<select id="studentGroupFilter"><option value="">Barcha guruhlar</option></select></label><button id="newS">');
 replace('<th>Holat</th><th>Amal</th></tr></thead><tbody id="students">','<th>Holat</th><th>Guruhlar</th><th>Amal</th></tr></thead><tbody id="students">');
 replace("api('/api/students?offset='+so+","api('/api/students?group_id='+encodeURIComponent($('studentGroupFilter').value)+'&offset='+so+");
 replace('cell(tr,names[x.status]);','cell(tr,names[x.status]);cell(tr,JSON.parse(x.groups_json||\'[]\').map(g=>g.name).join(\', \')||\'—\');');
 replace('count()\n}',"count();window.dispatchEvent(new Event('mathup-roster-loaded'))\n}");
 replace('act(load)\n})();',"window.mathupRoster={reload:()=>load(),filter:async gid=>{selected.clear();prepared=null;so=0;$('studentGroupFilter').value=gid;await load()},choose:async(rows,gid)=>{selected.clear();prepared=null;for(const s of rows)selected.add(s);so=0;$('studentGroupFilter').value=gid;await load();$('messagesSection').scrollIntoView({block:'start'});notice('Guruhdagi '+selected.size+' ta o‘quvchi / '+selected.parentCount()+' ta ota-ona tanlandi. Matnni yozib, qabul qiluvchilarni tekshiring.')}};act(load)\n})();");
 const section=`<section id="groupsSection"><h2>O‘quv guruhlari</h2><p class="muted">O‘zingiz guruh yarating va mavjud o‘quvchilarni qo‘shing. Bir o‘quvchi bir nechta guruhda bo‘lishi mumkin. Guruhdan chiqarish o‘quvchini bazadan o‘chirmaydi.</p><button id="newGroup">Yangi guruh</button><button id="groupsRefresh">Yangilash</button><p id="groupsCount"></p><p id="groupsNotice" role="status" class="notice"></p><div id="groupsList" class="groups-grid"></div></section>
 <dialog id="groupDialog"><form id="groupForm"><h2 id="groupDialogTitle">Yangi guruh</h2><label>Guruh nomi<input id="groupName" required maxlength="80" placeholder="Masalan: 5-sinf — Dushanba/Chorshanba"></label><p id="groupFormError" role="alert"></p><button id="groupSave">Saqlash</button><button type="button" data-group-close="groupDialog">Bekor qilish</button></form></dialog>
 <dialog id="groupMembersDialog" class="group-members-dialog"><h2 id="memberTitle">Guruh o‘quvchilari</h2><p id="memberCount"></p><form id="memberSearchForm"><label>O‘quvchi yoki ota-ona ismi<input id="memberSearch" type="search" maxlength="120"></label><button>Qidirish</button></form><label><input id="membersOnly" type="checkbox"> Faqat guruhdagilar</label><div class="scroll"><table><thead><tr><th>Guruhda</th><th>O‘quvchi</th><th>Sinf</th><th>Ota-ona</th></tr></thead><tbody id="memberRows"></tbody></table></div><button id="memberPrev">Oldingi</button><span id="memberPage"></span><button id="memberNext">Keyingi</button><p id="memberPending"></p><p id="memberError" role="alert"></p><button id="memberSave">O‘zgarishlarni saqlash</button><button data-group-close="groupMembersDialog">Yopish / saqlamasdan chiqish</button></dialog>
 <dialog id="deleteGroupDialog"><h2>Guruhni o‘chirish</h2><p id="deleteGroupName"></p><p>Faqat guruh va unga a’zolik o‘chadi. O‘quvchilar, ota-onalar va boshqa guruhlar saqlanadi.</p><p id="deleteGroupError" role="alert"></p><button id="confirmDeleteGroup" class="danger-solid">Guruhni o‘chirish</button><button data-group-close="deleteGroupDialog" autofocus>Bekor qilish</button></dialog>`;
 replace('<section id="studentsSection">',section+'<section id="studentsSection">');
 replace('</style>',`.groups-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,310px),1fr));gap:14px}.group-card{border:1px solid #e0e3f1;border-radius:14px;padding:18px;min-width:0}.group-card h3{margin:0 0 8px;overflow-wrap:anywhere}.group-card p{color:#68758b}.group-card button{font-size:12px;padding:8px;margin:3px}.group-members-dialog{width:min(850px,96vw)}#memberError,#groupFormError,#deleteGroupError{color:#b42338}#memberPending{font-size:13px;color:#526477}#studentGroupFilter{max-width:420px}</style>`);
 return html.replace('</html>','<script>('+groupsScript.toString()+')();</script></html>');
}
