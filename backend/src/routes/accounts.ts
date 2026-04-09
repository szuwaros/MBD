import { Router } from 'express';
import db from '../db/connection';

const router = Router();

router.get('/', (_req, res) => {
  const accounts = db.prepare(`
    SELECT a.*,
      (SELECT t.balance_after FROM transactions t WHERE t.account_id = a.id ORDER BY t.date DESC, t.id DESC LIMIT 1) as current_balance,
      (SELECT COUNT(*) FROM transactions t WHERE t.account_id = a.id) as transaction_count
    FROM accounts a ORDER BY a.account_type, a.name
  `).all();
  res.json(accounts);
});

router.post('/', (req, res) => {
  const { name, bank, account_number, account_type } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Nazwa jest wymagana' });
  }
  const type = account_type || 'bank';
  const bankVal = type === 'cash' ? 'cash' : (bank || 'other');
  const result = db.prepare('INSERT INTO accounts (name, bank, account_number, account_type) VALUES (?, ?, ?, ?)')
    .run(name, bankVal, account_number || null, type);
  const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(account);
});

router.put('/:id', (req, res) => {
  const { id } = req.params;
  const { name, bank, initial_balance, initial_balance_date } = req.body;
  db.prepare('UPDATE accounts SET name = COALESCE(?, name), bank = COALESCE(?, bank) WHERE id = ?')
    .run(name || null, bank || null, id);
  if (initial_balance !== undefined) db.prepare('UPDATE accounts SET initial_balance = ? WHERE id = ?').run(initial_balance, id);
  if (initial_balance_date !== undefined) db.prepare('UPDATE accounts SET initial_balance_date = ? WHERE id = ?').run(initial_balance_date || null, id);
  const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(id);
  res.json(account);
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
