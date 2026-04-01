import { useEffect, useState } from 'react';
import { api } from '../api/client';

const BANKS = [
  { id: 'pekao', label: 'PeKaO SA' },
  { id: 'pkobp', label: 'PKO BP' },
  { id: 'creditagricole', label: 'Credit Agricole' },
];

export default function Accounts() {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [name, setName] = useState('');
  const [bank, setBank] = useState('pekao');
  const [accountNumber, setAccountNumber] = useState('');
  const [error, setError] = useState('');

  const load = () => api.getAccounts().then(setAccounts);
  useEffect(() => { load(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await api.createAccount({ name, bank, account_number: accountNumber || undefined });
      setName(''); setAccountNumber('');
      load();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Usunąć konto?')) return;
    try {
      await api.deleteAccount(id);
      load();
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Konta bankowe</h1>

      <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-4 mb-6 flex gap-3 items-end flex-wrap">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Nazwa konta</label>
          <input value={name} onChange={e => setName(e.target.value)} required className="border rounded px-3 py-1.5 text-sm" placeholder="np. Konto główne" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Bank</label>
          <select value={bank} onChange={e => setBank(e.target.value)} className="border rounded px-3 py-1.5 text-sm">
            {BANKS.map(b => <option key={b.id} value={b.id}>{b.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Numer konta (opcjonalnie)</label>
          <input value={accountNumber} onChange={e => setAccountNumber(e.target.value)} className="border rounded px-3 py-1.5 text-sm" placeholder="XX XXXX XXXX ..." />
        </div>
        <button type="submit" className="bg-blue-600 text-white px-4 py-1.5 rounded text-sm hover:bg-blue-700">Dodaj konto</button>
        {error && <p className="text-red-500 text-sm">{error}</p>}
      </form>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50"><tr><th className="text-left px-4 py-3">Nazwa</th><th className="text-left px-4 py-3">Bank</th><th className="text-left px-4 py-3">Numer konta</th><th className="text-right px-4 py-3">Saldo</th><th className="text-right px-4 py-3">Transakcje</th><th className="px-4 py-3"></th></tr></thead>
          <tbody>
            {accounts.map(a => (
              <tr key={a.id} className="border-t">
                <td className="px-4 py-3 font-medium">{a.name}</td>
                <td className="px-4 py-3">{BANKS.find(b => b.id === a.bank)?.label || a.bank}</td>
                <td className="px-4 py-3 text-gray-500 font-mono text-xs">{a.account_number || '-'}</td>
                <td className="px-4 py-3 text-right font-mono">{a.current_balance?.toFixed(2) || '-'} PLN</td>
                <td className="px-4 py-3 text-right">{a.transaction_count}</td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => handleDelete(a.id)} className="text-red-500 hover:text-red-700 text-xs">Usuń</button>
                </td>
              </tr>
            ))}
            {accounts.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Brak kont</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
