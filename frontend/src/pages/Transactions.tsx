import { useEffect, useState, useCallback } from 'react';
import { api } from '../api/client';
import CategoryBadge from '../components/CategoryBadge';
import TransactionSplitModal from '../components/TransactionSplitModal';

export default function Transactions() {
  const [transactions, setTransactions] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [filters, setFilters] = useState({ account_id: '', from: '', to: '', category_id: '', search: '' });
  const [page, setPage] = useState(0);
  const [splitTx, setSplitTx] = useState<any>(null);
  const LIMIT = 50;

  const load = useCallback(() => {
    const params: Record<string, string> = { limit: String(LIMIT), offset: String(page * LIMIT) };
    Object.entries(filters).forEach(([k, v]) => { if (v) params[k] = v; });
    api.getTransactions(params).then(res => { setTransactions(res.data); setTotal(res.total); });
  }, [filters, page]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { api.getAccounts().then(setAccounts); api.getCategories().then(setCategories); }, []);

  const handleCategoryChange = async (txId: number, categoryId: string) => {
    await api.updateTransaction(txId, { category_id: categoryId ? Number(categoryId) : null });
    load();
  };

  const handleUnsplit = async (txId: number) => {
    await api.unsplitTransaction(txId);
    load();
  };

  const openSplit = async (txId: number) => {
    const tx = await api.getTransaction(txId);
    setSplitTx(tx);
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Transakcje</h1>

      <div className="bg-white rounded-lg shadow p-4 mb-4 flex gap-3 flex-wrap items-end">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Konto</label>
          <select value={filters.account_id} onChange={e => { setFilters(f => ({ ...f, account_id: e.target.value })); setPage(0); }} className="border rounded px-2 py-1.5 text-sm">
            <option value="">Wszystkie</option>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Od</label>
          <input type="date" value={filters.from} onChange={e => { setFilters(f => ({ ...f, from: e.target.value })); setPage(0); }} className="border rounded px-2 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Do</label>
          <input type="date" value={filters.to} onChange={e => { setFilters(f => ({ ...f, to: e.target.value })); setPage(0); }} className="border rounded px-2 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Kategoria</label>
          <select value={filters.category_id} onChange={e => { setFilters(f => ({ ...f, category_id: e.target.value })); setPage(0); }} className="border rounded px-2 py-1.5 text-sm">
            <option value="">Wszystkie</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Szukaj</label>
          <input value={filters.search} onChange={e => { setFilters(f => ({ ...f, search: e.target.value })); setPage(0); }} className="border rounded px-2 py-1.5 text-sm" placeholder="opis, kontrahent..." />
        </div>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-4 py-3">Data</th>
              <th className="text-left px-4 py-3">Opis</th>
              <th className="text-left px-4 py-3">Konto</th>
              <th className="text-right px-4 py-3">Kwota</th>
              <th className="text-right px-4 py-3">Saldo</th>
              <th className="text-left px-4 py-3">Kategoria</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {transactions.map(tx => (
              <tr key={tx.id} className="border-t hover:bg-gray-50">
                <td className="px-4 py-2 text-gray-500 whitespace-nowrap">{tx.date}</td>
                <td className="px-4 py-2 max-w-xs truncate" title={tx.description}>{tx.description}</td>
                <td className="px-4 py-2 text-xs text-gray-500">{tx.account_name}</td>
                <td className={`px-4 py-2 text-right font-mono whitespace-nowrap ${tx.amount < 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {tx.amount.toFixed(2)}
                </td>
                <td className="px-4 py-2 text-right font-mono text-gray-400 whitespace-nowrap">{tx.balance_after?.toFixed(2) || '-'}</td>
                <td className="px-4 py-2">
                  {tx.is_split ? (
                    <span className="text-xs text-purple-600 font-medium">Rozbita</span>
                  ) : (
                    <select
                      value={tx.category_id || ''}
                      onChange={e => handleCategoryChange(tx.id, e.target.value)}
                      className="border rounded px-1 py-0.5 text-xs"
                    >
                      <option value="">-</option>
                      {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  )}
                </td>
                <td className="px-4 py-2 text-right whitespace-nowrap space-x-1">
                  <button onClick={() => openSplit(tx.id)} className="text-blue-500 hover:text-blue-700 text-xs">
                    {tx.is_split ? 'Edytuj' : 'Rozbij'}
                  </button>
                  {tx.is_split && (
                    <button onClick={() => handleUnsplit(tx.id)} className="text-red-400 hover:text-red-600 text-xs">Cofnij</button>
                  )}
                </td>
              </tr>
            ))}
            {transactions.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">Brak transakcji</td></tr>}
          </tbody>
        </table>

        <div className="flex items-center justify-between px-4 py-3 border-t bg-gray-50 text-sm">
          <span className="text-gray-500">Razem: {total}</span>
          <div className="space-x-2">
            <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="px-3 py-1 border rounded disabled:opacity-30">Wstecz</button>
            <span className="text-gray-500">Strona {page + 1} z {Math.max(1, Math.ceil(total / LIMIT))}</span>
            <button onClick={() => setPage(p => p + 1)} disabled={(page + 1) * LIMIT >= total} className="px-3 py-1 border rounded disabled:opacity-30">Dalej</button>
          </div>
        </div>
      </div>

      {splitTx && (
        <TransactionSplitModal
          transaction={splitTx}
          categories={categories}
          onClose={() => setSplitTx(null)}
          onSave={() => { setSplitTx(null); load(); }}
        />
      )}
    </div>
  );
}
