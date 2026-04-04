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

const BANK_LABELS: Record<string, string> = Object.fromEntries(BANKS.map(b => [b.id, b.label]));

export default function Accounts() {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editBank, setEditBank] = useState('');

  const load = () => api.getAccounts().then(setAccounts);
  useEffect(() => { load(); }, []);

  const startEdit = (a: any) => {
    setEditId(a.id);
    setEditName(a.name === a.account_number ? '' : a.name);
    setEditBank(a.bank);
  };

  const handleSave = async (id: number) => {
    await api.updateAccount(id, { name: editName.trim() || undefined, bank: editBank || undefined });
    setEditId(null);
    load();
  };

  const handleDelete = async (ids: number[]) => {
    for (const id of ids) {
      try { await api.deleteAccount(id); } catch {}
    }
    load();
  };

  const handleKeyDown = (e: React.KeyboardEvent, id: number) => {
    if (e.key === 'Enter') handleSave(id);
    if (e.key === 'Escape') setEditId(null);
  };

  const columns: Column<any>[] = [
    {
      key: 'name', label: 'Nazwa',
      render: a => editId === a.id
        ? <input value={editName} onChange={e => setEditName(e.target.value)} onKeyDown={e => handleKeyDown(e, a.id)} className="border rounded px-2 py-1 text-sm w-full" placeholder="Nazwa konta" autoFocus />
        : <span className="font-medium">{a.name === a.account_number ? <span className="text-amber-600 italic">Bez nazwy</span> : a.name}</span>,
    },
    {
      key: 'bank', label: 'Bank',
      render: a => editId === a.id
        ? <select value={editBank} onChange={e => setEditBank(e.target.value)} className="border rounded px-2 py-1 text-sm">{BANKS.map(b => <option key={b.id} value={b.id}>{b.label}</option>)}</select>
        : <span className="text-gray-500">{BANK_LABELS[a.bank] || a.bank}</span>,
    },
    { key: 'account_number', label: 'Numer rachunku', className: 'px-2 py-1 text-gray-400 font-mono text-xs', render: a => a.account_number || '-' },
    { key: 'transaction_count', label: 'Transakcje', headerClassName: 'text-right', className: 'px-2 py-1 text-right', render: a => a.transaction_count },
    {
      key: '_actions', label: '', sortable: false, className: 'px-2 py-1 text-right space-x-2',
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
      <h1 className="text-2xl font-bold mb-6">Konta bankowe</h1>
      <p className="text-sm text-gray-500 mb-4">Konta tworzone automatycznie podczas importu CSV. Kliknij "Edytuj" aby zmienic nazwe i bank.</p>
      <DataTable
        data={accounts}
        columns={columns}
        getId={a => a.id}
        selectable
        onDelete={handleDelete}
        deleteLabel="Usun zaznaczone"
        defaultSort={{ key: 'name', dir: 'asc' }}
      />
    </div>
  );
}
