import { useEffect, useState, useCallback, useRef } from 'react';
import { api } from '../api/client';
import TransactionSplitModal from '../components/TransactionSplitModal';
import GroupedCategorySelect from '../components/GroupedCategorySelect';
import DataTable, { Column } from '../components/DataTable';

function NoteCell({ txId, note, onSave }: { txId: number; note: string | null; onSave: () => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(note || '');

  const save = async () => {
    await api.updateTransaction(txId, { note: value || null });
    setEditing(false);
    onSave();
  };

  if (editing) {
    return (
      <input
        value={value}
        onChange={e => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }}
        className="border rounded px-1 py-0.5 text-xs w-full"
        autoFocus
      />
    );
  }

  return (
    <span
      onClick={() => { setValue(note || ''); setEditing(true); }}
      className={`cursor-pointer text-xs block truncate max-w-[140px] ${note ? 'text-gray-600' : 'text-gray-300 italic hover:text-gray-400'}`}
      title={note || 'Kliknij aby dodać notatkę'}
    >
      {note || '+'}
    </span>
  );
}

export default function Transactions() {
  const [transactions, setTransactions] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [filters, setFilters] = useState({ account_id: '', from: '', to: '', category_id: '', search: '', amount_min: '', amount_max: '' });
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

  const handleDelete = async (ids: number[]) => {
    await api.deleteTransactions(ids);
    load();
  };

  const handleItemCategoryChange = async (txId: number, itemId: number, categoryId: string) => {
    const tx = transactions.find(t => t.id === txId);
    if (!tx?.items) return;
    const updatedItems = tx.items.map((item: any) =>
      item.id === itemId ? { ...item, category_id: categoryId ? Number(categoryId) : null } : item
    );
    await api.splitTransaction(txId, updatedItems.map((item: any) => ({
      description: item.description,
      amount: item.amount,
      category_id: item.category_id,
      product_name: item.product_name,
    })));
    load();
  };

  const handleReceiptItemCategoryChange = async (receiptId: number, itemId: number, categoryId: string) => {
    await api.updateReceiptItem(receiptId, itemId, { category_id: categoryId ? Number(categoryId) : null });
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
      render: tx => tx.is_split
        ? <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700">Rozbita</span>
        : tx.receipt_items?.length > 0
          ? <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">Paragon</span>
          : <GroupedCategorySelect categories={categories} value={tx.category_id || ''} onChange={v => handleCategoryChange(tx.id, v)} className="border rounded px-1 py-0.5 text-xs" />,
    },
    {
      key: 'note', label: 'Notatka', sortable: false, className: 'px-2 py-1',
      render: tx => <NoteCell txId={tx.id} note={tx.note} onSave={load} />,
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
      key: 'description', label: '', className: 'px-3 py-1.5 text-xs text-gray-500 max-w-[220px] truncate',
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
      key: 'amount', label: '', headerClassName: 'text-right', className: 'px-3 py-1.5 text-right font-mono whitespace-nowrap text-xs',
      render: item => (
        <span className={Number(item.amount) < 0 ? 'text-red-400' : 'text-gray-500'}>
          {Number(item.amount).toFixed(2)}
          {item.quantity > 1 && <span className="text-gray-300 ml-1 text-[10px]">({item.quantity}x{Number(item.unit_price).toFixed(2)})</span>}
        </span>
      ),
    },
    {
      key: 'category_name', label: '', className: 'px-3 py-1.5 text-xs',
      render: item => item._type === 'split' ? (
        <GroupedCategorySelect
          categories={categories}
          value={item.category_id || ''}
          onChange={v => handleItemCategoryChange(item._txId, item.id, v)}
          className="border rounded px-1 py-0.5 text-xs"
        />
      ) : item._receiptId ? (
        <GroupedCategorySelect
          categories={categories}
          value={item.category_id || ''}
          onChange={v => handleReceiptItemCategoryChange(item._receiptId, item.id, v)}
          className="border rounded px-1 py-0.5 text-xs"
        />
      ) : (
        <span className="text-gray-300 text-xs">{item.category_name || 'brak'}</span>
      ),
    },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Transakcje</h1>

      <div className="bg-white rounded-lg shadow p-4 mb-4 flex gap-3 flex-wrap items-end">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Konto</label>
          <select value={filters.account_id} onChange={e => setFilters(f => ({ ...f, account_id: e.target.value }))} className="border rounded px-2 py-1.5 text-sm">
            <option value="">Wszystkie</option>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Od</label>
          <input type="date" value={filters.from} onChange={e => setFilters(f => ({ ...f, from: e.target.value }))} className="border rounded px-2 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Do</label>
          <input type="date" value={filters.to} onChange={e => setFilters(f => ({ ...f, to: e.target.value }))} className="border rounded px-2 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Kategoria</label>
          <GroupedCategorySelect categories={categories} value={filters.category_id} onChange={v => setFilters(f => ({ ...f, category_id: v }))} className="border rounded px-2 py-1.5 text-sm" placeholder="Wszystkie" />
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
          <input value={filters.search} onChange={e => setFilters(f => ({ ...f, search: e.target.value }))} className="border rounded px-2 py-1.5 text-sm" placeholder="opis, kontrahent..." />
        </div>
      </div>

      <DataTable
        data={transactions}
        columns={columns}
        getId={tx => tx.id}
        total={total}
        onFetch={load}
        selectable
        onDelete={handleDelete}
        deleteLabel="Usun zaznaczone"
        defaultSort={{ key: 'date', dir: 'desc' }}
        getChildRows={getChildRows}
        childColumns={childCols}
        childLabel={tx => tx.receipt ? `Paragon: ${tx.receipt.store_name} (${tx.receipt.receipt_date})` : tx.is_split ? 'Pozycje rozbicia:' : undefined}
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
