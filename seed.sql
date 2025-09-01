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
('10001','Ayşe Korkmaz','Mass','salaried',29),
('10002','Mehmet Demir','Affluent','self_employed',41),
('10003','Zeynep Yıldız','Mass','student',19);

INSERT INTO financials VALUES
('10001', 42000,  5000, 680),
('10002', 95000, 12000, 720),
('10003',  6000,  1500, 510);
