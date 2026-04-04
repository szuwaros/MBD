import { Router } from 'express';
import db from '../db/connection';

const router = Router();

router.get('/', (_req, res) => {
  const categories = db.prepare(`
    SELECT c.*,
      (SELECT COUNT(*) FROM transactions t WHERE t.category_id = c.id) +
      (SELECT COUNT(*) FROM transaction_items ti WHERE ti.category_id = c.id) as usage_count
    FROM categories c ORDER BY c.group_name, c.cat_type, c.name
  `).all();
  res.json(categories);
});

// Get distinct group names
router.get('/groups', (_req, res) => {
  const groups = db.prepare(`
    SELECT DISTINCT group_name FROM categories WHERE group_name IS NOT NULL ORDER BY group_name
  `).all();
  res.json(groups.map((g: any) => g.group_name));
});

router.post('/', (req, res) => {
  const { name, color, icon, cat_type, group_name } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Nazwa jest wymagana' });
  }
  try {
    const result = db.prepare('INSERT INTO categories (name, color, icon, cat_type, group_name) VALUES (?, ?, ?, ?, ?)')
      .run(name, color || '#6b7280', icon || null, cat_type || 'expense', group_name || null);
    const category = db.prepare('SELECT * FROM categories WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(category);
  } catch (e: any) {
    if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(400).json({ error: 'Kategoria o tej nazwie już istnieje w tej grupie' });
    }
    throw e;
  }
});

router.put('/:id', (req, res) => {
  const { id } = req.params;
  const { name, color, icon, cat_type, group_name } = req.body;
  db.prepare('UPDATE categories SET name = COALESCE(?, name), color = COALESCE(?, color), icon = COALESCE(?, icon), cat_type = COALESCE(?, cat_type), group_name = COALESCE(?, group_name) WHERE id = ?')
    .run(name, color, icon, cat_type, group_name, id);
  const category = db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
  res.json(category);
});

router.delete('/:id', (req, res) => {
  const { id } = req.params;
  db.prepare('UPDATE transactions SET category_id = NULL WHERE category_id = ?').run(id);
  db.prepare('UPDATE transaction_items SET category_id = NULL WHERE category_id = ?').run(id);
  db.prepare('DELETE FROM categories WHERE id = ?').run(id);
  res.json({ ok: true });
});

export default router;
