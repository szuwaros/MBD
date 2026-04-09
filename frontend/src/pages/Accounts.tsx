import { useEffect, useState } from 'react';
import { api } from '../api/client';
import DataTable, { Column } from '../components/DataTable';

const BANKS = [
  { id: 'pekao', label: 'PeKaO SA' },
  { id: 'pkobp', label: 'PKO BP' },
  { id: 'creditagricole', label: 'Credit Agricole' },
  { id: 'alior', label: 'Alior Bank' },
  { id: 'bnpparibas', label: 'BNP Paribas' },
  { id: 'mbank', label: 'mBank' },
  { id: 'ing', label: 'ING' },
  { id: 'santander', label: 'Santander' },
  { id: 'millennium', label: 'Millennium' },
  { id: 'other', label: 'Inny' },
];

const BANK_LABELS: Record<string, string> = { ...Object.fromEntries(BANKS.map(b => [b.id, b.label])), cash: 'Gotówka' };

export default function Accounts() {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editBank, setEditBank] = useState('');
  const [editBalance, setEditBalance] = useState('');
  const [editBalanceDate, setEditBalanceDate] = useState('');
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<'cash' | 'bank'>('cash');
  const [newBank, setNewBank] = useState('pekao');
  const [error, setError] = useState('');

  const load = () => api.getAccounts().then(setAccounts);
  useEffect(() => { load(); }, []);

  const startEdit = (a: any) => {
    setEditId(a.id);
    setEditName(a.name === a.account_number ? '' : a.name);
    setEditBank(a.bank);
    setEditBalance(String(a.initial_balance || 0));
    setEditBalanceDate(a.initial_balance_date || '');
  };

  const handleSave = async (id: number) => {
    await api.updateAccount(id, {
      name: editName.trim() || undefined,
      bank: editBank || undefined,
      initial_balance: parseFloat(editBalance) || 0,
      initial_balance_date: editBalanceDate || undefined,
    } as any);
    setEditId(null);
    load();
  };

  const handleDelete = async (ids: number[]) => {
    for (const id of ids) {
      try { await api.deleteAccount(id); } catch {}
    }
    load();
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!newName.trim()) { setError('Nazwa jest wymagana'); return; }
    try {
      await api.createAccount({
        name: newName.trim(),
        bank: newType === 'cash' ? 'cash' : newBank,
        account_type: newType,
      } as any);
      setNewName('');
      load();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent, id: number) => {
    if (e.key === 'Enter') handleSave(id);
    if (e.key === 'Escape') setEditId(null);
  };

  const columns: Column<any>[] = [
    {
      key: 'account_type', label: 'Typ', className: 'px-2 py-0.5 w-16',
      render: a => a.account_type === 'cash'
        ? <span className="text-xs text-amber-600 font-medium">Gotówka</span>
        : <span className="text-xs text-blue-600 font-medium">Bank</span>,
    },
    {
      key: 'name', label: 'Nazwa',
      render: a => editId === a.id
        ? <input value={editName} onChange={e => setEditName(e.target.value)} onKeyDown={e => handleKeyDown(e, a.id)} className="border rounded px-2 py-0.5 text-sm w-full" placeholder="Nazwa konta" autoFocus />
        : <span className="font-medium">{a.name === a.account_number ? <span className="text-amber-600 italic">Bez nazwy</span> : a.name}</span>,
    },
    {
      key: 'bank', label: 'Bank/Źródło',
      render: a => editId === a.id
        ? <select value={editBank} onChange={e => setEditBank(e.target.value)} className="border rounded px-1 py-0.5 text-xs">
            {a.account_type === 'cash' ? <option value="cash">Gotówka</option> : BANKS.map(b => <option key={b.id} value={b.id}>{b.label}</option>)}
          </select>
        : <span className="text-gray-500 text-xs">{BANK_LABELS[a.bank] || a.bank}</span>,
    },
    { key: 'account_number', label: 'Numer rachunku', className: 'px-2 py-0.5 text-gray-400 font-mono text-xs', render: a => a.account_number || '-' },
    {
      key: 'initial_balance', label: 'Saldo pocz.', headerClassName: 'text-right', className: 'px-2 py-0.5 text-right',
      render: a => editId === a.id
        ? <div className="flex gap-1 items-center justify-end">
            <input type="number" step="0.01" value={editBalance} onChange={e => setEditBalance(e.target.value)} className="border rounded px-1 py-0.5 text-xs w-20 text-right" placeholder="0.00" />
            <input type="date" value={editBalanceDate} onChange={e => setEditBalanceDate(e.target.value)} className="border rounded px-1 py-0.5 text-xs" />
          </div>
        : a.initial_balance_date
          ? <span className="text-xs text-gray-500 font-mono">{Number(a.initial_balance || 0).toFixed(2)} <span className="text-gray-300">({a.initial_balance_date})</span></span>
          : <span className="text-xs text-gray-300">-</span>,
    },
    { key: 'transaction_count', label: 'Transakcje', headerClassName: 'text-right', className: 'px-2 py-0.5 text-right', render: a => a.transaction_count },
    {
      key: '_actions', label: '', sortable: false, className: 'px-2 py-0.5 text-right space-x-2',
      render: a => editId === a.id ? (
        <>
          <button onClick={() => handleSave(a.id)} className="text-green-600 hover:text-green-800 text-xs">Zapisz</button>
          <button onClick={() => setEditId(null)} className="text-gray-500 hover:text-gray-700 text-xs">Anuluj</button>
        </>
      ) : (
        <button onClick={() => startEdit(a)} className="text-blue-500 hover:text-blue-700 text-xs">Edytuj</button>
      ),
    },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Konta</h1>

      <form onSubmit={handleCreate} className="bg-white rounded-lg shadow p-4 mb-4 flex gap-3 items-end flex-wrap">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Typ</label>
          <select value={newType} onChange={e => setNewType(e.target.value as any)} className="border rounded px-2 py-1.5 text-sm">
            <option value="cash">Gotówka</option>
            <option value="bank">Bank</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Nazwa</label>
          <input value={newName} onChange={e => setNewName(e.target.value)} className="border rounded px-2 py-1.5 text-sm" placeholder={newType === 'cash' ? 'np. Gotówka Michał' : 'np. Konto oszczędnościowe'} />
        </div>
        {newType === 'bank' && (
          <div>
            <label className="block text-xs text-gray-500 mb-1">Bank</label>
            <select value={newBank} onChange={e => setNewBank(e.target.value)} className="border rounded px-2 py-1.5 text-sm">
              {BANKS.map(b => <option key={b.id} value={b.id}>{b.label}</option>)}
            </select>
          </div>
        )}
        <button type="submit" className="bg-blue-600 text-white px-4 py-1.5 rounded text-sm hover:bg-blue-700">Dodaj konto</button>
        {error && <p className="text-red-500 text-sm">{error}</p>}
      </form>

      <p className="text-xs text-gray-400 mb-3">Konta bankowe tworzone automatycznie podczas importu CSV. Gotówkowe dodaj ręcznie.</p>

      <DataTable
        data={accounts}
        columns={columns}
        getId={a => a.id}
        selectable
        onDelete={handleDelete}
        deleteLabel="Usuń zaznaczone"
        defaultSort={{ key: 'name', dir: 'asc' }}
      />
    </div>
  );
}
