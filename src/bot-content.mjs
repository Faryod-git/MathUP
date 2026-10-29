export const CONTACTS=Object.freeze({phone:'+998 88 729 66 67',channel:'MathUP_Course_Gallaorol',group:'MathUP_Gallaorol'});
export const CONTACT_PHONE_COMPLETE=/^\+998\d{9}$/.test(CONTACTS.phone.replace(/\s/g,''));
const ABOUT=`📚 MathUP G‘allaorol — matematika kursining ota-onalar uchun boti.

Bu bot orqali:
📝 O‘zingiz va farzandingizni ro‘yxatdan o‘tkazasiz.
👨‍👩‍👧‍👦 Farzandlaringiz va ularning o‘qish holatini ko‘rasiz.
📩 O‘quv markazining xabar va e’lonlarini olasiz.
📞 Markaz bilan bog‘lanasiz, kanal va guruhga o‘tasiz.`;
export const WELCOME_TEXT=ABOUT+'\n\n📝 Testlar va ✅ Test javoblari bo‘limlari ochildi. Materiallar tayyorlanmoqda.\n\nQuyidagi menyudan kerakli amalni tanlang.';
export const BOT_DESCRIPTION=ABOUT+'\n\nBoshlash uchun START tugmasini bosing.';
export const BOT_SHORT_DESCRIPTION='MathUP G‘allaorol: ota-onalar uchun ro‘yxatdan o‘tish, farzandlar holati, kurs xabarlari va bog‘lanish.';
export const CONTACT_TEXT=`📞 MathUP bilan bog‘lanish

Tel: ${CONTACTS.phone}
📢 Telegram kanal: @${CONTACTS.channel}
👥 Telegram guruh: @${CONTACTS.group}

Kanal yoki guruhni ochish uchun quyidagi tugmalardan foydalaning.`;
export const CONTACT_ENTITIES=CONTACT_PHONE_COMPLETE?[{type:'phone_number',offset:CONTACT_TEXT.indexOf(CONTACTS.phone),length:CONTACTS.phone.length}]:[];
export function contactButtons(){return [
 [{text:'📢 Telegram kanal',url:'https://t.me/'+CONTACTS.channel}],
 [{text:'👥 Telegram guruh',url:'https://t.me/'+CONTACTS.group}]
];}
