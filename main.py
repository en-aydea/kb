from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pathlib import Path

from tools import init_db, fetch_customer_profile, fetch_financials, rules_loan_eligibility

app = FastAPI(title="Agentic Voice Banking")

@app.on_event("startup")
def _startup():
    init_db()

# Static files (frontend)
STATIC_DIR = Path(__file__).parent / "static"
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

@app.get("/")
def index():
    return FileResponse(STATIC_DIR / "index.html")

@app.get("/healthz")
def health():
    return {"health": "ok"}

# --- Demo API'leri ---

@app.get("/profile/{customer_id}")
def get_profile(customer_id: str):
    prof = fetch_customer_profile(customer_id)
    if not prof:
        raise HTTPException(status_code=404, detail="Customer not found")
    return {
        "customer_id": prof["customer_id"],
        "name": prof["name"],
        "segment": prof["segment"],
        "employment_status": prof["employment_status"],
        "age": prof["age"],
    }

@app.post("/loan/apply")
def loan_apply(payload: dict):
    """
    Beklenen alanlar:
      - customer_id (str)
      - desired_loan_amount (float)
      - term_months (int)
    """
    required = ["customer_id", "desired_loan_amount", "term_months"]
    for k in required:
        if k not in payload:
            raise HTTPException(status_code=400, detail=f"Missing field: {k}")

    # Pseudo profil + finans
    application = {
        "customer_id": str(payload["customer_id"]),
        "desired_loan_amount": float(payload["desired_loan_amount"]),
        "term_months": int(payload["term_months"]),
        "customer_profile": fetch_customer_profile(str(payload["customer_id"])) or {
            "customer_id": str(payload["customer_id"]),
            "name": "Müşterimiz",
            "segment": "Mass",
            "employment_status": "unknown",
            "age": 30,
        },
    }

    fin = fetch_financials(application["customer_id"])
    decision = rules_loan_eligibility(application, fin)

    # Final onay: yalnızca kural sonuçları (KYC demodan çıkarıldı)
    decision["final_approve"] = bool(decision.get("approve"))

    customer_name = application["customer_profile"]["name"]
    if decision["final_approve"]:
        customer_summary = (
            f"{customer_name}, kredi başvurunuz ön onay aldı. "
            f"Önerilen kredi tutarı: {decision['approved_amount']:,.0f} TL, "
            f"vade: {decision['term_months']} ay, "
            f"taksit yaklaşık: {decision['monthly_payment']:,.0f} TL."
            " Nihai onay için kimlik doğrulaması tamamlanacaktır."
        )
    else:
        customer_summary = (
            f"{customer_name}, maalesef bu aşamada kredi başvurunuz ön onay alamadı. "
            f"Nedenler: {', '.join(decision.get('reasons', []))}. "
            "Kredi skoru veya genel risk göstergeleri iyileştiğinde tekrar deneyebilirsiniz."
        )

    return JSONResponse({
    "decision": decision,
    "context": {
        "customer_name": customer_name,
        "customer_summary": customer_summary,
        "internal_summary": {
            "customer_id": application["customer_id"],
            "score": fin.get("credit_score"),
            "dsr": decision.get("dsr"),            # <-- geri ekledik
            "policy_rate": decision.get("policy_rate"),
            "notes": decision.get("reasons"),
        }
    }
})