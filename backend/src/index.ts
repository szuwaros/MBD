import express from 'express';
import cors from 'cors';
import path from 'path';
import { initializeDatabase } from './db/schema';
import accountsRouter from './routes/accounts';
import categoriesRouter from './routes/categories';
import importRouter from './routes/import';
import transactionsRouter from './routes/transactions';
import receiptsRouter from './routes/receipts';
import productsRouter from './routes/products';
import reportsRouter from './routes/reports';

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize database
initializeDatabase();

// Middleware
app.use(cors());
app.use(express.json());

// API routes
app.use('/api/accounts', accountsRouter);
app.use('/api/categories', categoriesRouter);
app.use('/api/import', importRouter);
app.use('/api/transactions', transactionsRouter);
app.use('/api/receipts', receiptsRouter);
app.use('/api/products', productsRouter);
app.use('/api/reports', reportsRouter);

// Serve frontend in production
const frontendPath = path.join(__dirname, '..', '..', 'frontend', 'dist');
app.use(express.static(frontendPath));
app.get('*', (_req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`MBD server running on http://localhost:${PORT}`);
});
