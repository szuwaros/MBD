import { Router } from 'express';
import db from '../db/connection';

const router = Router();

router.get('/', (_req, res) => {
  const accounts = db.prepare(`
    SELECT a.*,
      (SELECT t.balance_after FROM transactions t WHERE t.account_id = a.id ORDER BY t.date DESC, t.id DESC LIMIT 1) as current_balance,
      (SELECT COUNT(*) FROM transactions t WHERE t.account_id = a.id) as transaction_count
    FROM accounts a ORDER BY a.name
  `).all();
  res.json(accounts);
});

router.post('/', (req, res) => {
  const { name, bank, account_number } = req.body;
  if (!name || !bank) {
    return res.status(400).json({ error: 'Nazwa i bank są wymagane' });
  }
  const result = db.prepare('INSERT INTO accounts (name, bank, account_number) VALUES (?, ?, ?)').run(name, bank, account_number || null);
  const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(account);
});

router.delete('/:id', (req, res) => {
  const { id } = req.params;
  const txCount = db.prepare('SELECT COUNT(*) as cnt FROM transactions WHERE account_id = ?').get(id) as { cnt: number };
  if (txCount.cnt > 0) {
    return res.status(400).json({ error: 'Nie można usunąć konta z transakcjami' });
  }
  db.prepare('DELETE FROM accounts WHERE id = ?').run(id);
  res.json({ ok: true });
});

export default router;
