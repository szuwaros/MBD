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
      cat_type TEXT DEFAULT 'expense',
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
      source_account TEXT,
      dest_account TEXT,
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

  // Migrate: add source_account and dest_account columns if missing
  const txCols = db.prepare("PRAGMA table_info(transactions)").all() as { name: string }[];
  const txColNames = txCols.map(c => c.name);
  if (!txColNames.includes('source_account')) {
    db.exec('ALTER TABLE transactions ADD COLUMN source_account TEXT');
  }
  if (!txColNames.includes('dest_account')) {
    db.exec('ALTER TABLE transactions ADD COLUMN dest_account TEXT');
  }

  // Migrate: add cat_type to categories if missing
  const catCols = db.prepare("PRAGMA table_info(categories)").all() as { name: string }[];
  const catColNames = catCols.map(c => c.name);
  if (!catColNames.includes('cat_type')) {
    db.exec("ALTER TABLE categories ADD COLUMN cat_type TEXT DEFAULT 'expense'");
    const incomeNames = ['Wynagrodzenie'];
    const transferNames = ['Przelew wewnętrzny'];
    for (const name of incomeNames) {
      db.prepare("UPDATE categories SET cat_type = 'income' WHERE name = ?").run(name);
    }
    for (const name of transferNames) {
      db.prepare("UPDATE categories SET cat_type = 'transfer' WHERE name = ?").run(name);
    }
  }

  // Migrate: add group_name to categories
  if (!catColNames.includes('group_name')) {
    db.exec("ALTER TABLE categories ADD COLUMN group_name TEXT");
  }
  // Always fill in missing group_name based on keyword matching
  const ungrouped = db.prepare("SELECT id, name, cat_type FROM categories WHERE group_name IS NULL").all() as any[];
  if (ungrouped.length > 0) {
    const groupRules: [RegExp, string][] = [
      // Wydatki bieżące
      [/spożyw|chemia|higiena|alkohol|kosmetyk|zwierzęta|fotograf|zakupy.*internet|prezent|upomink|gazet|czasopis|multimedia/i, 'Wydatki bieżące'],
      // Transport
      [/paliwo|transport|myjnia|przeglad|napraw|części|akcesoria|taxi|bilet.*lotn/i, 'Transport'],
      // Dom i mieszkanie
      [/czynsz|wynajem|hipotecz|remont|wyposażen|ogród|agd|rtv|prąd|gaz|woda/i, 'Dom i mieszkanie'],
      // Rachunki i opłaty
      [/opłat|internet.*tv.*tel|telewizj|stream|ubezpiecz|podatk/i, 'Rachunki i opłaty'],
      // Zdrowie
      [/lek[ai]|apteka|wizyt.*lekars|stomatolog|okulist|zdrowie|opieka med|akcesoria med/i, 'Zdrowie'],
      // Rozrywka i wypoczynek
      [/restaurac|kawiar|kino|teatr|koncert|sport|fitness|hobby|wakacj|podróż|hotel|noclegi|rozrywk|pub|klub/i, 'Rozrywka i wypoczynek'],
      // Edukacja
      [/szkoł|przedszkol|kurs|szkoleni|książk|materiał|edukacj|czesne/i, 'Edukacja'],
      // Dzieci
      [/dziec|zabawk|artykuły szkoln/i, 'Dzieci'],
      // Odzież i obuwie
      [/odzież|obuwie|ubrani|dodatki.*akcesor/i, 'Odzież i obuwie'],
      // Finanse
      [/kredyt|pożyczk|oszczędn|inwestycj|opłaty bank|przelew|bankoma|spłata/i, 'Finanse'],
      // Przychody (by cat_type)
      [/wynagrodzen|premi|nagrod|emeryt|rent|odsetk|zwrot|sprzedaż/i, 'Przychody'],
      // Uroda
      [/uroda|fryzjer|kosmetyczk/i, 'Wydatki bieżące'],
    ];
    const updateGroup = db.prepare('UPDATE categories SET group_name = ? WHERE id = ?');
    for (const cat of ungrouped) {
      let assigned = false;
      if (cat.cat_type === 'income') {
        updateGroup.run('Przychody', cat.id);
        assigned = true;
      } else if (cat.cat_type === 'transfer') {
        updateGroup.run('Finanse', cat.id);
        assigned = true;
      }
      if (!assigned) {
        for (const [re, group] of groupRules) {
          if (re.test(cat.name)) {
            updateGroup.run(group, cat.id);
            assigned = true;
            break;
          }
        }
      }
      if (!assigned) {
        updateGroup.run('Inne', cat.id);
      }
    }
  }

  // Migrate: change UNIQUE(name) to UNIQUE(name, group_name) so each group can have "Inne"
  const idxInfo = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='categories'").get() as { sql: string };
  if (idxInfo.sql.includes('name TEXT NOT NULL UNIQUE')) {
    // Clean up partial migration if exists
    try { db.exec('DROP TABLE IF EXISTS categories_new'); } catch {}
    db.exec(`
      CREATE TABLE categories_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        color TEXT DEFAULT '#6b7280',
        icon TEXT,
        cat_type TEXT DEFAULT 'expense',
        group_name TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        UNIQUE(name, group_name)
      );
      INSERT INTO categories_new (id, name, color, icon, cat_type, group_name, created_at)
        SELECT id, name, color, icon, cat_type, group_name, created_at FROM categories;
      DROP TABLE categories;
      ALTER TABLE categories_new RENAME TO categories;
    `);
  } else {
    // Clean up leftover temp table from partial migration
    try { db.exec('DROP TABLE IF EXISTS categories_new'); } catch {}
  }

  // Ensure each group has an "Inne" category
  const allGroups = db.prepare("SELECT DISTINCT group_name FROM categories WHERE group_name IS NOT NULL AND group_name != 'Inne' AND group_name != 'Przychody'").all() as { group_name: string }[];
  const insertInne = db.prepare("INSERT OR IGNORE INTO categories (name, color, cat_type, group_name) VALUES ('Inne', '#9ca3af', 'expense', ?)");
  for (const { group_name } of allGroups) {
    insertInne.run(group_name);
  }
  // "Inne przychody" for Przychody group
  db.exec("INSERT OR IGNORE INTO categories (name, color, cat_type, group_name) VALUES ('Inne przychody', '#a7f3d0', 'income', 'Przychody')");

  // Migrate: add account_type, initial_balance to accounts
  const accCols = db.prepare("PRAGMA table_info(accounts)").all() as { name: string }[];
  const accColNames = accCols.map(c => c.name);
  if (!accColNames.includes('account_type')) {
    db.exec("ALTER TABLE accounts ADD COLUMN account_type TEXT DEFAULT 'bank'");
  }
  if (!accColNames.includes('initial_balance')) {
    db.exec("ALTER TABLE accounts ADD COLUMN initial_balance REAL DEFAULT 0");
    db.exec("ALTER TABLE accounts ADD COLUMN initial_balance_date TEXT");
  }

  // Migrate: add sort_order to categories
  const catColsSort = db.prepare("PRAGMA table_info(categories)").all() as { name: string }[];
  if (!catColsSort.map(c => c.name).includes('sort_order')) {
    db.exec("ALTER TABLE categories ADD COLUMN sort_order INTEGER DEFAULT 0");
    // Initialize sort_order: groups by current alpha order, "Inne" last within each group
    const groups = db.prepare("SELECT DISTINCT group_name FROM categories WHERE group_name IS NOT NULL ORDER BY group_name").all() as { group_name: string }[];
    const updateOrder = db.prepare("UPDATE categories SET sort_order = ? WHERE id = ?");
    let groupIdx = 0;
    for (const { group_name } of groups) {
      const cats = db.prepare("SELECT id, name FROM categories WHERE group_name = ? ORDER BY name").all(group_name) as { id: number; name: string }[];
      let catIdx = 0;
      for (const cat of cats) {
        // "Inne" goes to end (sort_order 999 within group)
        const order = cat.name === 'Inne' || cat.name === 'Inne przychody' ? groupIdx * 1000 + 999 : groupIdx * 1000 + catIdx;
        updateOrder.run(order, cat.id);
        catIdx++;
      }
      groupIdx++;
    }
  }

  // Migrate: add note to transactions and items
  const txColsRefresh = db.prepare("PRAGMA table_info(transactions)").all() as { name: string }[];
  if (!txColsRefresh.map(c => c.name).includes('note')) {
    db.exec("ALTER TABLE transactions ADD COLUMN note TEXT");
    db.exec("ALTER TABLE transaction_items ADD COLUMN note TEXT");
    db.exec("ALTER TABLE receipt_items ADD COLUMN note TEXT");
  }

  // Seed default categories
  const count = db.prepare('SELECT COUNT(*) as cnt FROM categories').get() as { cnt: number };
  if (count.cnt === 0) {
    const insert = db.prepare('INSERT INTO categories (name, color, cat_type, group_name) VALUES (?, ?, ?, ?)');
    // [name, color, cat_type, group_name]
    const defaults: [string, string, string, string][] = [
      // Wydatki bieżące
      ['Artykuły spożywcze', '#22c55e', 'expense', 'Wydatki bieżące'],
      ['Chemia i środki czystości', '#84cc16', 'expense', 'Wydatki bieżące'],
      ['Alkohol', '#a3e635', 'expense', 'Wydatki bieżące'],
      ['Kosmetyki', '#e879f9', 'expense', 'Wydatki bieżące'],
      ['Uroda, fryzjer, kosmetyczka', '#f0abfc', 'expense', 'Wydatki bieżące'],
      ['Zwierzęta domowe', '#fb923c', 'expense', 'Wydatki bieżące'],
      ['Zakupy przez internet', '#8b5cf6', 'expense', 'Wydatki bieżące'],
      ['Prezenty, upominki', '#f472b6', 'expense', 'Wydatki bieżące'],
      // Transport
      ['Paliwo', '#eab308', 'expense', 'Transport'],
      ['Transport publiczny', '#f59e0b', 'expense', 'Transport'],
      ['Myjnia, przeglądy i naprawy', '#fbbf24', 'expense', 'Transport'],
      ['Części i akcesoria', '#fcd34d', 'expense', 'Transport'],
      ['Taxi', '#fde68a', 'expense', 'Transport'],
      ['Bilety lotnicze', '#d97706', 'expense', 'Transport'],
      // Dom i mieszkanie
      ['Czynsz i wynajem', '#ef4444', 'expense', 'Dom i mieszkanie'],
      ['Kredyt hipoteczny', '#dc2626', 'expense', 'Dom i mieszkanie'],
      ['Remonty i wyposażenie', '#14b8a6', 'expense', 'Dom i mieszkanie'],
      ['AGD i RTV', '#06b6d4', 'expense', 'Dom i mieszkanie'],
      ['Ogród', '#4ade80', 'expense', 'Dom i mieszkanie'],
      // Rachunki i opłaty
      ['Prąd', '#f87171', 'expense', 'Rachunki i opłaty'],
      ['Gaz', '#fb923c', 'expense', 'Rachunki i opłaty'],
      ['Woda', '#38bdf8', 'expense', 'Rachunki i opłaty'],
      ['Internet i telefon', '#818cf8', 'expense', 'Rachunki i opłaty'],
      ['Telewizja i streaming', '#a78bfa', 'expense', 'Rachunki i opłaty'],
      ['Ubezpieczenia', '#c084fc', 'expense', 'Rachunki i opłaty'],
      // Zdrowie
      ['Leki i apteka', '#3b82f6', 'expense', 'Zdrowie'],
      ['Wizyty lekarskie', '#60a5fa', 'expense', 'Zdrowie'],
      ['Stomatolog', '#93c5fd', 'expense', 'Zdrowie'],
      // Rozrywka i wypoczynek
      ['Restauracje i kawiarnie', '#f97316', 'expense', 'Rozrywka i wypoczynek'],
      ['Kino, teatr, koncerty', '#a855f7', 'expense', 'Rozrywka i wypoczynek'],
      ['Sport i fitness', '#10b981', 'expense', 'Rozrywka i wypoczynek'],
      ['Hobby', '#6366f1', 'expense', 'Rozrywka i wypoczynek'],
      ['Wakacje i podróże', '#0ea5e9', 'expense', 'Rozrywka i wypoczynek'],
      ['Hotele i noclegi', '#0284c7', 'expense', 'Rozrywka i wypoczynek'],
      // Edukacja
      ['Szkoła i przedszkole', '#2563eb', 'expense', 'Edukacja'],
      ['Kursy i szkolenia', '#3b82f6', 'expense', 'Edukacja'],
      ['Książki i materiały', '#6b7280', 'expense', 'Edukacja'],
      // Dzieci
      ['Odzież dziecięca', '#ec4899', 'expense', 'Dzieci'],
      ['Zabawki', '#f472b6', 'expense', 'Dzieci'],
      ['Artykuły szkolne', '#fb7185', 'expense', 'Dzieci'],
      // Odzież i obuwie
      ['Odzież', '#ec4899', 'expense', 'Odzież i obuwie'],
      ['Obuwie', '#db2777', 'expense', 'Odzież i obuwie'],
      ['Dodatki i akcesoria', '#f9a8d4', 'expense', 'Odzież i obuwie'],
      // Finanse
      ['Spłata kredytów', '#dc2626', 'expense', 'Finanse'],
      ['Oszczędności i inwestycje', '#059669', 'expense', 'Finanse'],
      ['Opłaty bankowe', '#9ca3af', 'expense', 'Finanse'],
      // Inne per group
      ['Inne', '#9ca3af', 'expense', 'Wydatki bieżące'],
      ['Inne', '#9ca3af', 'expense', 'Transport'],
      ['Inne', '#9ca3af', 'expense', 'Dom i mieszkanie'],
      ['Inne', '#9ca3af', 'expense', 'Rachunki i opłaty'],
      ['Inne', '#9ca3af', 'expense', 'Zdrowie'],
      ['Inne', '#9ca3af', 'expense', 'Rozrywka i wypoczynek'],
      ['Inne', '#9ca3af', 'expense', 'Edukacja'],
      ['Inne', '#9ca3af', 'expense', 'Dzieci'],
      ['Inne', '#9ca3af', 'expense', 'Odzież i obuwie'],
      ['Inne', '#9ca3af', 'expense', 'Finanse'],
      // Przychody
      ['Wynagrodzenie', '#059669', 'income', 'Przychody'],
      ['Dodatkowe przychody', '#34d399', 'income', 'Przychody'],
      ['Zwroty', '#6ee7b7', 'income', 'Przychody'],
      ['Odsetki', '#a7f3d0', 'income', 'Przychody'],
      // Transfery
      ['Przelew wewnętrzny', '#6366f1', 'transfer', 'Finanse'],
    ];
    const insertMany = db.transaction(() => {
      for (const [name, color, catType, groupName] of defaults) {
        insert.run(name, color, catType, groupName);
      }
    });
    insertMany();
  }
}
