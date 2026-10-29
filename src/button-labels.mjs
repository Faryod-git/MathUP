const labels = {
  'Ro‘yxatdan o‘tish':'📝 Ro‘yxatdan o‘tish',
  'Farzand qo‘shish':'➕ Farzand qo‘shish',
  'Mening farzandlarim':'👨‍👩‍👧‍👦 Mening farzandlarim',
  'Bosh menyu':'🏠 Bosh menyu',
  'Bekor qilish':'✖️ Bekor qilish',
  'Telefon raqamimni ulashish':'📱 Telefon raqamimni ulashish',
  'Roziman':'✅ Roziman',
  'Bog‘lanish':'📞 Bog‘lanish',
  '/admin':'⚙️ Admin panel'
};
export function decorateButtonLabel(text){return labels[text]||(/^(?:[1-9]|10|11)-sinf$/.test(text)?'📘 '+text:text);}
export function plainButtonText(text){for(const [plain,decorated] of Object.entries(labels))if(text===decorated)return plain;return /^📘 (?:[1-9]|10|11)-sinf$/.test(text)?text.slice(3):text;}
export function decorateKeyboard(markup){const output={...markup};for(const field of ['keyboard','inline_keyboard'])if(markup[field])output[field]=markup[field].map(row=>row.map(button=>typeof button==='string'?decorateButtonLabel(button):{...button,text:decorateButtonLabel(button.text)}));return output;}