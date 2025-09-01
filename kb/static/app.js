// Türkçe konuşulan müşteri no'yu normalize et (örn. "bir sıfır sıfır bir" -> "1001")
function normalizeCustomerId(spoken) {
  if (!spoken) return "";
  const map = {
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

  const tokens = spoken.toLowerCase().replace(/[.,\-]/g, " ").split(/\s+/).filter(Boolean);
  if (tokens.length > 1) {
    const digits = tokens.map(t => map[t] ?? t.replace(/\D/g,"")).join("");
    return digits.replace(/\D/g,"");
  }
  return spoken.replace(/\D/g, "");
}

async function fetchProfile(customerId) {
  const r = await fetch(`/profile/${encodeURIComponent(customerId)}`);
  if (!r.ok) return null;
  return await r.json(); // { name, ... }
}

document.addEventListener('DOMContentLoaded', () => {
  const widget = document.querySelector('elevenlabs-convai');
  if (!widget) return;

  widget.addEventListener('elevenlabs-convai:call', (event) => {
    // ElevenLabs Agent → Client Tools implementasyonu
    event.detail.config.clientTools = {
      // 1) Müşteri adını getir (konuşmadan alınan ID ile)
      getCustomerName: async ({ spoken_customer_id }) => {
        const normalized = normalizeCustomerId(spoken_customer_id);
        if (!normalized || normalized.length < 4) {
          return { ok:false, error:"invalid_or_ambiguous_customer_id" };
        }
        const profile = await fetchProfile(normalized);
        if (!profile || !profile.name) {
          return { ok:false, error:"customer_not_found", customer_id: normalized };
        }
        // Widget değişkenini güncelle ki ajan sürekli isimle hitap etsin
        widget.setAttribute('dynamic-variables', JSON.stringify({ customer_name: profile.name }));
        return { ok:true, customer_id: normalized, customer_name: profile.name };
      },

      // 2) Kredi başvurusu
      submitLoanApplication: async (params) => {
        const payload = {
          customer_id: String(params.customer_id),

          
          desired_loan_amount: Number(params.desired_loan_amount),
          term_months: Number(params.term_months || 12),

        };
        const resp = await fetch('/loan/apply', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!resp.ok) {
          const t = await resp.text();
          return { ok:false, error:`HTTP ${resp.status}: ${t}` };
        }
        const data = await resp.json();

        // İsim değişkenini tutarlı kıl
        if (data?.context?.customer_name) {
          widget.setAttribute('dynamic-variables', JSON.stringify({ customer_name: data.context.customer_name }));
        }

        return {
          ok:true,
          decision: data.decision,
          customer_summary: data.context?.customer_summary,
          internal_summary: data.context?.internal_summary,
        };
      },
    };
  });
});
