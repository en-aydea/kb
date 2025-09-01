PRAGMA journal_mode=WAL;

DROP TABLE IF EXISTS customers;
DROP TABLE IF EXISTS financials;

CREATE TABLE customers (
  customer_id TEXT PRIMARY KEY,
  name TEXT,
  segment TEXT,
  employment_status TEXT,
  age INTEGER
);

CREATE TABLE financials (
  customer_id TEXT PRIMARY KEY,
  monthly_income REAL,
  existing_debt REAL,
  credit_score INTEGER
);

INSERT INTO customers VALUES
('2349','Kerem Ardağ','Affluent','salaried',49),
('1234','Enes Aydın','Affluent','salaried',34),
('2838','Eralp Şirincan','Mass','salaried',55),
('7563','Kasım Yüce','Mass','salaried',40);

INSERT INTO financials VALUES
('2349', 420000,  50000, 1800),
('1234', 95000, 12000, 1500),
('2838', 130000, 120000, 900),
('7563',  28000,  50000, 700);
