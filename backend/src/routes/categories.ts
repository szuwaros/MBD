import { Router } from 'express';
import db from '../db/connection';

const router = Router();

router.get('/', (_req, res) => {
  const categories = db.prepare(`
    SELECT c.*,
      (SELECT COUNT(*) FROM transactions t WHERE t.category_id = c.id) +
      (SELECT COUNT(*) FROM transaction_items ti WHERE ti.category_id = c.id) as usage_count
    FROM categories c ORDER BY c.sort_order, c.group_name, c.name
  `).all();
  res.json(categories);
});

// Get distinct group names in order
router.get('/groups', (_req, res) => {
  const groups = db.prepare(`
    SELECT DISTINCT group_name, MIN(sort_order) as min_order
    FROM categories WHERE group_name IS NOT NULL
    GROUP BY group_name ORDER BY min_order, group_name
  `).all();
  res.json(groups.map((g: any) => g.group_name));
});

router.post('/', (req, res) => {
  const { name, color, icon, cat_type, group_name } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Nazwa jest wymagana' });
  }
  // Put new category at end of its group (before "Inne")
  const maxOrder = db.prepare('SELECT MAX(sort_order) as m FROM categories WHERE group_name = ? AND name != ?').get(group_name || null, 'Inne') as { m: number | null };
  const sortOrder = (maxOrder?.m ?? 0) + 1;
  try {
    const result = db.prepare('INSERT INTO categories (name, color, icon, cat_type, group_name, sort_order) VALUES (?, ?, ?, ?, ?, ?)')
      .run(name, color || '#6b7280', icon || null, cat_type || 'expense', group_name || null, sortOrder);
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

// Move entire group up/down — MUST be before /:id routes
router.post('/groups/move', (req, res) => {
  const { group_name, direction } = req.body;

  // Get all groups in order
  const groups = db.prepare(`
    SELECT group_name, MIN(sort_order) as min_order
    FROM categories WHERE group_name IS NOT NULL
    GROUP BY group_name ORDER BY min_order
  `).all() as { group_name: string; min_order: number }[];

  const idx = groups.findIndex(g => g.group_name === group_name);
  const swapIdx = direction === 'up' ? idx - 1 : idx + 1;

  if (idx < 0 || swapIdx < 0 || swapIdx >= groups.length) return res.json({ ok: true });

  // Swap groups by reordering all categories
  const swapped = [...groups];
  [swapped[idx], swapped[swapIdx]] = [swapped[swapIdx], swapped[idx]];

  const update = db.prepare('UPDATE categories SET sort_order = ? WHERE id = ?');
  const doReorder = db.transaction(() => {
    let order = 0;
    for (const group of swapped) {
      const cats = db.prepare('SELECT id, name FROM categories WHERE group_name = ? ORDER BY sort_order, name')
        .all(group.group_name) as { id: number; name: string }[];
      for (const cat of cats) {
        update.run(order++, cat.id);
      }
    }
  });
  doReorder();

  res.json({ ok: true });
});

// Move category up/down within its group
router.post('/:id/move', (req, res) => {
  const { id } = req.params;
  const { direction } = req.body;

  const cat = db.prepare('SELECT * FROM categories WHERE id = ?').get(id) as any;
  if (!cat) return res.status(404).json({ error: 'Nie znaleziono' });

  const siblings = db.prepare('SELECT id, sort_order FROM categories WHERE group_name = ? ORDER BY sort_order, name')
    .all(cat.group_name) as { id: number; sort_order: number }[];

  const idx = siblings.findIndex(s => s.id === cat.id);
  const swapIdx = direction === 'up' ? idx - 1 : idx + 1;

  if (swapIdx >= 0 && swapIdx < siblings.length) {
    const other = siblings[swapIdx];
    const update = db.prepare('UPDATE categories SET sort_order = ? WHERE id = ?');
    update.run(other.sort_order, cat.id);
    update.run(cat.sort_order, other.id);
  }

  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  const { id } = req.params;
  db.prepare('UPDATE transactions SET category_id = NULL WHERE category_id = ?').run(id);
  db.prepare('UPDATE transaction_items SET category_id = NULL WHERE category_id = ?').run(id);
  db.prepare('DELETE FROM categories WHERE id = ?').run(id);
  res.json({ ok: true });
});

export default router;
