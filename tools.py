import os, sqlite3, math
from pathlib import Path
from typing import Dict, Any, Optional

DB_PATH = Path(__file__).parent / "bank.db"
POLICY_RATE = float(os.getenv("LOAN_MONTHLY_RATE", "0.025"))  # %2.5/ay DEMO

def init_db():
    if DB_PATH.exists():
        return
    con = sqlite3.connect(DB_PATH)
    with open(Path(__file__).parent / "seed.sql", "r", encoding="utf-8") as f:
        con.executescript(f.read())
    con.commit()
    con.close()

def fetch_customer_profile(customer_id: str) -> Optional[Dict[str, Any]]:
    con = sqlite3.connect(DB_PATH)
    cur = con.cursor()
    cur.execute("""
        SELECT customer_id, name, segment, employment_status, age
        FROM customers WHERE customer_id = ?
    """, (customer_id,))
    row = cur.fetchone()
    con.close()
    if not row: return None
    return {
        "customer_id": row[0],
        "name": row[1],
        "segment": row[2],
        "employment_status": row[3],
        "age": row[4],
    }

def fetch_financials(customer_id: str) -> Dict[str, Any]:
    con = sqlite3.connect(DB_PATH)
    cur = con.cursor()
    cur.execute("""
        SELECT monthly_income, existing_debt, credit_score
        FROM financials WHERE customer_id = ?
    """, (customer_id,))
    row = cur.fetchone()
    con.close()
    if not row:
        return {"monthly_income": None, "existing_debt": None, "credit_score": None}
    return {"monthly_income": row[0], "existing_debt": row[1], "credit_score": row[2]}

def rules_loan_eligibility(app: Dict[str, Any], fin: Dict[str, Any]) -> Dict[str, Any]:
    income = app["monthly_income"]
    amount = app["desired_loan_amount"]
    term = max(int(app.get("term_months", 12)), 1)
    score = fin.get("credit_score") or 0
    existing_debt = fin.get("existing_debt") or 0
    age = app["customer_profile"].get("age", 0)

    # Aylık taksit (annuite): A = P * r / (1 - (1+r)^-n)
    r = POLICY_RATE
    try:
        monthly_payment = amount * (r / (1 - (1 + r) ** (-term)))
    except ZeroDivisionError:
        monthly_payment = amount / term

    # Basit varsayım: mevcut borçların aylık yükü
    existing_monthly = existing_debt * 0.05  # DEMO
    dsr = (existing_monthly + monthly_payment) / max(income, 1)

    approve = True
    reasons = []
    approved_amount = amount

    if age < 18:
        approve = False; reasons.append("Age < 18")
    if score < 500:
        approve = False; reasons.append("Low credit score")
    if dsr > 0.6:
        approve = False; reasons.append(f"High DSR ({dsr:.2f})")

    # Borderline karşı teklif
    if not approve and 500 <= score < 650 and dsr <= 0.7:
        approve = True
        approved_amount = max(5000.0, amount * 0.5)
        monthly_payment = approved_amount * (r / (1 - (1 + r) ** (-term)))
        dsr = (existing_monthly + monthly_payment) / max(income, 1)
        reasons.append("Counter-offer due to borderline risk")

    return {
        "approve": approve,
        "approved_amount": round(approved_amount, 2) if approve else 0.0,
        "monthly_payment": round(monthly_payment, 2),
        "term_months": term,
        "reasons": reasons or ["OK"],
        "dsr": round(dsr, 2),
        "score": score,
        "policy_rate": r,
    }
