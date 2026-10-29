// Section shells only. The course owner will provide topic images and answer keys.
// No placeholder questions, fabricated answers or automatic scoring are published.
export const PRACTICE_TESTS_TEXT=`📝 Testlar

Farzandingizning mavzuni qanchalik o‘zlashtirganini tekshiring.

📚 Har bir mavzu bo‘yicha 10 ta test bo‘ladi.
🖼 Har bir 10 talik test to‘plami bitta rasm sifatida joylanadi.
👨‍👩‍👧‍👦 Ota-onalar ushbu testlarni farzandlari bilan ishlashlari mumkin.

Hozircha test rasmlari joylanmagan. Materiallar qo‘shilgach, kerakli mavzuni shu bo‘limdan tanlaysiz.

Avval farzandingiz testni mustaqil yechsin. Keyin “Test javoblari” bo‘limida javoblarni solishtirasiz.`;
export const PRACTICE_ANSWERS_TEXT=`✅ Test javoblari

Bu bo‘limda har bir mavzuga oid 10 talik testning javoblari bo‘ladi.

Hozircha javoblar joylanmagan. Ular testlar bilan mos mavzu nomi ostida qo‘shiladi.

Avval farzandingiz “Testlar” bo‘limidagi savollarni mustaqil yechsin. So‘ng javoblarini shu yerda tekshirasiz.`;
export function practiceSection(kind){
 if(!['tests','answers'].includes(kind))throw Error('Unknown practice section');
 return {text:kind==='tests'?PRACTICE_TESTS_TEXT:PRACTICE_ANSWERS_TEXT,rows:[
  [{text:kind==='tests'?'Test javoblari':'Testlar',callback_data:kind==='tests'?'practice:answers':'practice:tests'}],
  [{text:'Bosh menyu',callback_data:'practice:home'}]
 ]};
}
