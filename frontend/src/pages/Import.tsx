import { useEffect, useState } from 'react';
import { api } from '../api/client';

export default function Import() {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [accountId, setAccountId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [result, setResult] = useState<any>(null);
  const [receiptResult, setReceiptResult] = useState<any>(null);
  const [error, setError] = useState('');
  const [imports, setImports] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.getAccounts().then(accs => {
      setAccounts(accs);
      if (accs.length > 0) setAccountId(String(accs[0].id));
    });
    api.getImports().then(setImports);
  }, []);

  const handleCsvImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !accountId) return;
    setError(''); setResult(null); setLoading(true);
    try {
      const res = await api.importCsv(file, Number(accountId));
      if (res.error) throw new Error(res.error);
      setResult(res);
      setFile(null);
      api.getImports().then(setImports);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleReceiptImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!receiptFile) return;
    setError(''); setReceiptResult(null); setLoading(true);
    try {
      const res = await api.importReceipt(receiptFile);
      if (res.error) throw new Error(res.error);
      setReceiptResult(res);
      setReceiptFile(null);
      api.getImports().then(setImports);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Import danych</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="bg-white rounded-lg shadow p-4">
          <h2 className="text-lg font-semibold mb-4">Import CSV z banku</h2>
          {accounts.length === 0 ? (
            <p className="text-gray-400">Najpierw dodaj konto w zakładce &quot;Konta&quot;</p>
          ) : (
            <form onSubmit={handleCsvImport} className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Konto</label>
                <select value={accountId} onChange={e => setAccountId(e.target.value)} className="border rounded px-3 py-1.5 text-sm w-full">
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.name} ({a.bank})</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Plik CSV</label>
                <input type="file" accept=".csv" onChange={e => setFile(e.target.files?.[0] || null)} className="text-sm" />
              </div>
              <button type="submit" disabled={!file || loading} className="bg-blue-600 text-white px-4 py-1.5 rounded text-sm hover:bg-blue-700 disabled:opacity-50">
                {loading ? 'Importowanie...' : 'Importuj CSV'}
              </button>
            </form>
          )}
          {result && (
            <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded text-sm">
              <p className="font-medium text-green-800">Import zakończony: {result.filename}</p>
              <p>Dodano: <strong>{result.imported}</strong> | Pominięto (duplikaty): <strong>{result.skipped}</strong> | Razem w pliku: {result.total}</p>
            </div>
          )}
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <h2 className="text-lg font-semibold mb-4">Import e-paragonu</h2>
          <form onSubmit={handleReceiptImport} className="space-y-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Plik e-paragonu (JSON)</label>
              <input type="file" accept=".json" onChange={e => setReceiptFile(e.target.files?.[0] || null)} className="text-sm" />
            </div>
            <button type="submit" disabled={!receiptFile || loading} className="bg-purple-600 text-white px-4 py-1.5 rounded text-sm hover:bg-purple-700 disabled:opacity-50">
              {loading ? 'Importowanie...' : 'Importuj e-paragon'}
            </button>
          </form>
          {receiptResult && (
            <div className="mt-4 p-3 bg-purple-50 border border-purple-200 rounded text-sm">
              <p className="font-medium text-purple-800">E-paragon zaimportowany</p>
              <p>Pozycji: <strong>{receiptResult.itemCount}</strong></p>
              {receiptResult.matchedTransactionId
                ? <p className="text-green-700">Automatycznie skojarzono z transakcją #{receiptResult.matchedTransactionId}</p>
                : <p className="text-gray-500">Nie znaleziono pasującej transakcji — można skojarzyć ręcznie w zakładce E-paragony</p>
              }
            </div>
          )}
        </div>
      </div>

      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">{error}</div>}

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <h2 className="text-lg font-semibold p-4 border-b">Historia importów</h2>
        <table className="w-full text-sm">
          <thead className="bg-gray-50"><tr><th className="text-left px-4 py-3">Data</th><th className="text-left px-4 py-3">Typ</th><th className="text-left px-4 py-3">Plik</th><th className="text-left px-4 py-3">Konto</th><th className="text-right px-4 py-3">Dodano</th><th className="text-right px-4 py-3">Pominięto</th></tr></thead>
          <tbody>
            {imports.map(i => (
              <tr key={i.id} className="border-t">
                <td className="px-4 py-3 text-gray-500">{new Date(i.imported_at).toLocaleString('pl')}</td>
                <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded text-xs ${i.type === 'csv' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>{i.type}</span></td>
                <td className="px-4 py-3 font-mono text-xs">{i.filename}</td>
                <td className="px-4 py-3">{i.account_name || '-'}</td>
                <td className="px-4 py-3 text-right text-green-600">{i.rows_imported}</td>
                <td className="px-4 py-3 text-right text-gray-400">{i.rows_skipped}</td>
              </tr>
            ))}
            {imports.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Brak importów</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
