import { Router } from 'express';
import db from '../db/connection';

const router = Router();

router.get('/', (req, res) => {
  const { search, category_id } = req.query;
  let where = 'WHERE 1=1';
  const params: any[] = [];

  if (search) { where += ' AND p.name LIKE ?'; params.push(`%${search}%`); }
  if (category_id) { where += ' AND p.category_id = ?'; params.push(category_id); }

  const products = db.prepare(`
    SELECT p.*, c.name as category_name, c.color as category_color
    FROM products p
    LEFT JOIN categories c ON c.id = p.category_id
    ${where}
    ORDER BY p.times_purchased DESC, p.name
  `).all(...params);

  res.json(products);
});

router.put('/:id', (req, res) => {
  const { id } = req.params;
  const { name, category_id } = req.body;

  db.prepare('UPDATE products SET name = COALESCE(?, name), category_id = COALESCE(?, category_id), updated_at = datetime(\'now\') WHERE id = ?')
    .run(name, category_id, id);

  // Also update category on future transaction_items and receipt_items linked to this product
  if (category_id !== undefined) {
    db.prepare('UPDATE transaction_items SET category_id = ? WHERE product_id = ?').run(category_id, id);
    db.prepare('UPDATE receipt_items SET category_id = ? WHERE product_id = ?').run(category_id, id);
  }

  const product = db.prepare('SELECT p.*, c.name as category_name, c.color as category_color FROM products p LEFT JOIN categories c ON c.id = p.category_id WHERE p.id = ?').get(id);
  res.json(product);
});

export default router;
