import { Router } from 'express';
import db from '../db/connection';

const router = Router();

router.get('/', (req, res) => {
  const { account_id, from, to, category_id, search, limit = '50', offset = '0', sort_by, sort_dir, amount_match, date_match, amount_min, amount_max } = req.query;

  let where = 'WHERE 1=1';
  const params: any[] = [];

  if (account_id) { where += ' AND t.account_id = ?'; params.push(account_id); }
  if (from) { where += ' AND t.date >= ?'; params.push(from); }
  if (to) { where += ' AND t.date <= ?'; params.push(to); }
  if (category_id) { where += ' AND (t.category_id = ? OR t.id IN (SELECT transaction_id FROM transaction_items WHERE category_id = ?))'; params.push(category_id, category_id); }
  if (search) { where += ' AND (t.description LIKE ? OR t.counterparty LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
  // Receipt matching: find transactions close to receipt amount and date
  if (amount_match) { where += ' AND ABS(t.amount + ?) < 1.0'; params.push(Number(amount_match)); }
  if (date_match) { where += " AND t.date BETWEEN date(?, '-3 day') AND date(?, '+3 day')"; params.push(date_match, date_match); }
  if (amount_min) { where += ' AND t.amount >= ?'; params.push(Number(amount_min)); }
  if (amount_max) { where += ' AND t.amount <= ?'; params.push(Number(amount_max)); }

  const countResult = db.prepare(`SELECT COUNT(*) as total FROM transactions t ${where}`).get(...params) as { total: number };

  const allowedSortCols: Record<string, string> = {
    date: 't.date', amount: 't.amount', counterparty: 't.counterparty',
    description: 't.description', type: 't.type', account_name: 'a.name',
    category_name: 'c.name', source_account: 't.source_account', dest_account: 't.dest_account',
  };
  const orderCol = allowedSortCols[sort_by as string] || 't.date';
  const orderDir = sort_dir === 'asc' ? 'ASC' : 'DESC';

  const transactions = db.prepare(`
    SELECT t.*, a.name as account_name, a.bank as account_bank, c.name as category_name, c.color as category_color
    FROM transactions t
    LEFT JOIN accounts a ON a.id = t.account_id
    LEFT JOIN categories c ON c.id = t.category_id
    ${where}
    ORDER BY ${orderCol} ${orderDir}, t.id DESC
    LIMIT ? OFFSET ?
  `).all(...params, Number(limit), Number(offset));

  // Batch-load items for split transactions
  const splitIds = (transactions as any[]).filter(t => t.is_split).map(t => t.id);
  const itemsByTx: Record<number, any[]> = {};
  if (splitIds.length > 0) {
    const placeholders = splitIds.map(() => '?').join(',');
    const items = db.prepare(`
      SELECT ti.*, c.name as category_name, c.color as category_color, p.name as product_name
      FROM transaction_items ti
      LEFT JOIN categories c ON c.id = ti.category_id
      LEFT JOIN products p ON p.id = ti.product_id
      WHERE ti.transaction_id IN (${placeholders})
      ORDER BY ti.id
    `).all(...splitIds) as any[];
    for (const item of items) {
      (itemsByTx[item.transaction_id] ||= []).push(item);
    }
  }

  // Batch-load receipt items for transactions with linked receipts (even if not split)
  const txIds = (transactions as any[]).map(t => t.id);
  const receiptItemsByTx: Record<number, any[]> = {};
  const receiptByTx: Record<number, any> = {};
  if (txIds.length > 0) {
    const placeholders = txIds.map(() => '?').join(',');
    const receipts = db.prepare(`
      SELECT r.id, r.transaction_id, r.store_name, r.receipt_date
      FROM receipts r
      WHERE r.transaction_id IN (${placeholders})
    `).all(...txIds) as any[];
    for (const r of receipts) {
      receiptByTx[r.transaction_id] = r;
    }
    const receiptIds = receipts.map(r => r.id);
    if (receiptIds.length > 0) {
      const rPlaceholders = receiptIds.map(() => '?').join(',');
      const rItems = db.prepare(`
        SELECT ri.*, c.name as category_name, c.color as category_color, p.name as product_name,
               r.transaction_id
        FROM receipt_items ri
        LEFT JOIN categories c ON c.id = ri.category_id
        LEFT JOIN products p ON p.id = ri.product_id
        JOIN receipts r ON r.id = ri.receipt_id
        WHERE ri.receipt_id IN (${rPlaceholders})
        ORDER BY ri.id
      `).all(...receiptIds) as any[];
      for (const item of rItems) {
        (receiptItemsByTx[item.transaction_id] ||= []).push(item);
      }
    }
  }

  const data = (transactions as any[]).map(t => ({
    ...t,
    items: t.is_split ? (itemsByTx[t.id] || []) : undefined,
    receipt_items: receiptItemsByTx[t.id] || undefined,
    receipt: receiptByTx[t.id] || undefined,
  }));

  res.json({ data, total: countResult.total });
});

router.get('/:id', (req, res) => {
  const { id } = req.params;
  const transaction = db.prepare(`
    SELECT t.*, a.name as account_name, a.bank as account_bank, c.name as category_name, c.color as category_color
    FROM transactions t
    LEFT JOIN accounts a ON a.id = t.account_id
    LEFT JOIN categories c ON c.id = t.category_id
    WHERE t.id = ?
  `).get(id);

  if (!transaction) return res.status(404).json({ error: 'Nie znaleziono transakcji' });

  const items = db.prepare(`
    SELECT ti.*, c.name as category_name, c.color as category_color, p.name as product_name
    FROM transaction_items ti
    LEFT JOIN categories c ON c.id = ti.category_id
    LEFT JOIN products p ON p.id = ti.product_id
    WHERE ti.transaction_id = ?
    ORDER BY ti.id
  `).all(id);

  res.json({ ...transaction, items });
});

router.put('/:id', (req, res) => {
  const { id } = req.params;
  const { category_id, note } = req.body;
  if (category_id !== undefined) db.prepare('UPDATE transactions SET category_id = ? WHERE id = ?').run(category_id, id);
  if (note !== undefined) db.prepare('UPDATE transactions SET note = ? WHERE id = ?').run(note || null, id);
  const transaction = db.prepare('SELECT * FROM transactions WHERE id = ?').get(id);
  res.json(transaction);
});

router.post('/:id/split', (req, res) => {
  const { id } = req.params;
  const { items } = req.body as { items: Array<{ description: string; amount: number; category_id?: number; product_name?: string }> };

  if (!items || items.length === 0) {
    return res.status(400).json({ error: 'Elementy są wymagane' });
  }

  const transaction = db.prepare('SELECT * FROM transactions WHERE id = ?').get(id) as any;
  if (!transaction) return res.status(404).json({ error: 'Nie znaleziono transakcji' });

  const splitTransaction = db.transaction(() => {
    // Remove existing items
    db.prepare('DELETE FROM transaction_items WHERE transaction_id = ?').run(id);

    const insertItem = db.prepare('INSERT INTO transaction_items (transaction_id, description, amount, category_id, product_id) VALUES (?, ?, ?, ?, ?)');
    const findProduct = db.prepare('SELECT id FROM products WHERE name = ?');
    const insertProduct = db.prepare('INSERT INTO products (name, category_id, last_price) VALUES (?, ?, ?)');
    const updateProduct = db.prepare('UPDATE products SET last_price = ?, times_purchased = times_purchased + 1, updated_at = datetime(\'now\'), category_id = COALESCE(?, category_id) WHERE id = ?');

    for (const item of items) {
      let productId: number | null = null;

      if (item.product_name) {
        const existing = findProduct.get(item.product_name) as { id: number } | undefined;
        if (existing) {
          productId = existing.id;
          updateProduct.run(Math.abs(item.amount), item.category_id || null, productId);
        } else {
          const result = insertProduct.run(item.product_name, item.category_id || null, Math.abs(item.amount));
          productId = Number(result.lastInsertRowid);
        }
      }

      insertItem.run(id, item.description, item.amount, item.category_id || null, productId);
    }

    db.prepare('UPDATE transactions SET is_split = 1, category_id = NULL WHERE id = ?').run(id);
  });

  splitTransaction();

  const updated = db.prepare('SELECT * FROM transactions WHERE id = ?').get(id) as Record<string, unknown>;
  const updatedItems = db.prepare('SELECT ti.*, c.name as category_name, c.color as category_color FROM transaction_items ti LEFT JOIN categories c ON c.id = ti.category_id WHERE ti.transaction_id = ?').all(id);
  res.json({ ...updated, items: updatedItems });
});

router.delete('/batch', (req, res) => {
  const { ids } = req.body as { ids: number[] };
  if (!ids || ids.length === 0) return res.status(400).json({ error: 'Brak ID do usunięcia' });

  const deleteBatch = db.transaction(() => {
    const deleteTxItems = db.prepare('DELETE FROM transaction_items WHERE transaction_id = ?');
    const deleteTx = db.prepare('DELETE FROM transactions WHERE id = ?');
    for (const id of ids) {
      deleteTxItems.run(id);
      deleteTx.run(id);
    }
  });

  deleteBatch();
  res.json({ deleted: ids.length });
});

// IMPORTANT: /:id/split must come BEFORE /:id to avoid being caught by the wildcard
router.delete('/:id/split', (req, res) => {
  const { id } = req.params;
  db.prepare('DELETE FROM transaction_items WHERE transaction_id = ?').run(id);
  db.prepare('UPDATE transactions SET is_split = 0 WHERE id = ?').run(id);
  const transaction = db.prepare('SELECT * FROM transactions WHERE id = ?').get(id);
  res.json(transaction);
});

router.delete('/:id', (req, res) => {
  const { id } = req.params;
  db.prepare('DELETE FROM transaction_items WHERE transaction_id = ?').run(id);
  db.prepare('DELETE FROM transactions WHERE id = ?').run(id);
  res.json({ ok: true });
});

export default router;
