-- the database of scenario 1 (sql.rofl); shop.db is built from it:
--   python3 -c "import sqlite3; c = sqlite3.connect('shop.db'); c.executescript(open('shop.sql').read())"
CREATE TABLE tenants (id TEXT PRIMARY KEY, parent TEXT, cap INTEGER);
CREATE TABLE orders (id TEXT PRIMARY KEY, tenant TEXT, amount INTEGER);
INSERT INTO tenants VALUES ('acme', NULL, 500), ('acme-east', 'acme', 200), ('acme-west', 'acme', 300), ('acme-east-1', 'acme-east', 100), ('globex', NULL, 1000);
INSERT INTO orders VALUES ('o1', 'acme', 450), ('o2', 'acme-east', 250), ('o3', 'acme-west', 120), ('o4', 'acme-east-1', 90), ('o5', 'acme-east-1', 130), ('o6', 'globex', 5000);
