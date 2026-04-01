import db from './connection';

export function initializeDatabase(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      bank TEXT NOT NULL,
      account_number TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      color TEXT DEFAULT '#6b7280',
      icon TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER NOT NULL REFERENCES accounts(id),
      date TEXT NOT NULL,
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      balance_after REAL,
      type TEXT,
      counterparty TEXT,
      import_hash TEXT UNIQUE,
      category_id INTEGER REFERENCES categories(id),
      is_split INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category_id INTEGER REFERENCES categories(id),
      last_price REAL,
      times_purchased INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS transaction_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transaction_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      category_id INTEGER REFERENCES categories(id),
      product_id INTEGER REFERENCES products(id),
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS receipts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transaction_id INTEGER REFERENCES transactions(id),
      store_name TEXT,
      receipt_date TEXT,
      total_amount REAL,
      source_filename TEXT,
      raw_data TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS receipt_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      receipt_id INTEGER NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      quantity REAL DEFAULT 1,
      unit_price REAL,
      amount REAL NOT NULL,
      product_id INTEGER REFERENCES products(id),
      category_id INTEGER REFERENCES categories(id),
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS imports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER REFERENCES accounts(id),
      type TEXT DEFAULT 'csv',
      filename TEXT NOT NULL,
      rows_imported INTEGER DEFAULT 0,
      rows_skipped INTEGER DEFAULT 0,
      imported_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions(account_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
    CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_hash ON transactions(import_hash);
    CREATE INDEX IF NOT EXISTS idx_transaction_items_transaction ON transaction_items(transaction_id);
    CREATE INDEX IF NOT EXISTS idx_receipt_items_receipt ON receipt_items(receipt_id);
    CREATE INDEX IF NOT EXISTS idx_receipts_transaction ON receipts(transaction_id);
  `);

  // Seed default categories
  const count = db.prepare('SELECT COUNT(*) as cnt FROM categories').get() as { cnt: number };
  if (count.cnt === 0) {
    const insert = db.prepare('INSERT INTO categories (name, color) VALUES (?, ?)');
    const defaults = [
      ['Jedzenie', '#22c55e'],
      ['Opłaty', '#ef4444'],
      ['Zdrowie', '#3b82f6'],
      ['Transport', '#f59e0b'],
      ['Rozrywka', '#a855f7'],
      ['Ubrania', '#ec4899'],
      ['Dom', '#14b8a6'],
      ['Inne', '#6b7280'],
    ];
    const insertMany = db.transaction(() => {
      for (const [name, color] of defaults) {
        insert.run(name, color);
      }
    });
    insertMany();
  }
}
