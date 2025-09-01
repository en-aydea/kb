// kb/static/app.js

// Sayfadaki widget referansı
const widget = document.querySelector('elevenlabs-convai');

// Hard-coded müşteri listesi
const DEMO_CUSTOMERS = {
  "2349":  "Kerem Ardağ",
  "1234": "Enes Aydın",
  "2838":  "Eralp Şirincan"
};

// Basit normalizasyon: yalnızca rakamları al (gelişmiş TR parser istersen ekleyebiliriz)
function normalizeCustomerId(input) {
  if (!input) return "";
  return String(input).toLowerCase().replace(/\D/g, "");
}

// --- Yardımcılar ---
function parseAmountTL(input) {
  if (input == null) return NaN;
  let s = String(input).toLowerCase().trim();

  // Rakam içeriyorsa: "30.000", "30,000", "30 bin" -> rakamları çek
  if (/\d/.test(s)) {
    const num = s.replace(/[^\d]/g, "");
    if (num) return Number(num);
  }

  // Kelimeyle: "otuz bin", "kırk beş bin"
  const norm = t => t.replaceAll("ç","c").replaceAll("ğ","g").replaceAll("ı","i")
                     .replaceAll("ö","o").replaceAll("ş","s").replaceAll("ü","u");
  s = norm(s);
  const UNITS = { sifir:0, bir:1, iki:2, uc:3, dort:4, bes:5, alti:6, yedi:7, sekiz:8, dokuz:9 };
  const TENS  = { on:10, yirmi:20, otuz:30, kirk:40, elli:50, altmis:60, yetmis:70, seksen:80, doksan:90 };
  const SCALE = { yuz:100, bin:1000, milyon:1_000_000, milyar:1_000_000_000 };

  const tokens = s.split(/\s+/);
  let total = 0, current = 0;
  for (let w of tokens) {
    if (UNITS[w] != null) { current += UNITS[w]; continue; }
    if (TENS[w]  != null) { current += TENS[w];  continue; }
    if (w in SCALE) { current = (current || 1) * SCALE[w]; total += current; current = 0; continue; }
  }
  total += current;
  return total || NaN;
}

function parseTermMonths(input) {
  if (input == null) return NaN;
  let s = String(input).toLowerCase().trim();

  const digits = s.match(/\d+/);
  if (digits) return Number(digits[0]);

  const UNITS = { sifir:0, bir:1, iki:2, uc:3, dort:4, bes:5, alti:6, yedi:7, sekiz:8, dokuz:9 };
  const TENS  = { on:10, yirmi:20, otuz:30, kirk:40, elli:50, altmis:60, yetmis:70, seksen:80, doksan:90 };
  const norm = t => t.replaceAll("ç","c").replaceAll("ğ","g").replaceAll("ı","i")
                     .replaceAll("ö","o").replaceAll("ş","s").replaceAll("ü","u");
  s = norm(s);
  const tokens = s.split(/\s+/);
  let val = 0;
  for (let w of tokens) {
    if (UNITS[w] != null) { val += UNITS[w]; continue; }
    if (TENS[w]  != null) { val += TENS[w];  continue; }
  }
  return val || NaN;
}

// --- İsimleri (mapping) dinamik değişkenden oku (prompt + getCustomerName zaten set ediyor) ---
function getDVName() {
  const el = document.querySelector('elevenlabs-convai');
  try {
    const dv = el?.getAttribute('dynamic-variables');
    return dv ? (JSON.parse(dv).customer_name || "Müşterimiz") : "Müşterimiz";
  } catch { return "Müşterimiz"; }
}

// --- Tool: submitLoanApplication (sağlamlaştırılmış) ---
window.clientTools = window.clientTools || {};
window.clientTools.submitLoanApplication = async (params) => {
  console.log("[submitLoanApplication] raw params:", params);

  // Farklı isimlerle gelebilir; hepsini karşıla
  let { customer_id, desired_loan_amount, term_months } = params;
  const amountRaw = desired_loan_amount ?? params.amount ?? params.loan_amount ?? params.desiredAmount;
  const termRaw   = term_months ?? params.term ?? params.months ?? params.termMonths;

  let amount = Number(amountRaw);
  if (!Number.isFinite(amount) || amount <= 0) amount = parseAmountTL(amountRaw);

  let term = Number(termRaw);
  if (!Number.isFinite(term) || term <= 0) term = parseTermMonths(termRaw);

  console.log("[submitLoanApplication] parsed -> amount:", amount, "term:", term);

  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok:false, error:"invalid_amount", message:"Tutar anlaşılamadı (ör. 30000 TL)." };
  }
  if (!Number.isFinite(term) || term <= 0) {
    return { ok:false, error:"invalid_term", message:"Vade anlaşılamadı (ör. 12 ay)." };
  }

  // Demo politikası: 50.000 TL ve altı onay
  const approved = amount <= 50000;

  // Aylık faiz %4,5 (annuite)
  const r = 0.045;
  let monthlyPayment = 0;
  if (approved) {
    monthlyPayment = (amount * r) / (1 - Math.pow(1 + r, -term));
  }

  const name = getDVName();
  const decision = {
    approve: approved,
    approved_amount: approved ? Number(amount) : 0,
    monthly_payment: Number(monthlyPayment.toFixed(2)),
    term_months: Number(term),
    reasons: approved ? ["OK"] : ["Requested amount exceeds demo limit"]
  };

  const customer_summary = approved
    ? `Sayın ${name}, başvurunuz ön onay aldı. Tutar: ${amount.toLocaleString('tr-TR')} TL, vade: ${term} ay, aylık taksit yaklaşık: ${monthlyPayment.toLocaleString('tr-TR', {minimumFractionDigits:2})} TL.`
    : `Sayın ${name}, bu tutarda başvurunuz uygun değil. Daha düşük bir tutarla yeniden deneyebiliriz.`;

  console.log("[submitLoanApplication] decision:", decision);

  return { ok:true, decision, customer_summary };
};
console.log("[clientTools] registered (submitLoanApplication ready)");


console.log("[clientTools] registered (faizli, hard-coded).");