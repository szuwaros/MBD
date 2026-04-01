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
  deleteAccount: (id: number) =>
    request<any>(`/accounts/${id}`, { method: 'DELETE' }),

  // Categories
  getCategories: () => request<any[]>('/categories'),
  createCategory: (data: { name: string; color?: string }) =>
    request<any>('/categories', { method: 'POST', body: JSON.stringify(data) }),
  updateCategory: (id: number, data: { name?: string; color?: string }) =>
    request<any>(`/categories/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteCategory: (id: number) =>
    request<any>(`/categories/${id}`, { method: 'DELETE' }),

  // Transactions
  getTransactions: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<{ data: any[]; total: number }>(`/transactions${qs}`);
  },
  getTransaction: (id: number) => request<any>(`/transactions/${id}`),
  updateTransaction: (id: number, data: any) =>
    request<any>(`/transactions/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  splitTransaction: (id: number, items: any[]) =>
    request<any>(`/transactions/${id}/split`, { method: 'POST', body: JSON.stringify({ items }) }),
  unsplitTransaction: (id: number) =>
    request<any>(`/transactions/${id}/split`, { method: 'DELETE' }),

  // Import
  importCsv: (file: File, accountId: number) => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('account_id', String(accountId));
    return fetch(`${BASE}/import/csv`, { method: 'POST', body: fd }).then(r => r.json());
  },
  importReceipt: (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return fetch(`${BASE}/import/receipt`, { method: 'POST', body: fd }).then(r => r.json());
  },
  getImports: () => request<any[]>('/import'),

  // Receipts
  getReceipts: () => request<any[]>('/receipts'),
  getReceipt: (id: number) => request<any>(`/receipts/${id}`),
  matchReceipt: (id: number, transactionId: number) =>
    request<any>(`/receipts/${id}/match`, { method: 'POST', body: JSON.stringify({ transaction_id: transactionId }) }),

  // Products
  getProducts: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<any[]>(`/products${qs}`);
  },
  updateProduct: (id: number, data: any) =>
    request<any>(`/products/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  // Reports
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
