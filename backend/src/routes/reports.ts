import { Router } from 'express';
import db from '../db/connection';

const router = Router();

router.get('/by-category', (req, res) => {
  const { from, to, account_id } = req.query;
  let where = 'WHERE t.amount < 0';
  const params: any[] = [];

  if (from) { where += ' AND t.date >= ?'; params.push(from); }
  if (to) { where += ' AND t.date <= ?'; params.push(to); }
  if (account_id) { where += ' AND t.account_id = ?'; params.push(account_id); }

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
  const { from, to, account_id } = req.query;
  let where = 'WHERE t.amount < 0';
  const params: any[] = [];

  if (from) { where += ' AND t.date >= ?'; params.push(from); }
  if (to) { where += ' AND t.date <= ?'; params.push(to); }
  if (account_id) { where += ' AND t.account_id = ?'; params.push(account_id); }

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
  const { year, account_id } = req.query;
  const targetYear = year || new Date().getFullYear().toString();
  let accountFilter = '';
  const params: any[] = [targetYear];

  if (account_id) { accountFilter = ' AND t.account_id = ?'; params.push(account_id); }

  const data = db.prepare(`
    SELECT strftime('%m', t.date) as month,
           SUM(CASE WHEN t.amount < 0 THEN ABS(t.amount) ELSE 0 END) as expenses,
           SUM(CASE WHEN t.amount > 0 THEN t.amount ELSE 0 END) as income
    FROM transactions t
    WHERE strftime('%Y', t.date) = ? ${accountFilter}
    GROUP BY strftime('%m', t.date)
    ORDER BY month
  `).all(...params);

  res.json(data);
});

router.get('/balance-history', (req, res) => {
  const { account_id, from, to } = req.query;
  let where = 'WHERE t.balance_after IS NOT NULL';
  const params: any[] = [];

  if (account_id) { where += ' AND t.account_id = ?'; params.push(account_id); }
  if (from) { where += ' AND t.date >= ?'; params.push(from); }
  if (to) { where += ' AND t.date <= ?'; params.push(to); }

  const data = db.prepare(`
    SELECT t.date, t.balance_after as balance, a.name as account_name
    FROM transactions t
    JOIN accounts a ON a.id = t.account_id
    ${where}
    ORDER BY t.date, t.id
  `).all(...params);

  res.json(data);
});

export default router;
