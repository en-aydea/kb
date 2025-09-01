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

// Client Tools'ları globalde kaydet
window.clientTools = {
  async getCustomerName({ spoken_customer_id }) {
    const id = normalizeCustomerId(spoken_customer_id);
    console.log("[getCustomerName] raw:", spoken_customer_id, "=>", id);

    const name = DEMO_CUSTOMERS[id];
    if (!name) {
      // Agent prompt'undaki retry kuralları bunu baz alacak
      return { ok: false, error: "customer_not_found", customer_id: id };
    }

    // dynamic-variables'a yaz ki agent tüm yanıtlarda ismi kullansın
    const oldVars = widget?.getAttribute('dynamic-variables');
    const merged = { ...(oldVars ? JSON.parse(oldVars) : {}), customer_name: name, customer_id: id };
    widget?.setAttribute('dynamic-variables', JSON.stringify(merged));

    return { ok: true, customer_id: id, customer_name: name };
  },

   async submitLoanApplication({ customer_id, desired_loan_amount, term_months }) {
    const amount = Number(desired_loan_amount);
    const term   = Number(term_months || 12);
    const approved = amount <= 50000;

    // Aylık faiz oranı %4,5
    const r = 0.045;
    let monthlyPayment = 0;

    if (approved && term > 0) {
      monthlyPayment = (amount * r) / (1 - Math.pow(1 + r, -term));
    }

    const name = DEMO_CUSTOMERS[String(customer_id)] || "Müşterimiz";

    const decision = {
      approve: approved,
      approved_amount: approved ? amount : 0,
      monthly_payment: Number(monthlyPayment.toFixed(2)),
      term_months: term,
      reasons: approved ? ["OK"] : ["Talep edilen tutar demo limitini aşıyor"]
    };

    const customer_summary = approved
      ? `Sayın ${name}, başvurunuz ön onay aldı. Tutar: ${amount.toLocaleString('tr-TR')} TL, vade: ${term} ay, aylık taksit yaklaşık: ${monthlyPayment.toLocaleString('tr-TR', {minimumFractionDigits:2})} TL.`
      : `Sayın ${name}, bu tutarda başvurunuz uygun değil. Daha düşük bir tutarla yeniden deneyebilirsiniz.`;

    const oldVars = widget?.getAttribute('dynamic-variables');
    const merged = { ...(oldVars ? JSON.parse(oldVars) : {}), customer_name: name, customer_id: String(customer_id) };
    widget?.setAttribute('dynamic-variables', JSON.stringify(merged));

    return { ok: true, decision, customer_summary };
  }
};

console.log("[clientTools] registered (faizli, hard-coded).");