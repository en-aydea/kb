// kb/static/app.js
// ===============================================
// DEMO CREDIT TOOLS for ElevenLabs Convai (Client Tools)
// Data source: /static/data/loans.json
// ===============================================

// ---------- Helpers ----------
const WIDGET = () => document.querySelector('elevenlabs-convai');

function setDV(patch) {
  const el = WIDGET();
  const oldStr = el?.getAttribute('dynamic-variables');
  const base = oldStr ? JSON.parse(oldStr) : {};
  el?.setAttribute('dynamic-variables', JSON.stringify({ ...base, ...patch }));
}

function normalizeDigits(s) {
  return String(s ?? "").replace(/\D/g, "");
}

function annuity(P, r, n) {
  if (!r || r <= 0) return P / Math.max(1, n);
  return (P * r) / (1 - Math.pow(1 + r, -n));
}

function round2(x) {
  return Number((Math.round((x + Number.EPSILON) * 100) / 100).toFixed(2));
}

// --- Turkish number word → digit helpers ---
const WORD2DIGIT = {
  "sıfır":"0","sifir":"0","0":"0",
  "bir":"1","1":"1",
  "iki":"2","2":"2",
  "üç":"3","uc":"3","3":"3",
  "dört":"4","dort":"4","4":"4",
  "beş":"5","bes":"5","5":"5",
  "altı":"6","alti":"6","6":"6",
  "yedi":"7","7":"7",
  "sekiz":"8","8":"8",
  "dokuz":"9","9":"9"
};

function toDigitsFromTurkishWords(input) {
  if (!input) return "";
  const txt = String(input).toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, " ");
  const parts = txt.split(/[\s-]+/).filter(Boolean);
  const buf = [];
  for (const p of parts) {
    if (/^\d+$/.test(p)) { buf.push(p); continue; }   // already digits
    const d = WORD2DIGIT[p];
    if (d !== undefined) buf.push(d);                 // word → single digit
  }
  const joined = buf.join("");
  return joined || String(input).replace(/\D/g, "");  // fallback: strip non-digits
}

function normalizeCustomerId(anyForm) {
  const id = toDigitsFromTurkishWords(anyForm);
  return id.replace(/\D/g, "");
}


// ---------- Load & Cache JSON ----------
let LOANS_DB = null;

async function loadDB() {
  if (LOANS_DB) return LOANS_DB;
  const res = await fetch("/static/data/loans.json", { cache: "no-store" });
  if (!res.ok) throw new Error("loans.json not found");
  LOANS_DB = await res.json();
  return LOANS_DB;
}

// ---------- Policy helpers ----------
function effectiveMonthlyRateForScore(db, score) {
  const base = Number(db._policies?.pricing?.base_monthly_rate ?? 0.045);
  const table = db._policies?.pricing?.risk_addon_by_score || [];
  // pick first rule with min_score <= score (rules sorted desc by min_score recommended)
  let addon = 0;
  let bestMin = -1;
  for (const r of table) {
    if (score >= r.min_score && r.min_score > bestMin) {
      addon = Number(r.addon || 0);
      bestMin = r.min_score;
    }
  }
  return base + addon;
}

function dsrOk(incomeMonthly, debtsMonthly, newPayment, maxDsr) {
  if (!incomeMonthly || incomeMonthly <= 0) return true; // demo tolerance
  const dsr = (Number(debtsMonthly || 0) + Number(newPayment || 0)) / Number(incomeMonthly);
  return dsr <= maxDsr;
}

// ---------- Client Tools ----------
window.clientTools = window.clientTools || {};

/**
 * getCustomerName(spoken_customer_id: string)
 * -> { ok, customer_id, customer_name }
 */
window.clientTools.getCustomerName = async (args) => {
  try {
    // Parametre adı bazen yanlış gelebilir; ikisini de destekle
    const rawId = (args && (args.spoken_customer_id ?? args.customer_id)) || "";
    const id = normalizeCustomerId(rawId);

    const db = await loadDB();
    const rec = db.customers?.[id];
    if (!rec || !rec.name) {
      console.warn("[getCustomerName] not found:", { rawId, id });
      return { ok:false, error:"customer_not_found", customer_id:id };
    }

    // Dynamic variables: agent prompt'u {{customer_name}} kullanacak
    setDV({ customer_id: id, customer_name: rec.name });

    console.log("[getCustomerName] OK:", { rawId, id, name: rec.name });
    return { ok:true, customer_id: id, customer_name: rec.name };
  } catch (e) {
    console.error("[getCustomerName] error:", e);
    return { ok:false, error:"unexpected_error" };
  }
};


/**
 * fetchCustomerSnapshot(customer_id: string)
 * -> { ok, snapshot }
 */
window.clientTools.fetchCustomerSnapshot = async ({ customer_id }) => {
  const db = await loadDB();
  const rec = db.customers?.[String(customer_id)];
  if (!rec) return { ok: false, error: "not_found" };
  return { ok: true, snapshot: rec };
};

/**
 * eligibilityCheck(customer_id: string, desired_amount: number, term_months: number)
 * -> { ok, approve, reasons[], policy_rate, suggested_amount? }
 */
window.clientTools.eligibilityCheck = async ({ customer_id, desired_amount, term_months }) => {
  const db = await loadDB();
  const rec = db.customers?.[String(customer_id)];
  if (!rec) return { ok: false, error: "customer_not_found" };

  const pol = db._policies || {};
  const minScore = Number(pol.eligibility?.min_credit_score ?? 1000);
  const maxDelay = Number(pol.eligibility?.max_delinquency_days ?? 30);
  const maxDsr = Number(pol.eligibility?.max_dsr ?? 0.45);
  const demoLimit = Number(pol.eligibility?.demo_default_preapproved_limit ?? 125000);
  const limit = Number(rec.preapproved_max_amount ?? demoLimit);

  // rate by score
  const monthlyRate = effectiveMonthlyRateForScore(db, Number(rec.credit_score ?? 650));

  // monthly payment estimate for DSR
  const estPayment = annuity(Number(desired_amount), monthlyRate, Number(term_months));

  const reasons = [];
  const scoreOK = Number(rec.credit_score ?? 0) >= minScore;
  if (!scoreOK) reasons.push("Kredi skoru eşiğin altında");

  const delayOK = Number(rec.delinquency_days ?? 0) <= maxDelay;
  if (!delayOK) reasons.push("Gecikme gün sayısı yüksek");

  const amountOK = Number(desired_amount) <= limit;
  if (!amountOK) reasons.push("Talep edilen tutar ön-onay limitini aşıyor");

  const dsrOK = dsrOk(rec.income_monthly, rec.debts_monthly, estPayment, maxDsr);
  if (!dsrOK) reasons.push("Gelir/borç oranı uygun değil (DSR)");

  const approve = !!(scoreOK && delayOK && amountOK && dsrOK);
  const suggested_amount = approve ? undefined : Math.min(Number(desired_amount), limit);

  return { ok: true, approve, reasons, policy_rate: monthlyRate, suggested_amount };
};

/**
 * computeRepaymentPlan(amount: number, term_months: number, monthly_rate?: number, customer_id?: string)
 * -> { ok, summary{monthly_payment,total_interest,total_payment}, schedule[] }
 */
window.clientTools.computeRepaymentPlan = async ({ amount, term_months, monthly_rate, customer_id }) => {
  const db = await loadDB();
  const P = Number(amount);
  const n = Number(term_months);

  let r = Number(monthly_rate);
  if (!Number.isFinite(r) || r <= 0) {
    // use policy + score if customer provided
    if (customer_id) {
      const rec = db.customers?.[String(customer_id)];
      r = effectiveMonthlyRateForScore(db, Number(rec?.credit_score ?? 650));
    } else {
      r = Number(db._policies?.pricing?.base_monthly_rate ?? 0.045);
    }
  }

  if (!(P > 0) || !(n > 0)) return { ok: false, error: "invalid_inputs" };

  const A = annuity(P, r, n);
  let balance = P;
  let totalInterest = 0;
  const schedule = [];

  for (let i = 1; i <= n; i++) {
    const interest = balance * r;
    const principal = Math.max(0, A - interest);
    balance = Math.max(0, balance - principal);
    totalInterest += interest;
    schedule.push({
      installment: i,
      payment: round2(A),
      interest: round2(interest),
      principal: round2(principal),
      balance: round2(balance)
    });
  }

  const summary = {
    monthly_payment: round2(A),
    total_interest: round2(totalInterest),
    total_payment: round2(P + totalInterest),
    rate_monthly: round2(r)
  };

  // (opsiyonel) son planı hafifçe hatırla
  window.__lastPlan = { amount: P, term: n, rate: r, schedule, summary };
  return { ok: true, summary, schedule };
};

/**
 * compareTerms(amount: number, terms: number[], customer_id?: string)
 * -> { ok, items: [{term, monthly_payment, total_interest}] }
 */
window.clientTools.compareTerms = async ({ amount, terms, customer_id }) => {
  const db = await loadDB();
  const P = Number(amount);
  const rec = customer_id ? db.customers?.[String(customer_id)] : null;
  const r = rec ? effectiveMonthlyRateForScore(db, Number(rec.credit_score ?? 650))
                : Number(db._policies?.pricing?.base_monthly_rate ?? 0.045);
  if (!Array.isArray(terms) || !terms.length) return { ok: false, error: "invalid_terms" };

  const items = terms.map(t => {
    const n = Number(t);
    const A = annuity(P, r, n);
    const total_interest = Math.max(0, A * n - P);
    return { term: n, monthly_payment: round2(A), total_interest: round2(total_interest) };
  });
  return { ok: true, items, rate_monthly: round2(r) };
};

/**
 * payoffQuote(customer_id: string, loan_id: string)
 * -> { ok, payoff_amount, penalty, note }
 */
window.clientTools.payoffQuote = async ({ customer_id, loan_id }) => {
  const db = await loadDB();
  const rec = db.customers?.[String(customer_id)];
  if (!rec) return { ok: false, error: "customer_not_found" };
  const loan = (rec.loans || []).find(l => l.loan_id === loan_id);
  if (!loan) return { ok: false, error: "loan_not_found" };

  const penaltyRate = Number(db._policies?.fees?.early_prepayment_penalty_rate ?? 0.02);
  const penalty = round2(Number(loan.remaining_balance || 0) * penaltyRate);
  const payoff = round2(Number(loan.remaining_balance || 0) + penalty);

  return {
    ok: true,
    payoff_amount: payoff,
    penalty,
    note: `Erken kapama cezası kalan anapara üzerinden %${(penaltyRate * 100).toFixed(0)}`
  };
};

/**
 * restructureOptions(customer_id: string, loan_id: string)
 * -> { ok, options: [{new_term, est_monthly_payment, fee}], rate_monthly }
 */
window.clientTools.restructureOptions = async ({ customer_id, loan_id }) => {
  const db = await loadDB();
  const rec = db.customers?.[String(customer_id)];
  if (!rec) return { ok: false, error: "customer_not_found" };
  const loan = (rec.loans || []).find(l => l.loan_id === loan_id);
  if (!loan) return { ok: false, error: "loan_not_found" };

  const pol = db._policies || {};
  if (!pol.restructuring?.allowed) return { ok: false, error: "not_allowed" };

  // yeni oran politikası: keep current or base+risk
  const keepRate = Number(loan.rate_monthly || 0.045);
  const riskRate = effectiveMonthlyRateForScore(db, Number(rec.credit_score ?? 650));
  const r = pol.restructuring?.rate_policy === "keep_or_base_plus_risk" ? Math.max(keepRate, riskRate) : keepRate;

  const fee = Number(pol.fees?.restructure_processing_fee ?? 250);
  const terms = pol.restructuring?.allowed_new_terms || [12, 24, 36];

  // kalan bakiye üzerinde hesapla (yaklaşık)
  const P = Number(loan.remaining_balance || loan.principal);
  const options = terms.map(n => ({
    new_term: Number(n),
    est_monthly_payment: round2(annuity(P, r, Number(n))),
    fee
  }));
  return { ok: true, options, rate_monthly: round2(r) };
};

/**
 * deferralEligibility(customer_id: string, loan_id: string)
 * -> { ok, eligible, reason? }
 */
window.clientTools.deferralEligibility = async ({ customer_id, loan_id }) => {
  const db = await loadDB();
  const rec = db.customers?.[String(customer_id)];
  if (!rec) return { ok: false, error: "customer_not_found" };
  const loan = (rec.loans || []).find(l => l.loan_id === loan_id);
  if (!loan) return { ok: false, error: "loan_not_found" };

  const pol = db._policies || {};
  if (!pol.deferral?.allowed) return { ok: true, eligible: false, reason: "Politika gereği erteleme kapalı" };

  const maxPerYear = Number(pol.deferral?.max_deferrals_per_year ?? 2);
  const used = Number(loan.deferrals_used_this_year ?? 0);
  if (used >= maxPerYear) return { ok: true, eligible: false, reason: "Bu yıl erteleme hakkınız doldu" };

  return { ok: true, eligible: true };
};

/**
 * submitLoanApplication(customer_id: string, desired_loan_amount: number, term_months: number)
 * -> { ok, decision, customer_summary }
 */
window.clientTools.submitLoanApplication = async ({ customer_id, desired_loan_amount, term_months }) => {
  const db = await loadDB();
  const id = String(customer_id);
  const rec = db.customers?.[id];
  const name = rec?.name || "Müşterimiz";
  setDV({ customer_id: id, customer_name: name });

  // Eligibility
  const elig = await window.clientTools.eligibilityCheck({
    customer_id: id,
    desired_amount: Number(desired_loan_amount),
    term_months: Number(term_months)
  });

  // Plan
  let monthly = 0;
  if (elig.ok && elig.approve) {
    const plan = await window.clientTools.computeRepaymentPlan({
      amount: Number(desired_loan_amount),
      term_months: Number(term_months),
      customer_id: id,
      monthly_rate: elig.policy_rate
    });
    if (plan.ok) monthly = Number(plan.summary.monthly_payment);
  }

  const decision = {
    approve: !!elig.approve,
    approved_amount: elig.approve ? Number(desired_loan_amount) : 0,
    monthly_payment: round2(monthly),
    term_months: Number(term_months),
    reasons: elig.approve ? ["OK"] : (elig.reasons || [])
  };

  const customer_summary = elig.approve
    ? `Sayın ${name}, başvurunuz ön onay aldı. Tutar: ${Number(desired_loan_amount).toLocaleString('tr-TR')} TL, vade: ${term_months} ay, aylık taksit yaklaşık: ${round2(monthly).toLocaleString('tr-TR',{minimumFractionDigits:2})} TL.`
    : `Sayın ${name}, talep edilen tutar şu an için uygun görünmüyor: ${(elig.reasons||[]).join(", ")}${elig.suggested_amount ? `. Önerilen tutar: ${Number(elig.suggested_amount).toLocaleString('tr-TR')} TL.` : ""}`;

  return { ok: true, decision, customer_summary };
};

console.log("[clientTools] registered:", Object.keys(window.clientTools));
