import { useEffect, useState, useCallback, useRef } from 'react';
import { api } from '../api/client';
import TransactionSplitModal from '../components/TransactionSplitModal';
import GroupedCategorySelect from '../components/GroupedCategorySelect';
import NoteCell from '../components/NoteCell';
import DataTable, { Column } from '../components/DataTable';
import DateRangeSelector from '../components/DateRangeSelector';

export default function Transactions() {
  const [transactions, setTransactions] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  type Filters = { account_id: string; from: string; to: string; category_id: string; search: string; amount_min: string; amount_max: string };
  const defaultFilters: Filters = { account_id: '', from: '', to: '', category_id: '', search: '', amount_min: '', amount_max: '' };
  const [filters, setFilters] = useState<Filters>(() => {
    try {
      const raw = sessionStorage.getItem('tx:filters');
      return raw ? { ...defaultFilters, ...JSON.parse(raw) } : defaultFilters;
    } catch { return defaultFilters; }
  });
  const [splitTx, setSplitTx] = useState<any>(null);
  const fetchParamsRef = useRef<any>({});

  const load = useCallback((params?: { limit: number; offset: number; sort_by: string; sort_dir: string }) => {
    const p = params || fetchParamsRef.current;
    fetchParamsRef.current = p;
    const q: Record<string, string> = {
      limit: String(p.limit || 50),
      offset: String(p.offset || 0),
      sort_by: p.sort_by || 'date',
      sort_dir: p.sort_dir || 'desc',
    };
    Object.entries(filters).forEach(([k, v]) => { if (v) q[k] = v; });
    api.getTransactions(q).then(res => { setTransactions(res.data); setTotal(res.total); });
  }, [filters]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { sessionStorage.setItem('tx:filters', JSON.stringify(filters)); }, [filters]);
  useEffect(() => { api.getAccounts().then(setAccounts); api.getCategories().then(setCategories); }, []);

  const handleCategoryChange = async (txId: number, categoryId: string) => {
    const catId = categoryId ? Number(categoryId) : null;
    setTransactions(prev => prev.map(t => t.id === txId ? { ...t, category_id: catId } : t));
    await api.updateTransaction(txId, { category_id: catId });
  };

  const handleUnsplit = async (txId: number) => {
    await api.unsplitTransaction(txId);
    load();
  };

  const openSplit = async (txId: number) => {
    const tx = await api.getTransaction(txId);
    setSplitTx(tx);
  };

  const handleDelete = async (ids: number[]) => {
    await api.deleteTransactions(ids);
    load();
  };

  const handleItemCategoryChange = async (txId: number, itemId: number, categoryId: string) => {
    const tx = transactions.find(t => t.id === txId);
    if (!tx?.items) return;
    const catId = categoryId ? Number(categoryId) : null;
    const updatedItems = tx.items.map((item: any) =>
      item.id === itemId ? { ...item, category_id: catId } : item
    );
    // Optimistic update — no scroll reset
    setTransactions(prev => prev.map(t => t.id === txId ? { ...t, items: updatedItems } : t));
    await api.splitTransaction(txId, updatedItems.map((item: any) => ({
      description: item.description,
      amount: item.amount,
      category_id: item.category_id,
      product_name: item.product_name,
    })));
  };

  const handleReceiptItemCategoryChange = async (receiptId: number, itemId: number, categoryId: string) => {
    const catId = categoryId ? Number(categoryId) : null;
    // Optimistic update — no scroll reset
    setTransactions(prev => prev.map(t => {
      if (!t.receipt_items) return t;
      return {
        ...t,
        receipt_items: t.receipt_items.map((ri: any) =>
          ri.id === itemId ? { ...ri, category_id: catId } : ri
        ),
      };
    }));
    await api.updateReceiptItem(receiptId, itemId, { category_id: catId });
  };

  // Selection & bulk actions
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [bulkCategoryId, setBulkCategoryId] = useState('');
  const [selectedChildren, setSelectedChildren] = useState<any[]>([]);
  const [bulkChildCategoryId, setBulkChildCategoryId] = useState('');

  const handleBulkCategory = async () => {
    if (selectedIds.length === 0 || !bulkCategoryId) return;
    await api.batchUpdateCategory(selectedIds, Number(bulkCategoryId));
    setBulkCategoryId('');
    load();
  };

  const handleBulkChildCategory = async () => {
    if (selectedChildren.length === 0 || !bulkChildCategoryId) return;
    const catId = Number(bulkChildCategoryId);

    // Group split items by parent transaction
    const splitByTx = new Map<number, any[]>();
    const receiptItems: { receiptId: number; itemId: number }[] = [];

    for (const child of selectedChildren) {
      if (child._type === 'split' && child._txId) {
        if (!splitByTx.has(child._txId)) splitByTx.set(child._txId, []);
        splitByTx.get(child._txId)!.push(child);
      } else if (child._type === 'receipt' && child._receiptId) {
        receiptItems.push({ receiptId: child._receiptId, itemId: child.id });
      }
    }

    // Update split items per transaction
    for (const [txId, selectedItems] of splitByTx) {
      const tx = transactions.find(t => t.id === txId);
      if (!tx?.items) continue;
      const selectedItemIds = new Set(selectedItems.map(s => s.id));
      const updatedItems = tx.items.map((item: any) => ({
        description: item.description,
        amount: item.amount,
        category_id: selectedItemIds.has(item.id) ? catId : item.category_id,
        product_name: item.product_name,
      }));
      await api.splitTransaction(txId, updatedItems);
    }

    // Update receipt items
    await Promise.all(receiptItems.map(ri => api.updateReceiptItem(ri.receiptId, ri.itemId, { category_id: catId })));

    setBulkChildCategoryId('');
    setSelectedChildren([]);
    load();
  };

  // Manual transaction form
  const [showAddTx, setShowAddTx] = useState(false);
  const [newTx, setNewTx] = useState({ account_id: '', date: new Date().toISOString().slice(0, 10), description: '', amount: '', counterparty: '', category_id: '', note: '' });

  const handleCreateTx = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTx.account_id || !newTx.description || !newTx.amount) return;
    await api.createTransaction({
      account_id: Number(newTx.account_id),
      date: newTx.date,
      description: newTx.description,
      amount: parseFloat(newTx.amount),
      counterparty: newTx.counterparty || undefined,
      category_id: newTx.category_id ? Number(newTx.category_id) : undefined,
      note: newTx.note || undefined,
    });
    setNewTx({ account_id: newTx.account_id, date: newTx.date, description: '', amount: '', counterparty: '', category_id: '', note: '' });
    load();
  };

  const columns: Column<any>[] = [
    {
      key: '_actions', label: 'Akcje', sortable: false, className: 'px-2 py-1 whitespace-nowrap',
      render: tx => (
        <>
          <button
            onClick={() => openSplit(tx.id)}
            className={`px-2 py-1 rounded text-xs font-medium ${tx.is_split ? 'bg-purple-100 text-purple-700 hover:bg-purple-200' : 'bg-blue-100 text-blue-700 hover:bg-blue-200'}`}
          >
            {tx.is_split ? 'Edytuj rozbicie' : 'Rozbij'}
          </button>
          {tx.is_split && (
            <button onClick={() => handleUnsplit(tx.id)} className="ml-1 px-2 py-1 rounded text-xs font-medium bg-red-100 text-red-700 hover:bg-red-200">Cofnij</button>
          )}
        </>
      ),
    },
    { key: 'date', label: 'Data', className: 'px-2 py-1 text-gray-500 whitespace-nowrap', render: tx => tx.date },
    { key: 'counterparty', label: 'Kontrahent', className: 'px-2 py-1 max-w-[180px] truncate text-gray-700', render: tx => <span title={tx.counterparty || ''}>{tx.counterparty || '-'}</span> },
    { key: 'description', label: 'Opis', className: 'px-2 py-1 max-w-[220px] truncate', render: tx => <span title={tx.description}>{tx.description}</span> },
    {
      key: 'amount', label: 'Kwota', headerClassName: 'text-right', className: 'px-2 py-1 text-right font-mono whitespace-nowrap',
      render: tx => <span className={tx.amount < 0 ? 'text-red-600' : 'text-green-600'}>{tx.amount.toFixed(2)}</span>,
    },
    {
      key: 'category_name', label: 'Kategoria',
      render: tx => {
        if (tx.is_split || tx.receipt_items?.length > 0) {
          const items = tx.is_split && tx.items?.length > 0 ? tx.items : tx.receipt_items || [];
          const total = items.length;
          const withCat = items.filter((i: any) => i.category_id).length;
          const allDone = total > 0 && withCat === total;
          return (
            <span className="flex items-center gap-1">
              <span className={`inline-block px-1.5 py-0.5 rounded-full text-[10px] font-medium ${tx.is_split ? 'bg-purple-100 text-purple-700' : 'bg-green-100 text-green-700'}`}>
                {tx.is_split ? 'Rozbita' : 'Paragon'}
              </span>
              <span className={`text-[10px] ${allDone ? 'text-green-500' : 'text-orange-500'}`} title={`${withCat}/${total} kategorii`}>
                {allDone ? '✓' : `${withCat}/${total}`}
              </span>
            </span>
          );
        }
        return <GroupedCategorySelect categories={categories} value={tx.category_id || ''} onChange={v => handleCategoryChange(tx.id, v)} className="border rounded px-1 py-0.5 text-xs" amount={tx.amount} />;
      },
    },
    {
      key: 'note', label: 'Notatka', sortable: false, className: 'px-2 py-1',
      render: tx => <NoteCell txId={tx.id} note={tx.note} onSave={(id, newNote) => setTransactions(prev => prev.map(t => t.id === id ? { ...t, note: newNote } : t))} />,
    },
    { key: 'type', label: 'Typ', className: 'px-2 py-1 text-xs text-gray-400 max-w-[140px] truncate', render: tx => <span title={tx.type || ''}>{tx.type || '-'}</span> },
    { key: 'account_name', label: 'Konto', className: 'px-2 py-1 text-xs text-gray-500 whitespace-nowrap', render: tx => tx.account_name },
  ];

  // Child row columns — keyed to match parent columns so they align
  const getChildRows = (tx: any) => {
    if (tx.is_split && tx.items?.length > 0) {
      return tx.items.map((item: any) => ({ ...item, _txId: tx.id, _type: 'split' }));
    }
    if (tx.receipt_items?.length > 0) {
      return tx.receipt_items.map((item: any) => ({ ...item, _receiptId: tx.receipt?.id, _type: 'receipt' }));
    }
    return undefined;
  };

  const childCols: Column<any>[] = [
    {
      key: 'description', label: '', className: 'px-2 py-0.5 text-xs text-gray-500 max-w-[220px] truncate',
      render: item => (
        <span title={item.description || item.name}>
          <span className="text-gray-400 mr-1">{item.product_name || (item.description || item.name)}</span>
          {item.product_name && item.product_name !== (item.description || item.name) && (
            <span className="text-gray-300 text-[10px]">({item.description || item.name})</span>
          )}
        </span>
      ),
    },
    {
      key: 'amount', label: '', headerClassName: 'text-right', className: 'px-2 py-0.5 text-right font-mono whitespace-nowrap text-xs',
      render: item => (
        <span className={Number(item.amount) < 0 ? 'text-red-400' : 'text-gray-500'}>
          {Number(item.amount).toFixed(2)}
          {item.quantity > 1 && <span className="text-gray-300 ml-1 text-[10px]">({item.quantity}x{Number(item.unit_price).toFixed(2)})</span>}
        </span>
      ),
    },
    {
      key: 'category_name', label: '', className: 'px-2 py-0.5 text-xs',
      render: item => item._type === 'split' ? (
        <GroupedCategorySelect
          categories={categories}
          value={item.category_id || ''}
          onChange={v => handleItemCategoryChange(item._txId, item.id, v)}
          className="border rounded px-1 py-0.5 text-xs"
          amount={Number(item.amount)}
        />
      ) : item._receiptId ? (
        <GroupedCategorySelect
          categories={categories}
          value={item.category_id || ''}
          onChange={v => handleReceiptItemCategoryChange(item._receiptId, item.id, v)}
          className="border rounded px-1 py-0.5 text-xs"
          amount={Number(item.amount)}
        />
      ) : (
        <span className="text-gray-300 text-xs">{item.category_name || 'brak'}</span>
      ),
    },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Transakcje</h1>

      <div className="bg-white rounded-lg shadow p-3 mb-2">
        <DateRangeSelector from={filters.from} to={filters.to} onChange={(f, t) => setFilters(prev => ({ ...prev, from: f, to: t }))} defaultPreset={filters.from ? 'custom' : 'month'} />
      </div>
      <div className="bg-white rounded-lg shadow p-3 mb-4 flex gap-3 flex-wrap items-end">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Konto</label>
          <select value={filters.account_id} onChange={e => setFilters(f => ({ ...f, account_id: e.target.value }))} className="border rounded px-2 py-1.5 text-sm">
            <option value="">Wszystkie</option>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.account_type === 'cash' ? '💵 ' : ''}{a.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Kategoria</label>
          {filters.category_id === 'none' ? (
            <div className="flex items-center gap-1">
              <span className="border rounded px-2 py-1.5 text-sm bg-gray-100 text-gray-600">Bez kategorii</span>
              <button onClick={() => setFilters(f => ({ ...f, category_id: '' }))} className="text-red-400 hover:text-red-600 text-xs">&#x2715;</button>
            </div>
          ) : (
            <GroupedCategorySelect categories={categories} value={filters.category_id} onChange={v => setFilters(f => ({ ...f, category_id: v }))} className="border rounded px-2 py-1.5 text-sm" placeholder="Wszystkie" />
          )}
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Kwota od</label>
          <input type="number" step="0.01" value={filters.amount_min} onChange={e => setFilters(f => ({ ...f, amount_min: e.target.value }))} className="border rounded px-2 py-1.5 text-sm w-28" placeholder="-500" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Kwota do</label>
          <input type="number" step="0.01" value={filters.amount_max} onChange={e => setFilters(f => ({ ...f, amount_max: e.target.value }))} className="border rounded px-2 py-1.5 text-sm w-28" placeholder="1000" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Szukaj</label>
          <input value={filters.search} onChange={e => setFilters(f => ({ ...f, search: e.target.value }))} className="border rounded px-2 py-1.5 text-sm" placeholder="opis, kontrahent, notatka..." />
        </div>
        {Object.values(filters).some(v => v) && (
          <button onClick={() => setFilters({ account_id: '', from: '', to: '', category_id: '', search: '', amount_min: '', amount_max: '' })} className="text-xs text-red-500 hover:text-red-700 self-end pb-2">Wyczyść filtry</button>
        )}
      </div>

      <div className="mb-4">
        <button onClick={() => setShowAddTx(v => !v)} className="text-xs text-blue-600 hover:text-blue-800 font-medium">
          {showAddTx ? '− Ukryj formularz' : '+ Dodaj transakcję ręcznie'}
        </button>
        {showAddTx && (
          <form onSubmit={handleCreateTx} className="bg-white rounded-lg shadow p-3 mt-2 flex gap-2 flex-wrap items-end">
            <div>
              <label className="block text-[10px] text-gray-400 mb-0.5">Konto</label>
              <select value={newTx.account_id} onChange={e => setNewTx(p => ({ ...p, account_id: e.target.value }))} required className="border rounded px-2 py-1 text-xs">
                <option value="">Wybierz...</option>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.account_type === 'cash' ? '💵 ' : ''}{a.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] text-gray-400 mb-0.5">Data</label>
              <input type="date" value={newTx.date} onChange={e => setNewTx(p => ({ ...p, date: e.target.value }))} required className="border rounded px-2 py-1 text-xs" />
            </div>
            <div>
              <label className="block text-[10px] text-gray-400 mb-0.5">Kwota</label>
              <input type="number" step="0.01" value={newTx.amount} onChange={e => setNewTx(p => ({ ...p, amount: e.target.value }))} required className="border rounded px-2 py-1 text-xs w-24" placeholder="-49.99" />
            </div>
            <div>
              <label className="block text-[10px] text-gray-400 mb-0.5">Kontrahent</label>
              <input value={newTx.counterparty} onChange={e => setNewTx(p => ({ ...p, counterparty: e.target.value }))} className="border rounded px-2 py-1 text-xs" placeholder="np. Sklep" />
            </div>
            <div>
              <label className="block text-[10px] text-gray-400 mb-0.5">Opis</label>
              <input value={newTx.description} onChange={e => setNewTx(p => ({ ...p, description: e.target.value }))} required className="border rounded px-2 py-1 text-xs w-40" placeholder="np. Zakupy spożywcze" />
            </div>
            <div>
              <label className="block text-[10px] text-gray-400 mb-0.5">Kategoria</label>
              <GroupedCategorySelect categories={categories} value={newTx.category_id} onChange={v => setNewTx(p => ({ ...p, category_id: v }))} className="border rounded px-1 py-1 text-xs" placeholder="opcjonalna" />
            </div>
            <div>
              <label className="block text-[10px] text-gray-400 mb-0.5">Notatka</label>
              <input value={newTx.note} onChange={e => setNewTx(p => ({ ...p, note: e.target.value }))} className="border rounded px-2 py-1 text-xs w-32" placeholder="opcjonalna" />
            </div>
            <button type="submit" className="bg-blue-600 text-white px-3 py-1 rounded text-xs hover:bg-blue-700">Dodaj</button>
          </form>
        )}
      </div>

      {selectedIds.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-2 mb-2 flex items-center gap-3 text-xs">
          <span className="text-blue-700 font-medium">Zaznaczono: {selectedIds.length} transakcji</span>
          <div className="flex items-center gap-1">
            <span className="text-gray-500">Kategoria:</span>
            <GroupedCategorySelect categories={categories} value={bulkCategoryId} onChange={setBulkCategoryId} placeholder="Wybierz..." />
            <button onClick={handleBulkCategory} disabled={!bulkCategoryId} className="px-2 py-0.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-30">Zastosuj</button>
          </div>
        </div>
      )}

      {selectedChildren.length > 0 && (
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-2 mb-2 flex items-center gap-3 text-xs">
          <span className="text-purple-700 font-medium">Zaznaczono: {selectedChildren.length} pozycji</span>
          <div className="flex items-center gap-1">
            <span className="text-gray-500">Kategoria:</span>
            <GroupedCategorySelect categories={categories} value={bulkChildCategoryId} onChange={setBulkChildCategoryId} placeholder="Wybierz..." />
            <button onClick={handleBulkChildCategory} disabled={!bulkChildCategoryId} className="px-2 py-0.5 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-30">Zastosuj</button>
          </div>
        </div>
      )}

      <DataTable
        data={transactions}
        columns={columns}
        getId={tx => tx.id}
        total={total}
        onFetch={load}
        selectable
        onSelectionChange={setSelectedIds}
        onDelete={handleDelete}
        deleteLabel="Usun zaznaczone"
        defaultSort={{ key: 'date', dir: 'desc' }}
        getChildRows={getChildRows}
        childColumns={childCols}
        childLabel={tx => tx.receipt ? `Paragon: ${tx.receipt.store_name} (${tx.receipt.receipt_date})` : tx.is_split ? 'Pozycje rozbicia:' : undefined}
        childSelectable
        onChildSelectionChange={setSelectedChildren}
        storageKey="transactions"
      />

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
