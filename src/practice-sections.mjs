// Section shells only. The course owner will provide topic images and answer keys.
// No placeholder questions, fabricated answers or automatic scoring are published.
export const PRACTICE_BOOKS=Object.freeze([1,2,3].map(part=>Object.freeze({id:String(part),name:'Y_I_E '+part+'-qism'})));
export const PRACTICE_TESTS_TEXT=`📝 Testlar

Farzandingizning mavzuni qanchalik o‘zlashtirganini tekshiring.

📚 Har bir mavzu bo‘yicha 10 ta test bo‘ladi.
🖼 Har bir 10 talik test to‘plami bitta rasm sifatida joylanadi.
👨‍👩‍👧‍👦 Ota-onalar ushbu testlarni farzandlari bilan ishlashlari mumkin.

Hozircha test rasmlari joylanmagan. Materiallar qo‘shilgach, kerakli mavzuni shu bo‘limdan tanlaysiz.

Avval farzandingiz testni mustaqil yechsin. Keyin “Test javoblari” bo‘limida javoblarni solishtirasiz.

Kerakli kitobni tanlang:`;
export const PRACTICE_ANSWERS_TEXT=`✅ Test javoblari

Bu bo‘limda har bir mavzuga oid 10 talik testning javoblari bo‘ladi.

Hozircha javoblar joylanmagan. Ular testlar bilan mos mavzu nomi ostida qo‘shiladi.

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
export function practiceBook(kind,bookId){
 if(!['tests','answers'].includes(kind))throw Error('Unknown practice section');
 const book=PRACTICE_BOOKS.find(b=>b.id===String(bookId));if(!book)throw Error('Unknown practice book');
 const text=kind==='tests'?`📘 ${book.name} testlari

Bu kitobning har bir mavzusi asosida 10 tadan test joylanadi. Har bir 10 talik to‘plam bitta rasm ko‘rinishida bo‘ladi.

Hozircha ushbu kitob uchun mavzular va test rasmlari joylanmagan. Materiallar qo‘shilgach, kerakli mavzuni shu yerdan tanlaysiz.

Farzandingiz avval mustaqil yechsin, so‘ng shu kitobning javoblari bilan solishtiring.`:`✅ ${book.name} javoblari

Bu yerda ushbu kitobning har bir mavzusiga oid 10 talik test javoblari joylanadi.

Hozircha ushbu kitob uchun javoblar joylanmagan. Ular testlarga mos mavzu nomlari ostida qo‘shiladi.`;
 return {text,rows:[
  [{text:book.name+(kind==='tests'?' javoblari':' testlari'),callback_data:'practice:'+(kind==='tests'?'answers':'tests')+':book:'+book.id}],
  [{text:'⬅️ Kitoblar ro‘yxati',callback_data:'practice:'+kind}],
  [{text:'Bosh menyu',callback_data:'practice:home'}]
 ]};
}
