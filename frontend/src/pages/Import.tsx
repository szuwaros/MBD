import { useEffect, useState } from 'react';
import { api } from '../api/client';

const BANK_FORMATS = [
  { id: 'pekao', label: 'PeKaO SA' },
  { id: 'pkobp', label: 'PKO BP' },
  { id: 'creditagricole', label: 'Credit Agricole' },
];

const TYPE_BADGES: Record<string, { bg: string; text: string; label: string }> = {
  csv: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'CSV' },
  receipt: { bg: 'bg-purple-100', text: 'text-purple-700', label: 'E-paragon' },
  'receipt-scan': { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Skan paragonu' },
};

export default function Import() {
  const [bank, setBank] = useState('pekao');
  const [file, setFile] = useState<File | null>(null);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [scanFile, setScanFile] = useState<File | null>(null);
  const [result, setResult] = useState<any>(null);
  const [receiptResult, setReceiptResult] = useState<any>(null);
  const [scanResult, setScanResult] = useState<any>(null);
  const [error, setError] = useState('');
  const [imports, setImports] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.getImports().then(setImports);
  }, []);

  const handleCsvImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !bank) return;
    setError(''); setResult(null); setLoading(true);
    try {
      const res = await api.importCsv(file, bank);
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

  const handleScanImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scanFile) return;
    setError(''); setScanResult(null); setLoading(true);
    try {
      const res = await api.scanReceipt(scanFile);
      if (res.error) throw new Error(res.error);
      setScanResult(res);
      setScanFile(null);
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* CSV Import */}
        <div className="bg-white rounded-lg shadow p-4">
          <h2 className="text-lg font-semibold mb-4">Import CSV z banku</h2>
          <form onSubmit={handleCsvImport} className="space-y-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Format pliku (bank)</label>
              <select value={bank} onChange={e => setBank(e.target.value)} className="border rounded px-3 py-1.5 text-sm w-full">
                {BANK_FORMATS.map(b => <option key={b.id} value={b.id}>{b.label}</option>)}
              </select>
              <p className="text-xs text-gray-400 mt-1">Konta tworzone automatycznie z pliku</p>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Plik CSV</label>
              <input type="file" accept=".csv" onChange={e => setFile(e.target.files?.[0] || null)} className="text-sm" />
            </div>
            <button type="submit" disabled={!file || loading} className="bg-blue-600 text-white px-4 py-1.5 rounded text-sm hover:bg-blue-700 disabled:opacity-50">
              {loading ? 'Importowanie...' : 'Importuj CSV'}
            </button>
          </form>
          {result && (
            <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded text-sm">
              <p className="font-medium text-green-800">Import zakonczony: {result.filename}</p>
              <p>Dodano: <strong>{result.imported}</strong> | Pominieto: <strong>{result.skipped}</strong></p>
              {result.accounts_found > 0 && <p>Kont: <strong>{result.accounts_found}</strong></p>}
            </div>
          )}
        </div>

        {/* Receipt Scan */}
        <div className="bg-white rounded-lg shadow p-4">
          <h2 className="text-lg font-semibold mb-4">Skanuj paragon</h2>
          <form onSubmit={handleScanImport} className="space-y-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Zdjecie paragonu (JPG, PNG)</label>
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={e => setScanFile(e.target.files?.[0] || null)} className="text-sm" />
              <p className="text-xs text-gray-400 mt-1">OCR + automatyczna kategoryzacja produktow</p>
            </div>
            <button type="submit" disabled={!scanFile || loading} className="bg-amber-600 text-white px-4 py-1.5 rounded text-sm hover:bg-amber-700 disabled:opacity-50">
              {loading ? 'Skanowanie...' : 'Skanuj paragon'}
            </button>
          </form>
          {scanResult && (
            <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded text-sm">
              <p className="font-medium text-amber-800">
                Paragon zeskanowany{scanResult.storeName && ` — ${scanResult.storeName}`}
              </p>
              {scanResult.receiptDate && <p>Data: {scanResult.receiptDate}</p>}
              {scanResult.totalAmount && <p>Suma: <strong>{scanResult.totalAmount.toFixed(2)} PLN</strong></p>}
              <p>Wykryto produktow: <strong>{scanResult.items.length}</strong></p>
              {scanResult.warning && <p className="text-amber-700 mt-1">{scanResult.warning}</p>}
              {scanResult.items.length > 0 && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-amber-700 hover:text-amber-900">Pokaz produkty</summary>
                  <table className="w-full mt-2 text-xs">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-1">Produkt</th>
                        <th className="text-right py-1">Ilosc</th>
                        <th className="text-right py-1">Kwota</th>
                        <th className="text-left py-1 pl-2">Kategoria</th>
                      </tr>
                    </thead>
                    <tbody>
                      {scanResult.items.map((item: any, i: number) => (
                        <tr key={i} className="border-b border-amber-100">
                          <td className="py-1">{item.name}</td>
                          <td className="text-right py-1">{item.quantity}</td>
                          <td className="text-right py-1">{item.amount.toFixed(2)}</td>
                          <td className="py-1 pl-2 text-gray-500">{item.category}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </details>
              )}
              {scanResult.rawText && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-gray-500 hover:text-gray-700 text-xs">Surowy tekst OCR</summary>
                  <pre className="mt-1 p-2 bg-gray-100 rounded text-xs whitespace-pre-wrap max-h-48 overflow-auto">{scanResult.rawText}</pre>
                </details>
              )}
            </div>
          )}
        </div>

        {/* E-receipt JSON */}
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
                ? <p className="text-green-700">Skojarzono z transakcja #{receiptResult.matchedTransactionId}</p>
                : <p className="text-gray-500">Nie znaleziono pasujacej transakcji</p>
              }
            </div>
          )}
        </div>
      </div>

      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">{error}</div>}

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <h2 className="text-lg font-semibold p-4 border-b">Historia importow</h2>
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-4 py-3">Data</th>
              <th className="text-left px-4 py-3">Typ</th>
              <th className="text-left px-4 py-3">Plik</th>
              <th className="text-right px-4 py-3">Dodano</th>
              <th className="text-right px-4 py-3">Pominieto</th>
            </tr>
          </thead>
          <tbody>
            {imports.map(i => {
              const badge = TYPE_BADGES[i.type] || TYPE_BADGES.csv;
              return (
                <tr key={i.id} className="border-t">
                  <td className="px-4 py-3 text-gray-500">{new Date(i.imported_at).toLocaleString('pl')}</td>
                  <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded text-xs ${badge.bg} ${badge.text}`}>{badge.label}</span></td>
                  <td className="px-4 py-3 font-mono text-xs">{i.filename}</td>
                  <td className="px-4 py-3 text-right text-green-600">{i.rows_imported}</td>
                  <td className="px-4 py-3 text-right text-gray-400">{i.rows_skipped}</td>
                </tr>
              );
            })}
            {imports.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">Brak importow</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
