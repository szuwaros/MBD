import { Router } from 'express';
import db from '../db/connection';

const router = Router();

router.get('/', (_req, res) => {
  const receipts = db.prepare(`
    SELECT r.*, t.description as transaction_description, t.amount as transaction_amount
    FROM receipts r
    LEFT JOIN transactions t ON t.id = r.transaction_id
    ORDER BY r.created_at DESC
  `).all();
  res.json(receipts);
});

router.get('/:id', (req, res) => {
  const { id } = req.params;
  const receipt = db.prepare(`
    SELECT r.*, t.description as transaction_description, t.amount as transaction_amount
    FROM receipts r
    LEFT JOIN transactions t ON t.id = r.transaction_id
    WHERE r.id = ?
  `).get(id);

  if (!receipt) return res.status(404).json({ error: 'Nie znaleziono paragonu' });

  const items = db.prepare(`
    SELECT ri.*, p.name as product_name, c.name as category_name, c.color as category_color
    FROM receipt_items ri
    LEFT JOIN products p ON p.id = ri.product_id
    LEFT JOIN categories c ON c.id = ri.category_id
    WHERE ri.receipt_id = ?
    ORDER BY ri.id
  `).all(id);

  res.json({ ...(receipt as object), items });
});

router.post('/:id/match', (req, res) => {
  const { id } = req.params;
  const { transaction_id } = req.body;

  const receipt = db.prepare('SELECT * FROM receipts WHERE id = ?').get(id) as any;
  if (!receipt) return res.status(404).json({ error: 'Nie znaleziono paragonu' });

  const transaction = db.prepare('SELECT * FROM transactions WHERE id = ?').get(transaction_id) as any;
  if (!transaction) return res.status(404).json({ error: 'Nie znaleziono transakcji' });

  const matchReceipt = db.transaction(() => {
    db.prepare('UPDATE receipts SET transaction_id = ? WHERE id = ?').run(transaction_id, id);

    // Create transaction items from receipt items
    const receiptItems = db.prepare('SELECT * FROM receipt_items WHERE receipt_id = ?').all(id) as any[];

    db.prepare('DELETE FROM transaction_items WHERE transaction_id = ?').run(transaction_id);

    const insertItem = db.prepare('INSERT INTO transaction_items (transaction_id, description, amount, category_id, product_id) VALUES (?, ?, ?, ?, ?)');
    for (const item of receiptItems) {
      insertItem.run(transaction_id, item.name, -Math.abs(item.amount), item.category_id, item.product_id);
    }

    db.prepare('UPDATE transactions SET is_split = 1, category_id = NULL WHERE id = ?').run(transaction_id);
  });

  matchReceipt();
  res.json({ ok: true });
});

export default router;
