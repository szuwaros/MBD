import { useEffect, useState } from 'react';
import { api } from '../api/client';

export default function Receipts() {
  const [receipts, setReceipts] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [matchTxId, setMatchTxId] = useState('');

  const load = () => api.getReceipts().then(setReceipts);
  useEffect(() => { load(); }, []);

  const openDetails = async (id: number) => {
    const data = await api.getReceipt(id);
    setSelected(data);
  };

  const handleMatch = async () => {
    if (!selected || !matchTxId) return;
    try {
      await api.matchReceipt(selected.id, Number(matchTxId));
      setSelected(null);
      setMatchTxId('');
      load();
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">E-paragony</h1>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-4 py-3">Data</th>
              <th className="text-left px-4 py-3">Sklep</th>
              <th className="text-right px-4 py-3">Kwota</th>
              <th className="text-left px-4 py-3">Transakcja</th>
              <th className="text-left px-4 py-3">Plik</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {receipts.map(r => (
              <tr key={r.id} className="border-t hover:bg-gray-50">
                <td className="px-4 py-2">{r.receipt_date || '-'}</td>
                <td className="px-4 py-2 font-medium">{r.store_name || '-'}</td>
                <td className="px-4 py-2 text-right font-mono">{r.total_amount?.toFixed(2) || '-'} PLN</td>
                <td className="px-4 py-2 text-xs">
                  {r.transaction_id ? (
                    <span className="text-green-600">Powiązano (#{r.transaction_id})</span>
                  ) : (
                    <span className="text-orange-500">Niepowiązano</span>
                  )}
                </td>
                <td className="px-4 py-2 text-xs text-gray-500 font-mono">{r.source_filename}</td>
                <td className="px-4 py-2 text-right">
                  <button onClick={() => openDetails(r.id)} className="text-blue-500 hover:text-blue-700 text-xs">Szczegóły</button>
                </td>
              </tr>
            ))}
            {receipts.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Brak e-paragonów</td></tr>}
          </tbody>
        </table>
      </div>

      {selected && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[80vh] overflow-auto">
            <div className="p-4 border-b">
              <h2 className="text-lg font-semibold">{selected.store_name || 'E-paragon'}</h2>
              <p className="text-sm text-gray-500">{selected.receipt_date} | Kwota: {selected.total_amount?.toFixed(2)} PLN</p>
            </div>
            <div className="p-4">
              <table className="w-full text-sm mb-4">
                <thead><tr className="border-b"><th className="text-left py-1">Produkt</th><th className="text-right py-1">Ilość</th><th className="text-right py-1">Cena</th><th className="text-right py-1">Kwota</th></tr></thead>
                <tbody>
                  {selected.items?.map((item: any, i: number) => (
                    <tr key={i} className="border-b">
                      <td className="py-1">{item.name}</td>
                      <td className="py-1 text-right">{item.quantity}</td>
                      <td className="py-1 text-right font-mono">{item.unit_price?.toFixed(2)}</td>
                      <td className="py-1 text-right font-mono">{item.amount.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {!selected.transaction_id && (
                <div className="flex gap-2 items-end">
                  <div className="flex-1">
                    <label className="block text-xs text-gray-500 mb-1">ID transakcji do skojarzenia</label>
                    <input value={matchTxId} onChange={e => setMatchTxId(e.target.value)} type="number" className="border rounded px-2 py-1 text-sm w-full" placeholder="np. 42" />
                  </div>
                  <button onClick={handleMatch} className="bg-green-600 text-white px-3 py-1 rounded text-sm hover:bg-green-700">Skojarz</button>
                </div>
              )}
            </div>
            <div className="p-4 border-t flex justify-end">
              <button onClick={() => setSelected(null)} className="px-4 py-2 border rounded text-sm hover:bg-gray-50">Zamknij</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
