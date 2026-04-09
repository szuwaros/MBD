import { Router } from 'express';
import multer from 'multer';
import crypto from 'crypto';
import db from '../db/connection';
import { getParser } from '../parsers';
import { parseReceiptJson, ParsedReceipt } from '../parsers/receipt';
import { parseReceiptImage } from '../parsers/receipt-ocr';
import { detectPdfBank, parseAliorPdf, parseBnpParibasPdf } from '../parsers/pdf-bank';
import iconv from 'iconv-lite';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

function generateHash(accountNumber: string, date: string, amount: number, description: string): string {
  const normalized = `${accountNumber}|${date}|${amount.toFixed(2)}|${description.trim().toLowerCase()}`;
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

function decodeBuffer(buffer: Buffer): string {
  const utf8 = buffer.toString('utf-8');
  const content = utf8.charCodeAt(0) === 0xFEFF ? utf8.slice(1) : utf8;
  if (content.includes('\ufffd') || (!content.includes('ą') && !content.includes('ę') && content.length > 200)) {
    try {
      return iconv.decode(buffer, 'win1250');
    } catch {
      return content;
    }
  }
  return content;
}

router.post('/csv', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Plik jest wymagany' });

  const bankId = req.body.bank;
  if (!bankId) return res.status(400).json({ error: 'Format banku jest wymagany' });

  const parser = getParser(bankId);
  if (!parser) return res.status(400).json({ error: `Brak parsera dla banku: ${bankId}` });

  const content = decodeBuffer(req.file.buffer);
  const parsed = parser.parse(content);

  if (parsed.length === 0) {
    return res.status(400).json({ error: 'Nie znaleziono transakcji w pliku. Sprawdz format CSV.' });
  }

  let imported = 0;
  let skipped = 0;
  const skippedDetails: { date: string; amount: number; description: string; reason: string }[] = [];
  const accountsCreated = new Set<string>();

  const findAccountByNumber = db.prepare('SELECT id FROM accounts WHERE account_number = ?');
  const insertAccountStmt = db.prepare('INSERT INTO accounts (name, bank, account_number) VALUES (?, ?, ?)');

  function resolveAccountId(accountNumber: string | undefined): number | null {
    if (!accountNumber) return null;
    const existing = findAccountByNumber.get(accountNumber) as { id: number } | undefined;
    if (existing) return existing.id;
    const result = insertAccountStmt.run(accountNumber, bankId, accountNumber);
    return Number(result.lastInsertRowid);
  }

  const insertTx = db.prepare(`
    INSERT OR IGNORE INTO transactions (account_id, date, description, amount, balance_after, type, counterparty, source_account, dest_account, import_hash, category_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const findCategory = db.prepare('SELECT id FROM categories WHERE name = ?');
  const insertCategory = db.prepare('INSERT INTO categories (name) VALUES (?)');

  function resolveCategoryId(name?: string): number | null {
    if (!name) return null;
    const existing = findCategory.get(name) as { id: number } | undefined;
    if (existing) return existing.id;
    const result = insertCategory.run(name);
    return Number(result.lastInsertRowid);
  }

  const importTransactions = db.transaction(() => {
    for (const tx of parsed) {
      // Determine the user's account from the transaction:
      // Expense (amount < 0): source_account is the user's account
      // Income (amount >= 0): dest_account is the user's account
      const userAccountNumber = tx.amount < 0 ? tx.sourceAccount : tx.destAccount;
      const accountId = resolveAccountId(userAccountNumber);

      if (!accountId) {
        skipped++;
        skippedDetails.push({ date: tx.date, amount: tx.amount, description: tx.description, reason: 'brak konta' });
        continue;
      }

      if (userAccountNumber) accountsCreated.add(userAccountNumber);

      const hash = generateHash(userAccountNumber || '', tx.date, tx.amount, tx.description);
      const categoryId = resolveCategoryId(tx.category);
      const result = insertTx.run(
        accountId, tx.date, tx.description, tx.amount, tx.balanceAfter ?? null,
        tx.type ?? null, tx.counterparty ?? null,
        tx.sourceAccount ?? null, tx.destAccount ?? null,
        hash, categoryId
      );
      if (result.changes > 0) {
        imported++;
      } else {
        skipped++;
        skippedDetails.push({ date: tx.date, amount: tx.amount, description: tx.description, reason: 'duplikat' });
      }
    }

    db.prepare('INSERT INTO imports (type, filename, rows_imported, rows_skipped) VALUES (?, ?, ?, ?)')
      .run('csv', req.file!.originalname, imported, skipped);
  });

  importTransactions();

  res.json({
    imported,
    skipped,
    skippedDetails: skippedDetails.length > 0 ? skippedDetails : undefined,
    total: parsed.length,
    filename: req.file.originalname,
    accounts_found: accountsCreated.size,
  });
});

// PDF bank statement import
router.post('/pdf', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Plik jest wymagany' });

  let pdfText: string;
  try {
    const pdfParse = require('pdf-parse');
    const data = await pdfParse(req.file.buffer);
    pdfText = data.text;
  } catch (e: any) {
    return res.status(400).json({ error: 'Nie udało się odczytać PDF: ' + e.message });
  }

  const bankId = req.body.bank || detectPdfBank(pdfText);
  if (!bankId) {
    return res.status(400).json({ error: 'Nie rozpoznano banku. Wybierz format ręcznie.', detectedText: pdfText.substring(0, 500) });
  }

  let parsed: { transactions: any[]; accountNumber: string | null };
  switch (bankId) {
    case 'alior': parsed = parseAliorPdf(pdfText); break;
    case 'bnpparibas': parsed = parseBnpParibasPdf(pdfText); break;
    default:
      return res.status(400).json({ error: `Brak parsera PDF dla banku: ${bankId}` });
  }

  if (parsed.transactions.length === 0) {
    return res.status(400).json({ error: 'Nie znaleziono transakcji w PDF.', rawText: pdfText.substring(0, 2000) });
  }

  let imported = 0;
  let skipped = 0;
  const skippedDetails: { date: string; amount: number; description: string; reason: string }[] = [];

  const findAccountByNumber = db.prepare('SELECT id FROM accounts WHERE account_number = ?');
  const insertAccountStmt = db.prepare('INSERT INTO accounts (name, bank, account_number, account_type) VALUES (?, ?, ?, ?)');

  function resolveAccountId(accountNumber: string | undefined): number | null {
    if (!accountNumber) return null;
    const existing = findAccountByNumber.get(accountNumber) as { id: number } | undefined;
    if (existing) return existing.id;
    const result = insertAccountStmt.run(accountNumber, bankId, accountNumber, 'bank');
    return Number(result.lastInsertRowid);
  }

  const insertTx = db.prepare(`
    INSERT OR IGNORE INTO transactions (account_id, date, description, amount, balance_after, type, counterparty, source_account, dest_account, import_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const importTransactions = db.transaction(() => {
    for (const tx of parsed.transactions) {
      const userAccountNumber = tx.amount < 0 ? tx.sourceAccount : tx.destAccount;
      const accountId = resolveAccountId(userAccountNumber || parsed.accountNumber || undefined);

      if (!accountId) {
        skipped++;
        skippedDetails.push({ date: tx.date, amount: tx.amount, description: tx.description, reason: 'brak konta' });
        continue;
      }

      const hash = generateHash(userAccountNumber || parsed.accountNumber || '', tx.date, tx.amount, tx.description);
      const result = insertTx.run(
        accountId, tx.date, tx.description, tx.amount, tx.balanceAfter ?? null,
        tx.type ?? null, tx.counterparty ?? null,
        tx.sourceAccount ?? null, tx.destAccount ?? null, hash
      );
      if (result.changes > 0) imported++;
      else {
        skipped++;
        skippedDetails.push({ date: tx.date, amount: tx.amount, description: tx.description, reason: 'duplikat' });
      }
    }

    db.prepare('INSERT INTO imports (type, filename, rows_imported, rows_skipped) VALUES (?, ?, ?, ?)')
      .run('pdf', req.file!.originalname, imported, skipped);
  });

  importTransactions();

  res.json({
    imported,
    skipped,
    skippedDetails: skippedDetails.length > 0 ? skippedDetails : undefined,
    total: parsed.transactions.length,
    filename: req.file!.originalname,
    bank: bankId,
  });
});

router.post('/receipt', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Plik jest wymagany' });

  let receipt: ParsedReceipt;
  try {
    const content = req.file.buffer.toString('utf-8');
    receipt = parseReceiptJson(content);
  } catch {
    return res.status(400).json({ error: 'Nie udalo sie sparsowac e-paragonu. Oczekiwany format: JSON' });
  }

  const importReceipt = db.transaction(() => {
    const result = db.prepare(`
      INSERT INTO receipts (store_name, receipt_date, total_amount, source_filename, raw_data)
      VALUES (?, ?, ?, ?, ?)
    `).run(receipt.storeName, receipt.receiptDate, receipt.totalAmount, req.file!.originalname, receipt.rawData);

    const receiptId = result.lastInsertRowid;

    const insertItem = db.prepare('INSERT INTO receipt_items (receipt_id, name, quantity, unit_price, amount) VALUES (?, ?, ?, ?, ?)');
    const findProduct = db.prepare('SELECT id, category_id FROM products WHERE name = ?');
    const insertProduct = db.prepare('INSERT INTO products (name, last_price) VALUES (?, ?)');
    const updateProduct = db.prepare('UPDATE products SET last_price = ?, times_purchased = times_purchased + 1, updated_at = datetime(\'now\') WHERE id = ?');

    for (const item of receipt.items) {
      let existing = findProduct.get(item.name) as { id: number; category_id: number | null } | undefined;
      let productId: number;

      if (existing) {
        productId = existing.id;
        updateProduct.run(item.unitPrice, productId);
      } else {
        const r = insertProduct.run(item.name, item.unitPrice);
        productId = Number(r.lastInsertRowid);
        existing = { id: productId, category_id: null };
      }

      insertItem.run(receiptId, item.name, item.quantity, item.unitPrice, item.amount);

      db.prepare('UPDATE receipt_items SET product_id = ?, category_id = ? WHERE receipt_id = ? AND name = ?')
        .run(productId, existing.category_id, receiptId, item.name);
    }

    const matchedTx = db.prepare(`
      SELECT id FROM transactions
      WHERE ABS(amount + ?) < 0.02
        AND date BETWEEN date(?, '-1 day') AND date(?, '+1 day')
      ORDER BY ABS(julianday(date) - julianday(?))
      LIMIT 1
    `).get(receipt.totalAmount, receipt.receiptDate, receipt.receiptDate, receipt.receiptDate) as { id: number } | undefined;

    if (matchedTx) {
      db.prepare('UPDATE receipts SET transaction_id = ? WHERE id = ?').run(matchedTx.id, receiptId);
    }

    db.prepare('INSERT INTO imports (type, filename, rows_imported) VALUES (?, ?, ?)')
      .run('receipt', req.file!.originalname, receipt.items.length);

    return { receiptId: Number(receiptId), matchedTransactionId: matchedTx?.id || null, itemCount: receipt.items.length };
  });

  const result = importReceipt();
  res.json(result);
});

router.post('/receipt-scan', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Plik jest wymagany' });

  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowedTypes.includes(req.file.mimetype)) {
    return res.status(400).json({ error: 'Dozwolone formaty: JPG, PNG, WebP' });
  }

  let ocrResult;
  try {
    ocrResult = parseReceiptImage(req.file.buffer, req.file.mimetype);
  } catch (err: any) {
    return res.status(500).json({ error: `Blad OCR: ${err.message}` });
  }

  if (ocrResult.items.length === 0) {
    return res.json({
      storeName: ocrResult.storeName,
      receiptDate: ocrResult.receiptDate,
      totalAmount: ocrResult.totalAmount,
      items: [],
      rawText: ocrResult.rawText,
      warning: 'Nie udalo sie wykryc produktow. Sprawdz jakosc zdjecia.',
    });
  }

  // Save to database
  const findCategory = db.prepare('SELECT id FROM categories WHERE name = ?');
  const insertCategory = db.prepare('INSERT INTO categories (name) VALUES (?)');

  function resolveCategoryId(name: string): number | null {
    const existing = findCategory.get(name) as { id: number } | undefined;
    if (existing) return existing.id;
    try {
      const result = insertCategory.run(name);
      return Number(result.lastInsertRowid);
    } catch {
      // Category might already exist (race condition)
      const retry = findCategory.get(name) as { id: number } | undefined;
      return retry?.id ?? null;
    }
  }

  const importScan = db.transaction(() => {
    const result = db.prepare(`
      INSERT INTO receipts (store_name, receipt_date, total_amount, source_filename, raw_data)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      ocrResult.storeName, ocrResult.receiptDate, ocrResult.totalAmount,
      req.file!.originalname, ocrResult.rawText
    );

    const receiptId = result.lastInsertRowid;

    const insertItem = db.prepare(
      'INSERT INTO receipt_items (receipt_id, name, quantity, unit_price, amount, category_id) VALUES (?, ?, ?, ?, ?, ?)'
    );
    const findProduct = db.prepare('SELECT id FROM products WHERE name = ?');
    const insertProduct = db.prepare('INSERT INTO products (name, category_id, last_price) VALUES (?, ?, ?)');
    const updateProduct = db.prepare(
      "UPDATE products SET last_price = ?, times_purchased = times_purchased + 1, updated_at = datetime('now') WHERE id = ?"
    );

    const findProductFull = db.prepare('SELECT id, category_id FROM products WHERE name = ?');

    for (const item of ocrResult.items) {
      let productId: number;
      let categoryId: number | null = null;

      // Category from known product (user-assigned), or null for new products
      const existing = findProductFull.get(item.name) as { id: number; category_id: number | null } | undefined;
      if (existing) {
        productId = existing.id;
        categoryId = existing.category_id;
        updateProduct.run(item.amount, productId);
      } else {
        const r = insertProduct.run(item.name, null, item.amount);
        productId = Number(r.lastInsertRowid);
      }

      insertItem.run(receiptId, item.name, item.quantity, item.unitPrice, item.amount, categoryId);

      db.prepare('UPDATE receipt_items SET product_id = ? WHERE receipt_id = ? AND name = ?')
        .run(productId, receiptId, item.name);
    }

    // Auto-match with transaction
    if (ocrResult.totalAmount && ocrResult.receiptDate) {
      const matchedTx = db.prepare(`
        SELECT id FROM transactions
        WHERE ABS(amount + ?) < 0.5
          AND date BETWEEN date(?, '-2 day') AND date(?, '+2 day')
        ORDER BY ABS(amount + ?) ASC, ABS(julianday(date) - julianday(?))
        LIMIT 1
      `).get(
        ocrResult.totalAmount, ocrResult.receiptDate, ocrResult.receiptDate,
        ocrResult.totalAmount, ocrResult.receiptDate
      ) as { id: number } | undefined;

      if (matchedTx) {
        db.prepare('UPDATE receipts SET transaction_id = ? WHERE id = ?').run(matchedTx.id, receiptId);
        // Copy receipt items to transaction items and mark as split
        const rItems = db.prepare('SELECT * FROM receipt_items WHERE receipt_id = ?').all(receiptId) as any[];
        db.prepare('DELETE FROM transaction_items WHERE transaction_id = ?').run(matchedTx.id);
        const insTxItem = db.prepare('INSERT INTO transaction_items (transaction_id, description, amount, category_id, product_id) VALUES (?, ?, ?, ?, ?)');
        for (const ri of rItems) {
          insTxItem.run(matchedTx.id, ri.name, -Math.abs(ri.amount), ri.category_id, ri.product_id);
        }
        db.prepare('UPDATE transactions SET is_split = 1, category_id = NULL WHERE id = ?').run(matchedTx.id);
      }
    }

    db.prepare('INSERT INTO imports (type, filename, rows_imported) VALUES (?, ?, ?)')
      .run('receipt-scan', req.file!.originalname, ocrResult.items.length);

    return Number(receiptId);
  });

  const receiptId = importScan();

  res.json({
    receiptId,
    storeName: ocrResult.storeName,
    receiptDate: ocrResult.receiptDate,
    totalAmount: ocrResult.totalAmount,
    items: ocrResult.items,
    rawText: ocrResult.rawText,
  });
});

router.get('/', (_req, res) => {
  const imports = db.prepare(`
    SELECT i.*
    FROM imports i
    ORDER BY i.imported_at DESC
  `).all();
  res.json(imports);
});

export default router;
