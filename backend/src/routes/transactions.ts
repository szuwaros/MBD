import { Router } from 'express';
import db from '../db/connection';

const router = Router();

router.get('/', (req, res) => {
  const { account_id, from, to, category_id, search, limit = '50', offset = '0' } = req.query;

  let where = 'WHERE 1=1';
  const params: any[] = [];

  if (account_id) { where += ' AND t.account_id = ?'; params.push(account_id); }
  if (from) { where += ' AND t.date >= ?'; params.push(from); }
  if (to) { where += ' AND t.date <= ?'; params.push(to); }
  if (category_id) { where += ' AND (t.category_id = ? OR t.id IN (SELECT transaction_id FROM transaction_items WHERE category_id = ?))'; params.push(category_id, category_id); }
  if (search) { where += ' AND (t.description LIKE ? OR t.counterparty LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }

  const countResult = db.prepare(`SELECT COUNT(*) as total FROM transactions t ${where}`).get(...params) as { total: number };

  const transactions = db.prepare(`
    SELECT t.*, a.name as account_name, a.bank as account_bank, c.name as category_name, c.color as category_color
    FROM transactions t
    LEFT JOIN accounts a ON a.id = t.account_id
    LEFT JOIN categories c ON c.id = t.category_id
    ${where}
    ORDER BY t.date DESC, t.id DESC
    LIMIT ? OFFSET ?
  `).all(...params, Number(limit), Number(offset));

  res.json({ data: transactions, total: countResult.total });
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
  const { category_id } = req.body;
  db.prepare('UPDATE transactions SET category_id = ? WHERE id = ?').run(category_id, id);
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

router.delete('/:id/split', (req, res) => {
  const { id } = req.params;
  db.prepare('DELETE FROM transaction_items WHERE transaction_id = ?').run(id);
  db.prepare('UPDATE transactions SET is_split = 0 WHERE id = ?').run(id);
  const transaction = db.prepare('SELECT * FROM transactions WHERE id = ?').get(id);
  res.json(transaction);
});

export default router;
