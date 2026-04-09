import { Router } from 'express';
import db from '../db/connection';

const router = Router();

router.get('/by-category', (req, res) => {
  const { from, to, account_id, exclude_transfers } = req.query;
  let where = 'WHERE t.amount < 0';
  const params: any[] = [];

  if (from) { where += ' AND t.date >= ?'; params.push(from); }
  if (to) { where += ' AND t.date <= ?'; params.push(to); }
  if (account_id) { where += ' AND t.account_id = ?'; params.push(account_id); }
  if (exclude_transfers !== '0') { where += " AND (c.cat_type IS NULL OR c.cat_type != 'transfer')"; }

  // Non-split transactions by category
  const direct = db.prepare(`
    SELECT COALESCE(c.name, 'Bez kategorii') as category,
           COALESCE(c.color, '#6b7280') as color,
           SUM(ABS(t.amount)) as total
    FROM transactions t
    LEFT JOIN categories c ON c.id = t.category_id
    ${where} AND t.is_split = 0
    GROUP BY t.category_id
  `).all(...params);

  // Split transactions by item categories
  const split = db.prepare(`
    SELECT COALESCE(c.name, 'Bez kategorii') as category,
           COALESCE(c.color, '#6b7280') as color,
           SUM(ABS(ti.amount)) as total
    FROM transaction_items ti
    JOIN transactions t ON t.id = ti.transaction_id
    LEFT JOIN categories c ON c.id = ti.category_id
    ${where} AND t.is_split = 1
    GROUP BY ti.category_id
  `).all(...params);

  // Merge results
  const merged = new Map<string, { category: string; color: string; total: number }>();
  for (const row of [...direct, ...split] as any[]) {
    const existing = merged.get(row.category);
    if (existing) {
      existing.total += row.total;
    } else {
      merged.set(row.category, { category: row.category, color: row.color, total: row.total });
    }
  }

  res.json(Array.from(merged.values()).sort((a, b) => b.total - a.total));
});

router.get('/by-group', (req, res) => {
  const { from, to, account_id, exclude_transfers } = req.query;
  let where = 'WHERE t.amount < 0';
  const params: any[] = [];

  if (from) { where += ' AND t.date >= ?'; params.push(from); }
  if (to) { where += ' AND t.date <= ?'; params.push(to); }
  if (account_id) { where += ' AND t.account_id = ?'; params.push(account_id); }
  if (exclude_transfers !== '0') { where += " AND (c.cat_type IS NULL OR c.cat_type != 'transfer')"; }

  // Non-split transactions grouped by category group
  const direct = db.prepare(`
    SELECT COALESCE(c.group_name, 'Inne') as group_name,
           COALESCE(c.name, 'Bez kategorii') as category,
           COALESCE(c.color, '#6b7280') as color,
           SUM(ABS(t.amount)) as total
    FROM transactions t
    LEFT JOIN categories c ON c.id = t.category_id
    ${where} AND t.is_split = 0
    GROUP BY c.group_name, t.category_id
  `).all(...params);

  // Split transactions by item categories
  const split = db.prepare(`
    SELECT COALESCE(c.group_name, 'Inne') as group_name,
           COALESCE(c.name, 'Bez kategorii') as category,
           COALESCE(c.color, '#6b7280') as color,
           SUM(ABS(ti.amount)) as total
    FROM transaction_items ti
    JOIN transactions t ON t.id = ti.transaction_id
    LEFT JOIN categories c ON c.id = ti.category_id
    ${where} AND t.is_split = 1
    GROUP BY c.group_name, ti.category_id
  `).all(...params);

  // Merge and build hierarchical structure
  const groups = new Map<string, { group: string; total: number; categories: { category: string; color: string; total: number }[] }>();
  for (const row of [...direct, ...split] as any[]) {
    let g = groups.get(row.group_name);
    if (!g) {
      g = { group: row.group_name, total: 0, categories: [] };
      groups.set(row.group_name, g);
    }
    const existing = g.categories.find(c => c.category === row.category);
    if (existing) {
      existing.total += row.total;
    } else {
      g.categories.push({ category: row.category, color: row.color, total: row.total });
    }
    g.total += row.total;
  }

  const result = Array.from(groups.values())
    .map(g => ({ ...g, categories: g.categories.sort((a, b) => b.total - a.total) }))
    .sort((a, b) => b.total - a.total);

  res.json(result);
});

router.get('/monthly-trend', (req, res) => {
  const { year, account_id, from, to, exclude_transfers } = req.query;
  let where = 'WHERE 1=1';
  const params: any[] = [];

  if (from && to) {
    where += ' AND t.date >= ? AND t.date <= ?';
    params.push(from, to);
  } else {
    const targetYear = year || new Date().getFullYear().toString();
    where += " AND strftime('%Y', t.date) = ?";
    params.push(targetYear);
  }
  if (account_id) { where += ' AND t.account_id = ?'; params.push(account_id); }
  if (exclude_transfers !== '0') {
    where += " AND (t.category_id IS NULL OR t.category_id NOT IN (SELECT id FROM categories WHERE cat_type = 'transfer'))";
  }

  const data = db.prepare(`
    SELECT strftime('%m', t.date) as month,
           SUM(CASE WHEN t.amount < 0 THEN ABS(t.amount) ELSE 0 END) as expenses,
           SUM(CASE WHEN t.amount > 0 THEN t.amount ELSE 0 END) as income
    FROM transactions t
    ${where}
    GROUP BY strftime('%m', t.date)
    ORDER BY month
  `).all(...params);

  res.json(data);
});

router.get('/balance-history', (req, res) => {
  const { account_id, from, to } = req.query;

  // Get accounts with initial balance
  let accounts: any[];
  if (account_id) {
    accounts = db.prepare('SELECT * FROM accounts WHERE id = ?').all(account_id) as any[];
  } else {
    accounts = db.prepare('SELECT * FROM accounts').all() as any[];
  }

  if (accounts.length === 0) {
    return res.json([]);
  }

  const result: { date: string; balance: number; account_name: string }[] = [];

  for (const account of accounts) {
    const startDate = from || account.initial_balance_date || '2000-01-01';
    const endDate = to || new Date().toISOString().slice(0, 10);
    const initialBalance = account.initial_balance || 0;
    const balanceDate = account.initial_balance_date || '2000-01-01';

    // Sum of transactions before start date (after initial_balance_date)
    const priorSum = db.prepare(
      'SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE account_id = ? AND date >= ? AND date < ?'
    ).get(account.id, balanceDate, startDate) as { total: number };

    // Daily transaction sums within range
    const dailyTx = db.prepare(`
      SELECT date, SUM(amount) as daily_total
      FROM transactions
      WHERE account_id = ? AND date >= ? AND date <= ?
      GROUP BY date ORDER BY date
    `).all(account.id, startDate, endDate) as { date: string; daily_total: number }[];

    let runningBalance = initialBalance + priorSum.total;
    for (const day of dailyTx) {
      runningBalance += day.daily_total;
      result.push({ date: day.date, balance: Math.round(runningBalance * 100) / 100, account_name: account.name });
    }
  }

  result.sort((a, b) => a.date.localeCompare(b.date));
  res.json(result);
});

export default router;
