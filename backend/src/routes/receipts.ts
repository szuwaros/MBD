import { Router } from 'express';
import db from '../db/connection';
import { reparseRawText } from '../parsers/receipt-ocr';

const router = Router();

router.get('/', (_req, res) => {
  const receipts = db.prepare(`
    SELECT r.*, t.description as transaction_description, t.amount as transaction_amount,
      (SELECT COUNT(*) FROM receipt_items ri WHERE ri.receipt_id = r.id) as item_count
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

// Update receipt metadata
router.put('/:id', (req, res) => {
  const { id } = req.params;
  const { store_name, receipt_date, total_amount } = req.body;
  if (store_name !== undefined) db.prepare('UPDATE receipts SET store_name = ? WHERE id = ?').run(store_name || null, id);
  if (receipt_date !== undefined) db.prepare('UPDATE receipts SET receipt_date = ? WHERE id = ?').run(receipt_date || null, id);
  if (total_amount !== undefined) db.prepare('UPDATE receipts SET total_amount = ? WHERE id = ?').run(total_amount, id);
  const receipt = db.prepare('SELECT * FROM receipts WHERE id = ?').get(id);
  res.json(receipt);
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

// Reparse receipt raw_data with current engine
router.post('/:id/reparse', (req, res) => {
  const { id } = req.params;
  const receipt = db.prepare('SELECT * FROM receipts WHERE id = ?').get(id) as any;
  if (!receipt) return res.status(404).json({ error: 'Nie znaleziono paragonu' });
  if (!receipt.raw_data) return res.status(400).json({ error: 'Brak surowych danych do ponownej interpretacji' });

  const parsed = reparseRawText(receipt.raw_data);

  const doReparse = db.transaction(() => {
    // Update receipt metadata if detected
    if (parsed.storeName) db.prepare('UPDATE receipts SET store_name = ? WHERE id = ?').run(parsed.storeName, id);
    if (parsed.receiptDate) db.prepare('UPDATE receipts SET receipt_date = ? WHERE id = ?').run(parsed.receiptDate, id);
    if (parsed.totalAmount) db.prepare('UPDATE receipts SET total_amount = ? WHERE id = ?').run(parsed.totalAmount, id);

    // Delete old items
    db.prepare('DELETE FROM receipt_items WHERE receipt_id = ?').run(id);

    // Insert new items — category comes from products table (user-assigned)
    const findProduct = db.prepare('SELECT id, category_id FROM products WHERE name = ?');
    const insertProduct = db.prepare('INSERT INTO products (name, category_id, last_price) VALUES (?, ?, ?)');
    const insertItem = db.prepare('INSERT INTO receipt_items (receipt_id, name, quantity, unit_price, amount, product_id, category_id) VALUES (?, ?, ?, ?, ?, ?, ?)');

    for (const item of parsed.items) {
      let productId: number | null = null;
      let categoryId: number | null = null;

      // 1. Known product → use its category
      const existing = findProduct.get(item.name) as { id: number; category_id: number | null } | undefined;
      if (existing) {
        productId = existing.id;
        categoryId = existing.category_id;
      } else {
        // 2. New product → create without category (user will assign later)
        const result = insertProduct.run(item.name, null, item.amount);
        productId = Number(result.lastInsertRowid);
      }

      insertItem.run(id, item.name, item.quantity, item.unitPrice, item.amount, productId, categoryId);
    }

    // If linked to a transaction, resync transaction_items
    if (receipt.transaction_id) {
      db.prepare('DELETE FROM transaction_items WHERE transaction_id = ?').run(receipt.transaction_id);
      const newItems = db.prepare('SELECT * FROM receipt_items WHERE receipt_id = ?').all(id) as any[];
      const insertTxItem = db.prepare('INSERT INTO transaction_items (transaction_id, description, amount, category_id, product_id) VALUES (?, ?, ?, ?, ?)');
      for (const ri of newItems) {
        insertTxItem.run(receipt.transaction_id, ri.name, -Math.abs(ri.amount), ri.category_id, ri.product_id);
      }
      db.prepare('UPDATE transactions SET is_split = 1, category_id = NULL WHERE id = ?').run(receipt.transaction_id);
    }
  });

  doReparse();

  // Return updated receipt
  const updated = db.prepare('SELECT * FROM receipts WHERE id = ?').get(id);
  const items = db.prepare(`
    SELECT ri.*, p.name as product_name, c.name as category_name, c.color as category_color
    FROM receipt_items ri LEFT JOIN products p ON p.id = ri.product_id LEFT JOIN categories c ON c.id = ri.category_id
    WHERE ri.receipt_id = ? ORDER BY ri.id
  `).all(id);
  res.json({ ...(updated as object), items });
});

// Add item manually
router.post('/:id/items', (req, res) => {
  const { id } = req.params;
  const { name, quantity, unit_price, amount, category_id } = req.body;
  if (!name || !amount) return res.status(400).json({ error: 'Nazwa i kwota wymagane' });

  const result = db.prepare('INSERT INTO receipt_items (receipt_id, name, quantity, unit_price, amount, category_id) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, name, quantity || 1, unit_price || amount, amount, category_id || null);

  const item = db.prepare('SELECT * FROM receipt_items WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(item);
});

router.put('/:id/items/:itemId', (req, res) => {
  const { id, itemId } = req.params;
  const { category_id, name, amount, quantity, unit_price, note } = req.body;

  // Update all provided fields
  if (name !== undefined) db.prepare('UPDATE receipt_items SET name = ? WHERE id = ? AND receipt_id = ?').run(name, itemId, id);
  if (amount !== undefined) db.prepare('UPDATE receipt_items SET amount = ? WHERE id = ? AND receipt_id = ?').run(amount, itemId, id);
  if (quantity !== undefined) db.prepare('UPDATE receipt_items SET quantity = ? WHERE id = ? AND receipt_id = ?').run(quantity, itemId, id);
  if (unit_price !== undefined) db.prepare('UPDATE receipt_items SET unit_price = ? WHERE id = ? AND receipt_id = ?').run(unit_price, itemId, id);
  if (category_id !== undefined) db.prepare('UPDATE receipt_items SET category_id = ? WHERE id = ? AND receipt_id = ?').run(category_id ?? null, itemId, id);
  if (note !== undefined) db.prepare('UPDATE receipt_items SET note = ? WHERE id = ? AND receipt_id = ?').run(note || null, itemId, id);

  // Sync changes to linked transaction_item and product
  const receipt = db.prepare('SELECT transaction_id FROM receipts WHERE id = ?').get(id) as any;
  const ri = db.prepare('SELECT * FROM receipt_items WHERE id = ?').get(itemId) as any;

  if (receipt?.transaction_id && ri) {
    // Find matching transaction_item by product_id (stable) or fall back to position
    const tiByProduct = ri.product_id
      ? db.prepare('SELECT id FROM transaction_items WHERE transaction_id = ? AND product_id = ?').get(receipt.transaction_id, ri.product_id) as any
      : null;

    if (tiByProduct) {
      const updates: string[] = [];
      const params: any[] = [];
      if (name !== undefined) { updates.push('description = ?'); params.push(name); }
      if (amount !== undefined) { updates.push('amount = ?'); params.push(-Math.abs(amount)); }
      if (category_id !== undefined) { updates.push('category_id = ?'); params.push(category_id ?? null); }
      if (updates.length > 0) {
        params.push(tiByProduct.id);
        db.prepare(`UPDATE transaction_items SET ${updates.join(', ')} WHERE id = ?`).run(...params);
      }
    }
  }

  // Update product name and category
  if (ri?.product_id) {
    if (name !== undefined) db.prepare('UPDATE products SET name = ? WHERE id = ?').run(name, ri.product_id);
    if (category_id !== undefined && category_id) db.prepare('UPDATE products SET category_id = ? WHERE id = ?').run(category_id, ri.product_id);
  }

  res.json({ ok: true });
});

router.delete('/:id/items/:itemId', (req, res) => {
  const { itemId } = req.params;
  db.prepare('DELETE FROM receipt_items WHERE id = ?').run(itemId);
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  const { id } = req.params;

  const receipt = db.prepare('SELECT transaction_id FROM receipts WHERE id = ?').get(id) as any;
  if (!receipt) return res.status(404).json({ error: 'Nie znaleziono paragonu' });

  const deleteReceipt = db.transaction(() => {
    // If matched to transaction, unsplit it
    if (receipt.transaction_id) {
      db.prepare('DELETE FROM transaction_items WHERE transaction_id = ?').run(receipt.transaction_id);
      db.prepare('UPDATE transactions SET is_split = 0 WHERE id = ?').run(receipt.transaction_id);
    }
    db.prepare('DELETE FROM receipt_items WHERE receipt_id = ?').run(id);
    db.prepare('DELETE FROM receipts WHERE id = ?').run(id);
  });

  deleteReceipt();
  res.json({ ok: true });
});

export default router;
