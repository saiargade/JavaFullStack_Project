-- D1 Initial Migration for PashuFeed Pro Demo
-- SQLite-compatible syntax for Cloudflare D1

CREATE TABLE IF NOT EXISTS visits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ip TEXT NOT NULL,
    path TEXT NOT NULL,
    user_agent TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now'))
);

CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    brand TEXT,
    category TEXT,
    price INTEGER NOT NULL DEFAULT 0,
    stock INTEGER NOT NULL DEFAULT 0
);

-- Insert some demo products
INSERT OR IGNORE INTO products (name, brand, category, price, stock) VALUES 
('Premium Cattle Feed', 'PashuFeed', 'Cattle', 2000, 50),
('Goat Nutrition Mix', 'PashuFeed', 'Goat', 800, 100),
('Poultry Supplement', 'PashuFeed', 'Poultry', 500, 200),
('Mineral Block', 'PashuFeed', 'Mineral', 150, 300);

CREATE TABLE IF NOT EXISTS khata_ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    outstanding INTEGER NOT NULL DEFAULT 0,
    records INTEGER NOT NULL DEFAULT 0
);

-- Insert demo khata data
INSERT OR IGNORE INTO khata_ledger (outstanding, records) VALUES (0, 0);