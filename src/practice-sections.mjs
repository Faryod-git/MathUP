import {PRACTICE_CATALOG} from './practice-catalog.mjs';
export const PRACTICE_BOOKS=Object.freeze([1,2,3].map(part=>Object.freeze({id:String(part),name:'Y_I_E '+part+'-qism'})));
export const PRACTICE_TESTS_TEXT=`📝 Testlar

Farzandingizning mavzuni qanchalik o‘zlashtirganini tekshiring.

📚 Har bir mavzu bo‘yicha 10 ta test bo‘ladi.
🖼 Har bir 10 talik test to‘plami bitta rasm sifatida joylanadi.
👨‍👩‍👧‍👦 Ota-onalar ushbu testlarni farzandlari bilan ishlashlari mumkin.

Kitobni, so‘ng kerakli mavzuni tanlang. Mavjud testlar mavzu raqami bo‘yicha tartiblangan.

Avval farzandingiz testni mustaqil yechsin. Keyin “Test javoblari” bo‘limida javoblarni solishtirasiz.

Kerakli kitobni tanlang:`;
export const PRACTICE_ANSWERS_TEXT=`✅ Test javoblari

Bu bo‘limda har bir mavzuga oid 10 talik testning javoblari bo‘ladi.

Javoblar testlar bilan bir xil mavzu raqami va nomi ostida joylashadi.

Avval farzandingiz “Testlar” bo‘limidagi savollarni mustaqil yechsin. So‘ng javoblarini shu yerda tekshirasiz.

Kerakli kitobni tanlang:`;
export function practiceSection(kind){
 if(!['tests','answers'].includes(kind))throw Error('Unknown practice section');
 return {text:kind==='tests'?PRACTICE_TESTS_TEXT:PRACTICE_ANSWERS_TEXT,rows:[
  ...PRACTICE_BOOKS.map(book=>[{text:book.name+(kind==='tests'?' testlari':' javoblari'),callback_data:'practice:'+kind+':book:'+book.id}]),
  [{text:kind==='tests'?'Test javoblari':'Testlar',callback_data:kind==='tests'?'practice:answers':'practice:tests'}],
  [{text:'Bosh menyu',callback_data:'practice:home'}]
 ]};
}
const PAGE_SIZE=9;
const opposite=kind=>kind==='tests'?'answers':'tests';
const topicsFor=(catalog,bookId)=>catalog.filter(t=>t.book_id===String(bookId)).sort((a,b)=>a.number-b.number);
export function practiceBook(kind,bookId,page=0,catalog=PRACTICE_CATALOG){
 if(!['tests','answers'].includes(kind))throw Error('Unknown practice section');
 const book=PRACTICE_BOOKS.find(b=>b.id===String(bookId));if(!book)throw Error('Unknown practice book');
 const topics=topicsFor(catalog,bookId),pages=Math.max(1,Math.ceil(topics.length/PAGE_SIZE));
 if(!Number.isInteger(page)||page<0||page>=pages)return {text:'Mavzu sahifasi topilmadi. Kitobni qayta tanlang.',rows:[[{text:'⬅️ Kitoblar ro‘yxati',callback_data:'practice:'+kind}]]};
 const heading=(kind==='tests'?'📘 ':'✅ ')+book.name+(kind==='tests'?' testlari':' javoblari');
 const rows=topics.slice(page*PAGE_SIZE,(page+1)*PAGE_SIZE).map(t=>[{text:(t.number+'-mavzu. '+t.title).slice(0,64),callback_data:'practice:'+kind+':topic:'+book.id+':'+t.number}]);
 const nav=[];
 if(page>0)nav.push({text:'⬅️ Oldingi sahifa',callback_data:'practice:'+kind+':book:'+book.id+':page:'+(page-1)});
 if(page+1<pages)nav.push({text:'Keyingi sahifa ➡️',callback_data:'practice:'+kind+':book:'+book.id+':page:'+(page+1)});
 if(nav.length)rows.push(nav);
 rows.push([{text:book.name+(kind==='tests'?' javoblari':' testlari'),callback_data:'practice:'+opposite(kind)+':book:'+book.id+':page:'+page}],[{text:'⬅️ Kitoblar ro‘yxati',callback_data:'practice:'+kind}],[{text:'Bosh menyu',callback_data:'practice:home'}]);
 return {text:heading+'\n\n'+(topics.length?`Har bir mavzuda 10 ta test. Mavzuni tanlang.\n${page+1}/${pages}-sahifa · ${topics.length} ta mavzu.`:(kind==='tests'?'Bu kitobning har bir mavzusi asosida 10 tadan test joylanadi. Hozircha mavzular va test rasmlari joylanmagan.':'Hozircha ushbu kitob uchun javoblar joylanmagan.')),rows};
}
export function practiceTopic(kind,bookId,number,catalog=PRACTICE_CATALOG){
 const topics=topicsFor(catalog,bookId),index=topics.findIndex(t=>t.number===number),topic=topics[index];
 if(!['tests','answers'].includes(kind)||!topic)return {text:'Mavzu topilmadi. Kitobni qayta tanlang.',rows:[[{text:'⬅️ Kitoblar ro‘yxati',callback_data:'practice:'+(['tests','answers'].includes(kind)?kind:'tests')}]]};
 const route=(k,n)=>'practice:'+k+':topic:'+bookId+':'+n;
 const rows=[[{text:kind==='tests'?'✅ Shu mavzu javoblari':'📝 Shu mavzu testi',callback_data:route(opposite(kind),number)}]],nav=[];
 if(index>0)nav.push({text:'⬅️ '+topics[index-1].number+'-mavzu',callback_data:route(kind,topics[index-1].number)});
 if(index+1<topics.length)nav.push({text:topics[index+1].number+'-mavzu ➡️',callback_data:route(kind,topics[index+1].number)});
 if(nav.length)rows.push(nav);
 rows.push([{text:'⬅️ Mavzular ro‘yxati',callback_data:'practice:'+kind+':book:'+bookId+':page:'+Math.floor(index/PAGE_SIZE)}],[{text:'Bosh menyu',callback_data:'practice:home'}]);
 const heading='📘 Y_I_E '+bookId+'-qism · '+number+'-mavzu\n'+topic.title;
 if(kind==='answers')return {text:heading+'\n\n✅ Javoblar: '+topic.answers.map((a,i)=>(i+1)+'–'+a).join('  ')+'\n\n'+topic.explanations.join('\n')+'\n\nHar to‘g‘ri javobga 1 ball. Jami: 10 ball.',rows};
 const text=heading+'\n\n10 ta test. Farzandingiz avval mustaqil yechsin, keyin javoblarni solishtiring.';
 return topic.image?{text,photo:'practice:'+topic.image.path+':'+topic.image.sha256,rows}:{text:heading+'\n\nTest rasmi hozir mavjud emas. Ma’muriyatga xabar bering.',rows};
}
