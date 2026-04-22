const BASE = '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Błąd serwera' }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export const api = {
  // Accounts
  getAccounts: () => request<any[]>('/accounts'),
  createAccount: (data: { name: string; bank: string; account_number?: string }) =>
    request<any>('/accounts', { method: 'POST', body: JSON.stringify(data) }),
  updateAccount: (id: number, data: { name?: string; bank?: string }) =>
    request<any>(`/accounts/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteAccount: (id: number) =>
    request<any>(`/accounts/${id}`, { method: 'DELETE' }),

  // Categories
  getCategories: () => request<any[]>('/categories'),
  getCategoryGroups: () => request<string[]>('/categories/groups'),
  createCategory: (data: { name: string; color?: string; cat_type?: string; group_name?: string }) =>
    request<any>('/categories', { method: 'POST', body: JSON.stringify(data) }),
  updateCategory: (id: number, data: { name?: string; color?: string; cat_type?: string; group_name?: string }) =>
    request<any>(`/categories/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  moveCategory: (id: number, direction: 'up' | 'down') =>
    request<any>(`/categories/${id}/move`, { method: 'POST', body: JSON.stringify({ direction }) }),
  moveGroup: (group_name: string, direction: 'up' | 'down') =>
    request<any>('/categories/groups/move', { method: 'POST', body: JSON.stringify({ group_name, direction }) }),
  deleteCategory: (id: number) =>
    request<any>(`/categories/${id}`, { method: 'DELETE' }),

  // Transactions
  getTransactions: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<{ data: any[]; total: number }>(`/transactions${qs}`);
  },
  createTransaction: (data: { account_id: number; date: string; description: string; amount: number; counterparty?: string; category_id?: number; note?: string }) =>
    request<any>('/transactions', { method: 'POST', body: JSON.stringify(data) }),
  getTransaction: (id: number) => request<any>(`/transactions/${id}`),
  updateTransaction: (id: number, data: any) =>
    request<any>(`/transactions/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  splitTransaction: (id: number, items: any[]) =>
    request<any>(`/transactions/${id}/split`, { method: 'POST', body: JSON.stringify({ items }) }),
  unsplitTransaction: (id: number) =>
    request<any>(`/transactions/${id}/split`, { method: 'DELETE' }),
  deleteTransaction: (id: number) =>
    request<any>(`/transactions/${id}`, { method: 'DELETE' }),
  batchUpdateCategory: (ids: number[], category_id: number | null) =>
    request<any>('/transactions/batch/category', { method: 'PUT', body: JSON.stringify({ ids, category_id }) }),
  deleteTransactions: (ids: number[]) =>
    request<any>('/transactions/batch', { method: 'DELETE', body: JSON.stringify({ ids }) }),

  // Import
  importCsv: (file: File, bank: string, accountId?: number) => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('bank', bank);
    if (accountId) fd.append('account_id', String(accountId));
    return fetch(`${BASE}/import/csv`, { method: 'POST', body: fd }).then(r => r.json());
  },
  importXml: (file: File, accountId?: number) => {
    const fd = new FormData();
    fd.append('file', file);
    if (accountId) fd.append('account_id', String(accountId));
    return fetch(`${BASE}/import/xml`, { method: 'POST', body: fd }).then(r => r.json());
  },
  importPdf: (file: File, bank?: string) => {
    const fd = new FormData();
    fd.append('file', file);
    if (bank) fd.append('bank', bank);
    return fetch(`${BASE}/import/pdf`, { method: 'POST', body: fd }).then(r => r.json());
  },
  scanReceipt: (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return fetch(`${BASE}/import/receipt-scan`, { method: 'POST', body: fd }).then(r => r.json());
  },
  importReceipt: (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return fetch(`${BASE}/import/receipt`, { method: 'POST', body: fd }).then(r => r.json());
  },
  getImports: () => request<any[]>('/import'),

  // Receipts
  getReceipts: () => request<any[]>('/receipts'),
  getReceiptProfiles: () => request<any[]>('/receipts/profiles'),
  getReceipt: (id: number) => request<any>(`/receipts/${id}`),
  updateReceipt: (id: number, data: { store_name?: string; receipt_date?: string; total_amount?: number }) =>
    request<any>(`/receipts/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  matchReceipt: (id: number, transactionId: number) =>
    request<any>(`/receipts/${id}/match`, { method: 'POST', body: JSON.stringify({ transaction_id: transactionId }) }),
  deleteReceipt: (id: number) =>
    request<any>(`/receipts/${id}`, { method: 'DELETE' }),
  reparseReceipt: (id: number) =>
    request<any>(`/receipts/${id}/reparse`, { method: 'POST' }),
  addReceiptItem: (receiptId: number, data: { name: string; amount: number; quantity?: number; unit_price?: number; category_id?: number }) =>
    request<any>(`/receipts/${receiptId}/items`, { method: 'POST', body: JSON.stringify(data) }),
  updateReceiptItem: (receiptId: number, itemId: number, data: any) =>
    request<any>(`/receipts/${receiptId}/items/${itemId}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteReceiptItem: (receiptId: number, itemId: number) =>
    request<any>(`/receipts/${receiptId}/items/${itemId}`, { method: 'DELETE' }),

  // Products
  getProducts: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<any[]>(`/products${qs}`);
  },
  updateProduct: (id: number, data: any) =>
    request<any>(`/products/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteProduct: (id: number) =>
    request<any>(`/products/${id}`, { method: 'DELETE' }),

  // Reports
  getReportByGroup: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<any[]>(`/reports/by-group${qs}`);
  },
  getReportByCategory: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<any[]>(`/reports/by-category${qs}`);
  },
  getMonthlyTrend: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<any[]>(`/reports/monthly-trend${qs}`);
  },
  getBalanceHistory: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<any[]>(`/reports/balance-history${qs}`);
  },
};
