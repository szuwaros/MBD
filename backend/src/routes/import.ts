import { Router } from 'express';
import multer from 'multer';
import crypto from 'crypto';
import db from '../db/connection';
import { getParser } from '../parsers';
import { parseReceiptJson, ParsedReceipt } from '../parsers/receipt';
import iconv from 'iconv-lite';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

function generateHash(accountId: number, date: string, amount: number, description: string): string {
  const normalized = `${accountId}|${date}|${amount.toFixed(2)}|${description.trim().toLowerCase()}`;
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

function decodeBuffer(buffer: Buffer): string {
  // Try UTF-8 first, then Windows-1250 (common for Polish bank exports)
  const utf8 = buffer.toString('utf-8');
  // Check for BOM
  const content = utf8.charCodeAt(0) === 0xFEFF ? utf8.slice(1) : utf8;
  // If it looks garbled (common Polish chars missing), try Windows-1250
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

  const accountId = Number(req.body.account_id);
  if (!accountId) return res.status(400).json({ error: 'Konto jest wymagane' });

  const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(accountId) as any;
  if (!account) return res.status(404).json({ error: 'Nie znaleziono konta' });

  const parser = getParser(account.bank);
  if (!parser) return res.status(400).json({ error: `Brak parsera dla banku: ${account.bank}` });

  const content = decodeBuffer(req.file.buffer);
  const parsed = parser.parse(content);

  if (parsed.length === 0) {
    return res.status(400).json({ error: 'Nie znaleziono transakcji w pliku. Sprawdź format CSV.' });
  }

  let imported = 0;
  let skipped = 0;

  const insertTx = db.prepare(`
    INSERT OR IGNORE INTO transactions (account_id, date, description, amount, balance_after, type, counterparty, import_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const importTransactions = db.transaction(() => {
    for (const tx of parsed) {
      const hash = generateHash(accountId, tx.date, tx.amount, tx.description);
      const result = insertTx.run(accountId, tx.date, tx.description, tx.amount, tx.balanceAfter ?? null, tx.type ?? null, tx.counterparty ?? null, hash);
      if (result.changes > 0) {
        imported++;
      } else {
        skipped++;
      }
    }

    db.prepare('INSERT INTO imports (account_id, type, filename, rows_imported, rows_skipped) VALUES (?, ?, ?, ?, ?)')
      .run(accountId, 'csv', req.file!.originalname, imported, skipped);
  });

  importTransactions();

  res.json({ imported, skipped, total: parsed.length, filename: req.file.originalname });
});

router.post('/receipt', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Plik jest wymagany' });

  let receipt: ParsedReceipt;
  try {
    const content = req.file.buffer.toString('utf-8');
    receipt = parseReceiptJson(content);
  } catch {
    return res.status(400).json({ error: 'Nie udało się sparsować e-paragonu. Oczekiwany format: JSON' });
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
      // Find or create product
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

      // Update receipt item with product reference
      db.prepare('UPDATE receipt_items SET product_id = ?, category_id = ? WHERE receipt_id = ? AND name = ?')
        .run(productId, existing.category_id, receiptId, item.name);
    }

    // Try to auto-match with a transaction
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

router.get('/', (_req, res) => {
  const imports = db.prepare(`
    SELECT i.*, a.name as account_name
    FROM imports i
    LEFT JOIN accounts a ON a.id = i.account_id
    ORDER BY i.imported_at DESC
  `).all();
  res.json(imports);
});

export default router;
