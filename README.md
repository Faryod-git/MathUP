<!-- MathUP Local 1.1 -->
# MathUP
MathUP kursi uchun kerakli manbalar.

MathUP Local — Windows kompyuterda ishlaydigan admin panel va Telegram bot.
Node.js 24.13+ (24.x tavsiya qilinadi), ichki SQLite; npm paketlari kerak emas.

Admin panel: ota-onalar/o‘quvchilarni qo‘shish va tahrirlash, qidiruv va holat filtri,
bir martalik Telegram bog‘lash havolasi, o‘quvchilar orqali tanlangan 1–20 ota-onaga xabarni oldindan
ko‘rib, tasdiqlab yuborish. Bot: rozilik asosida ota-ona va farzandni ro‘yxatga olish,
ro‘yxatni shu admin bazasiga avtomatik yozish, `/stop` bilan xabar roziligini bekor qilish.
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
   ota-ona ismi → telefon → farzand ismi → sinf 1–11 → alohida xabarlar roziligi.
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
Admin yuborgan matn bazaga yozilmaydi; hash va yuborish holati saqlanadi.
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
