<!-- MathUP Local 1.1 -->
# MathUP
MathUP kursi uchun kerakli manbalar.

MathUP Local — Windows kompyuterda ishlaydigan admin panel va Telegram bot.
Node.js 24.13+ (24.x tavsiya qilinadi), ichki SQLite; npm paketlari kerak emas.

Admin panel: ota-onalar/o‘quvchilarni qo‘shish va tahrirlash, qidiruv va holat filtri,
bir martalik Telegram bog‘lash havolasi, o‘quvchilar orqali tanlangan 1–20 ota-onaga xabarni oldindan
ko‘rib, tasdiqlab yuborish. Bot: rozilik asosida ota-ona va farzandni ro‘yxatga olish,
ro‘yxatni shu admin bazasiga avtomatik yozish. Telegram bog‘langan ota-onalarga xabar yuboriladi.
Yangi botda TEST 1 va TEST 2 yo‘q. ChatPlace’dagi asl avtomatizatsiyalar o‘zgartirilmaydi.

## Holat

- Linux/Node 24.22.1 da 64 ta tekshiruv o‘tdi; Telegram chaqiruvlari sun’iy.
- GitHub Actions’da Linux’da 64 ta, Windows’da 65 ta tekshiruv o‘tdi.
  Windows DPAPI/.NET/Node parol mosligi va barcha PowerShell skriptlari ham tekshirildi.
  [Tasdiqlangan natija](https://github.com/Faryod-git/MathUP/actions/runs/40489623399).
- Alohida namuna server jarayonini ishga tushirish, parol bilan kirish va sun’iy
  ro‘yxatni o‘qish ham tekshirildi; sinov jarayoni to‘xtatildi.
- Haqiqiy token, admin paroli va shaxsiy baza bu repository’da yo‘q.
- Kompyuterdagi amaliy o‘rnatish va haqiqiy botga ulash hali bajarilmagan.
- Cloudflare Worker/D1 va ChatPlace webhook’i bu kod tomonidan o‘zgartirilmaydi.
  D1’dagi ota-onalar ham avtomatik ko‘chirilmaydi. Mahalliy baza dastlab bo‘sh.

## 1. Parolsiz ma’lumotlarsiz namuna

Repository’ni **Code → Download ZIP** orqali yuklab oling va alohida yangi papkaga oching.
Oldingi ishchi papkangizni ustidan yozmang.

PowerShell’da shu papkada:

```powershell
.\Start-Demo.ps1
```

Brauzerda `http://127.0.0.1:8788/` ni oching. Faqat namuna paroli:
`MathUP-demo-only-2026`. Bu rejim haqiqiy Telegram’ga ulanmaydi.
Tugatish: server oynasida **Ctrl+C**.

## 2. Haqiqiy admin panelni ishga tushirish

```powershell
.\Setup.ps1
.\Start.ps1
```

Setup yangi 12–256 belgili admin parolini so‘raydi. Tokenni hozir kiritmasdan Enter
bosish mumkin: admin Telegram’siz ishlaydi. Token va parolni chatga yoki GitHub’ga yozmang.
Mavjud maxfiy sozlamalarni almashtirish alohida `ALMASHTIR` bilan tasdiqlanadi.

Admin manzili: **http://127.0.0.1:8787/**. Yangi parol bilan kiring.
Server oynasi ochiq tursin. PowerShell skriptlarni bloklasa, fayllarni ko‘rib chiqqach
faqat joriy PowerShell oynasi uchun `Set-ExecutionPolicy -Scope Process Bypass` qo‘llash mumkin.
Skriptlar kompyuterning umumiy execution policy sozlamasini o‘zgartirmaydi.

`config.json` — ishchi sozlamalar. `secrets.dpapi` — joriy Windows foydalanuvchisiga
bog‘langan shifrlangan maxfiy ma’lumot. Boshqa kompyuter/foydalanuvchiga ko‘chirganda
Setup’ni qayta bajaring. Parol bazada PBKDF2-SHA256 (600 000 iteratsiya) ko‘rinishida.
Admin sessiyasi 8 soat, qayta ishga tushganda sessiyalar tugaydi.

Server faqat **127.0.0.1** ni tinglaydi. Telefon yoki boshqa kompyuterdan ochilmaydi.
Telegram ichidagi masofaviy admin uchun himoyalangan HTTPS ulanish alohida sozlanishi
kerak; bu loyiha avtomatik tunnel ochmaydi. Botdagi `/admin` kompyuter manzilini aytadi.

## 3. Botni ulash va faqat o‘zingizda sinash

Avval adminni sinang va oynasida Ctrl+C bosing.

1. Setup’da token va **o‘zingizning Telegram raqamli ID**’ingizni kiriting.
   Bu telefon raqami yoki @username emas. Mavjud config bo‘lsa, `adminTelegramIds`
   ro‘yxatini o‘zingiz yangilang. Token o‘zgarsa oldingi tokenni qayta saqlash kerak.
2. `config.json` dagi `botUsername` token tegishli botga mos bo‘lsin.
   Ota-onalar shaklini sinash uchun `publicRegistrationEnabled` ni `true` qiling.
   `audience` **"admins"** bo‘lib tursin: faqat `adminTelegramIds` dagi akkauntlar
   qayta ishlanadi. Bu administrator huquqini ota-onaga bermaydi.
3. Alohida sinov boti bilan ishlash eng qulay. Ishlayotgan asosiy botda webhook bo‘lsa,
   dastur to‘xtab, ulanishni saqlaydi. Dastur webhook’ni o‘chira olmaydi.
   Asosiy botga o‘tishdan oldin ChatPlace’dagi test/oqimlarning taqdiri va o‘tish vaqtini
   kelishib, faqat shundan keyin webhook’ni boshqarish kerak.
4. `Start.ps1 -Bot` ni ishga tushiring. `/bot-status` sahifasida `mode: "polling"`
   bo‘lsa bot so‘rovlarni olyapti. `blocked` holatida `reason` sababini ko‘ring.
5. Faqat o‘z akkauntingizdan `/register` yuboring: ma’lumot saqlash roziligi →
   ota-ona ismi → telefon → farzand ismi → sinf 1–11 → yagona ro‘yxat tasdig‘i.
   Dasturda test qilganda haqiqiy oila o‘rniga sun’iy ma’lumot kiriting.
6. Adminni yangilang: ota-ona/o‘quvchi `Tasdiqlash kutilmoqda` holatida ko‘rinadi.
   Holatni ma’muriyat tasdiqlaydi. Bir ota-ona yana `/register` bilan farzand qo‘sha oladi.

Telegram’da long polling va webhook bir vaqtda ishlamaydi:
[rasmiy Telegram FAQ](https://core.telegram.org/bots/faq#how-do-i-get-updates).
Sinov rejimi ham Telegram update’larini qabul qilib tasdiqlaydi; boshqalarning
update’lari o‘tkazib yuboriladi. Shu sabab asosiy botni jonli oqimdan ajratmasdan sinamang.
Ushbu loyiha hech qachon o‘zi `setWebhook` yoki `deleteWebhook` chaqirmaydi.

Bot tayyor bo‘lgach `audience: "all"` va `publicRegistrationEnabled: true` barcha
ota-onalarning o‘zlari rozilik bilan qo‘shilishini yoqadi. Bu sozlamani faqat o‘zingizdagi
sinov va asosiy botga o‘tish tugagandan keyin o‘zgartiring. Mavjud ChatPlace kontaktlari
ushbu usul bilan import qilinmaydi — ota-onalar yangi bot shaklidan o‘tadi.

## Telegram bog‘lash va xabarlar

Admin qo‘lda qo‘shgan ota-onada **Telegram bog‘lash** tugmasini bosing.
30 daqiqalik bir martalik havolani faqat tegishli ota-onaga shaxsan bering.
U o‘z Telegram akkauntida ochib rozilik beradi. Havola egasini shaxsan tekshirish kerak:
havolani boshqa odamga berish uning noto‘g‘ri yozuvga bog‘lanishiga olib kelishi mumkin.

Xabar uchun Telegram’i bog‘langan va xabarlarga rozilik bergan ota-onalarni tanlang.
**Qabul qiluvchilarni tekshirish** → matn va ismlar → **Xabarni yuborish**.
Tasdiqlash haqiqiy xabar yuboradi. Faqat o‘zingizga bog‘langan sun’iy yozuvda sinang.
Ota-ona rozilik bermagan bo‘lsa belgilab bo‘lmaydi. `/stop` rozilikni bekor qiladi.

`sent` — Telegram qabul qildi, o‘qilganini bildirmaydi. `unknown` — natija noaniq,
avtomatik takror yuborilmaydi. Qayta jo‘natishdan oldin chatda tekshiring.
O'quvchilar orqali tanlab yuborilgan matn bazaga yozilmaydi; hash va yuborish holati saqlanadi. Umumiy bot xabari esa tasdiqlangandan so'ng vaqtinchalik navbatda saqlanadi va yakunlangach tozalanadi.
Bot javoblari vaqtinchalik navbatda turadi, yuborish natijasidan keyin matni o‘chiriladi.
Yarim qolgan rozilikli shakllar 30 daqiqadan so‘ng keyingi bot so‘rovida tozalanadi.

## Zaxira va kompyuter doim ishlashi

```powershell
npm run backup
```

SQLite zaxirasi `backups/` ichiga tushadi. Ishlayotgan SQLite faylini WAL faylsiz oddiy
copy qilib zaxiralash o‘rniga shu buyruqdan foydalaning. Shaxsiy bazani GitHub’ga yuklamang.
Tiklashdan oldin serverni to‘xtating va joriy bazani ham zaxiralang.

Qo‘lda tekshirgandan keyin `.\Install-Startup.ps1` joriy Windows foydalanuvchisi
tizimga kirganda adminni ochadi; bot ham kerak bo‘lsa `-Bot` qo‘shiladi.
Bu Windows servisi emas va tizimga kirilmaguncha boshlanmaydi. Bekor qilish:
`.\Uninstall-Startup.ps1`. Hozir avtomatik ishga tushish o‘rnatilmagan.

Kompyuter o‘chsa, uyquga ketsa yoki internet uzilsa bot javob bermaydi. Alohida
hosting to‘lovi talab qilinmaydi; internet va elektr xarajati saqlanadi.
Firewall, router, uyqu rejimi yoki Cloudflare sozlamalari avtomatik o‘zgarmaydi.

## Dastur tekshiruvlari

```powershell
npm test
```

Sun’iy ma’lumotlar va Telegram o‘rnini bosuvchi funksiyalar ishlatiladi; haqiqiy
xabar yuborilmaydi. Dastur tekshiruvlari olib tashlangan TEST 1/TEST 2 bo‘limlaridan
alohida. Windows’da DPAPI/.NET/Node parol mosligi ham tekshiriladi.

SQLite API: [Node.js 24 rasmiy hujjati](https://nodejs.org/download/release/latest-v24.x/docs/api/sqlite.html).

## GitHub’ga kirmaydigan fayllar

`.gitignore` ishchi `config.json`, `secrets.dpapi`, `.env*`, `data/`, `backups/`,
loglar va bazalarni chetlatadi. `.gitignore` oldin commit qilingan sirni olib tashlamaydi:
faqat kod va `config.example.json` ni yuklang. Parol/token/baza eksportlarini commit qilmang.

## 1.1 yangiliklari

Botda ro‘yxatdan o‘tish, farzand qo‘shish, mening farzandlarim, bosh menyu, bekor qilish va xabarlarni to‘xtatish tugmalari bor. Telefon tugmasi faqat yuboruvchining o‘z kontaktini qabul qiladi; sinf 1–11 tugmalar orqali tanlanadi.

Xabar uchun ota-ona o‘rniga o‘quvchilar qatoridagi kataklarni belgilang. Bir yuborishda 100 tagacha o‘quvchi va 20 tagacha ota-ona. Bir oilaning bir nechta farzandi tanlansa ham xabar bir marta boradi. Oldindan ko‘rishdan keyin o‘quvchi yozuvi o‘zgarsa, qabul qiluvchilarni qayta tekshirish kerak.

Yangilash: serverni Ctrl+C bilan to‘xtating. Yangi paketdagi Apply-Update.ps1 ni -Target eski loyiha papkasi bilan ishga tushiring. U faqat kod fayllarini zaxiralab almashtiradi; config.json, secrets.dpapi va data/ ko‘chirilmaydi. Keyin Start.ps1 -Bot va brauzerda Ctrl+F5. Eski bot xabarlaridagi sinf tugmalari eskirishi mumkin; Bosh menyu yoki /start bilan qayta boshlang.

### 1.1.1

Ro‘yxatdan o‘tish tugmasi faqat hali ro‘yxatdan o‘tmagan akkauntga ko‘rinadi. Ro‘yxat tugagandan keyingi javobda ham, qayta /start yuborilganda ham Farzand qo‘shish tugmasi chiqadi. Xabarlar roziligini bekor qilish ro‘yxatdan chiqqanlik hisoblanmaydi. Eski klaviaturani yangilash uchun botga /start yuboring.

### 1.2.0 — qisqaroq ro‘yxatdan o‘tish

Sinf tanlangach ro‘yxat saqlanadi. Xabarlar uchun alohida savol va xabarlarni to‘xtatish tugmasi menyuda yo‘q. Boshidagi yagona tasdiq ma’lumotlar saqlanishi va o‘quv markazi xabarlari haqida aytadi. Avval xabarlarni rad etgan ota-onaning holati farzand qo‘shilganda avtomatik o‘zgarmaydi. Eski ochiq tasdiqlash oynalari va qo‘lda /stop buyrug‘i moslik uchun ishlashda davom etadi.

### 1.3.0 — yangilangan ko‘rinish

Bot tugmalariga ikonlar qo‘shildi; eski matnli tugmalar ham ishlaydi. Admin va kirish sahifalari to‘q ko‘k/binafsha uslubda yangilandi. Kartochkalar joriy sahifadagi ro‘yxat sonini va tanlangan o‘quvchi/ota-ona sonini ko‘rsatadi. Mobil jadvallar yon tomonga suriladi. Windows Chrome’da 1440px va 390px o‘lchamlarida kirish, tanlash, xabarni oldindan ko‘rish va dialoglar sun’iy ma’lumotlarda tekshirildi.

### 1.3.1 — xabar oluvchilar tekshiruvi

Mahalliy paneldagi xabar oluvchilar uchun eski consent ustuni ishlatilmaydi: ota-ona arxivlanmagan va Telegram akkaunti tasdiqlab bog‘langan bo‘lishi kifoya. Eski yozuvlarda consent=0 bo‘lsa ham o‘quvchini tanlash, oldindan ko‘rish va yuborish ishlaydi. Bazadagi eski qiymatlarni qo‘lda o‘zgartirish yoki qayta ro‘yxatdan o‘tish kerak emas. Rozilik holati va eski tahrirlash katagi paneldan olib tashlandi. Oldindan ko‘rishdan keyingi o‘zgarishlar, bir oilaga bitta xabar va takror yuborishdan himoya saqlangan.

### 1.4.0 — o‘quvchini bazadan o‘chirish

O‘quvchilar jadvalidagi qizil O‘chirish tugmasi o‘quvchi ismi va sinfi ko‘rsatilgan tasdiqlash oynasini ochadi. Tasdiqlangach yozuv bazadan butunlay o‘chiriladi; bu arxivlash emas. 1.5 dan boshlab oxirgi farzand o'chirilsa ota-ona ham o'chadi; boshqa farzandi bo'lsa saqlanadi. Noto‘g‘ri o‘chirishni paneldan qaytarib bo‘lmaydi. O‘quvchi tahrirlangan bo‘lsa eski versiya bilan o‘chirilmaydi. O‘chirilgan o‘quvchi xabar tanlovidan chiqariladi va avval tayyorlangan xabar yuborish tasdig‘i bekor bo‘ladi. Haqiqiy bazadagi hech bir o‘quvchi avtomatik o‘chirilmaydi — har biri admin tomonidan tanlanadi.

### 1.5.0 - oilani o'chirish va umumiy bot xabarlari

O'quvchini o'chirish tasdiqlanganda, uning boshqa farzand yozuvi qolmasa ota-ona ham bazadan butunlay o'chadi. Bog'lash kodlari, ro'yxat yozuvlari, Telegram bog'lanishi, bot foydalanuvchisi va unga tegishli navbatdagi xabarlar ham tozalanadi. Boshqa farzandi bor ota-ona saqlanadi. Oldindan tayyorlangan xabar tasdig'i yaroqsiz bo'ladi. Boshlangan yoki Telegram qabul qilgan xabarni qaytarib bo'lmaydi. Shaxsiy zaxira nusxalar avtomatik o'chirilmaydi.

Oldingi versiyada farzandi o'chirilib, o'zi qolgan ota-onani Ota-onalar jadvalidagi O'chirish tugmasi orqali alohida tasdiqlab o'chirish mumkin. Bu tugma faqat farzand yozuvi yo'q ota-onada chiqadi; server buni qayta tekshiradi. Hech qanday haqiqiy yozuv avtomatik o'chirilmaydi.

**Umumiy xabar / reklama yuborish:**

1. Admin panelda **Bot foydalanuvchilari** bo'limini oching.
2. Kerakli akkauntlarni belgilang yoki **Barcha faol foydalanuvchilarga yuborish** ni tanlang.
3. Matn va kerak bo'lsa havola yozing. Bir navbatda 1000 tagacha foydalanuvchi.
4. **Xabar oluvchilarni tekshirish** ni bosing, matn va aniq qabul qiluvchilarni ko'ring.
5. **Tasdiqlash va yuborish** ni bosing. Oxirgi yuborishlarda natijani kuzating.

Kompyuter, internet va Start.ps1 -Bot ishlab turishi kerak. Oddiy Start.ps1 bilan tasdiqlangan xabar navbatda qoladi. Birinchi jo'natish polling tugashini kutib, 25 soniyagacha kechikishi mumkin. Navbat kompyuter qayta ishga tushganda saqlanadi. Telegram 429 javobida kutadi; noma'lum tarmoq natijasini avtomatik takrorlamaydi. Bot bloklansa foydalanuvchi faol emas deb belgilanadi. Holatlar: sent - Telegram qabul qildi, failed - yuborilmadi, unknown - natija noma'lum, changed - foydalanuvchi o'zgargan. O'qilganini ko'rsatmaydi.

Yangi foydalanuvchilar botga birinchi yozishidan boshlab hisoblanadi; Telegram ism va username avtomatik ko'chirilmaydi. Avvaldan bazadagi tasdiqlangan ota-onalarning Telegram ID'lari bir marta shu mahalliy bazada ro'yxatga olinadi. Eski ro'yxatdan o'tmagan foydalanuvchilar qayta /start yuborishi kerak. ChatPlace yoki Telegram'dan eski foydalanuvchilarni ommaviy olish bajarilmaydi. Audience admins bo'lsa faqat admin akkauntlari kuzatiladi; hammaga ishlashi uchun o'zingiz sozlagan audience all bo'lishi kerak.

Yangilash: serverni Ctrl+C bilan to'xtating, ushbu paketdagi Apply-Update.ps1 -Target eski-papka buyrug'ini bajaring, keyin Start.ps1 -Bot va brauzerda Ctrl+F5. Updater config.json, secrets.dpapi yoki data/ ni ko'chirmaydi. Dastur keyingi ochilganda mavjud SQLite ichida bot foydalanuvchilari va xabar navbati uchun yangi jadvallarni qo'shadi.

### Windows Startup

Admin panel va botni shu Windows foydalanuvchisi tizimga kirishi bilan yashirin ishga tushirish uchun yangi PowerShell oynasida bir marta bajaring:

powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Install-Startup.ps1 -Bot

Installer boshqa papkada bo'lsa, -ProjectPath "F:\MathUP-main" orqali ishchi loyihani ko'rsating. Dastur Windows Startup ichiga faqat MathUP Local.lnk yorlig'ini qo'shadi yoki yangilaydi. Hozir yangi serverni ishga tushirmaydi; keyingi Windows kirishida Start.ps1 -Bot bajariladi. ExecutionPolicy Bypass faqat yangi jarayonga tegishli, kompyuterning doimiy siyosati o'zgarmaydi. Windows hisobi ochilmasdan oldin ishlaydigan xizmat o'rnatilmaydi. Kompyuter uyquda yoki o'chirilgan bo'lsa bot ishlamaydi.

Bekor qilish: powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Uninstall-Startup.ps1. Ishlab turgan server bu bilan to'xtamaydi.

### 1.6.0 - o'quv guruhlari

Admin panelda Guruhlar bo'limi qo'shildi. Yangi guruh nomini o'zingiz kiriting (masalan, 5-sinf ertalab). O'quvchilarni boshqarish tugmasi barcha mavjud o'quvchilarni qidirish, sahifalash, guruhga qo'shish yoki chiqarish imkonini beradi. Kataklarni belgilang yoki olib tashlang va O'zgarishlarni saqlash tugmasini bosing. Saqlanmagan o'zgarish borida sahifalash bloklanadi. Telegram akkaunti bog'lanmagan o'quvchini ham guruhga qo'shish mumkin. Bir o'quvchi bir nechta guruhda turishi mumkin.

O'quvchilar jadvalida Guruhlar ustuni va guruh filtri bor. Guruhsiz o'quvchilarni ham alohida ko'rish mumkin. Guruh nomini o'zgartirish va guruhni o'chirish alohida amallar. Guruh o'chirilsa yoki o'quvchi guruhdan chiqarilsa, o'quvchi va ota-ona yozuvi saqlanadi. O'quvchini bazadan o'chirish avvalgidek alohida tasdiqlanadi.

Guruhdagi Xabar uchun tanlash tugmasi shu guruhdagi Telegram bog'langan ota-onalarning farzandlarini tanlaydi va oldingi xabar tanlovini almashtiradi. Keyin matn yozib Qabul qiluvchilarni tekshirish orqali aniq ismlarni ko'ring va yuborishni tasdiqlang. Bir oilaga bitta xabar. Bog'lanmagan ota-onalar soni ko'rsatiladi va ular tanlanmaydi. Avvalgi 100 o'quvchi / 20 ota-ona chegarasi saqlanadi; katta guruhni filtrlab, qo'lda qisman tanlash mumkin. Hech qanday xabar faqat guruhni yaratish yoki o'quvchi qo'shish bilan avtomatik yuborilmaydi.

Guruhga a'zolik o'zgarsa, o'sha o'quvchining versiyasi ham o'zgaradi; avvalgi xabar tasdig'i eskiradi. Baza qayta ochilganda guruhlar va a'zolik saqlanadi. Yangilash mavjud bazaga faqat yangi guruh jadvallarini qo'shadi; haqiqiy o'quvchilar hech bir guruhga avtomatik joylanmaydi.
