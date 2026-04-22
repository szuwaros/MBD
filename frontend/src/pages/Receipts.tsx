import { useEffect, useState } from 'react';
import { api } from '../api/client';
import DataTable, { Column } from '../components/DataTable';
import GroupedCategorySelect from '../components/GroupedCategorySelect';

export default function Receipts() {
  const [receipts, setReceipts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [matchTxId, setMatchTxId] = useState('');
  const [matchSearch, setMatchSearch] = useState('');
  const [matchResults, setMatchResults] = useState<any[]>([]);
  const [editItemId, setEditItemId] = useState<number | null>(null);
  const [editItem, setEditItem] = useState<any>({});
  const [newItem, setNewItem] = useState<{ name: string; amount: string } | null>(null);
  const [reparsing, setReparsing] = useState(false);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [showProfiles, setShowProfiles] = useState(false);

  const load = () => api.getReceipts().then(setReceipts);
  useEffect(() => { load(); api.getCategories().then(setCategories); api.getReceiptProfiles().then(setProfiles); }, []);

  const openDetails = async (id: number) => {
    const data = await api.getReceipt(id);
    setSelected(data);
    setMatchTxId('');
    setMatchSearch('');
    setMatchResults([]);
    setEditItemId(null);
    setNewItem(null);
    if (!data.transaction_id && (data.total_amount || data.receipt_date)) {
      const params: Record<string, string> = { limit: '10', offset: '0' };
      if (data.total_amount) params.amount_match = String(Math.abs(data.total_amount));
      if (data.receipt_date) params.date_match = data.receipt_date;
      const res = await api.getTransactions(params);
      setMatchResults(res.data);
    }
  };

  const refreshSelected = async () => {
    if (!selected) return;
    const data = await api.getReceipt(selected.id);
    setSelected(data);
    load();
  };

  const handleMatch = async (txId?: number) => {
    const id = txId || Number(matchTxId);
    if (!selected || !id) return;
    try {
      await api.matchReceipt(selected.id, id);
      setSelected(null);
      load();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleReparse = async () => {
    if (!selected) return;
    setReparsing(true);
    try {
      const updated = await api.reparseReceipt(selected.id);
      setSelected(updated);
      load();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setReparsing(false);
    }
  };

  const handleDeleteItem = async (itemId: number) => {
    if (!selected) return;
    await api.deleteReceiptItem(selected.id, itemId);
    refreshSelected();
  };

  const handleUpdateItem = async () => {
    if (!selected || !editItemId) return;
    await api.updateReceiptItem(selected.id, editItemId, editItem);
    setEditItemId(null);
    refreshSelected();
  };

  const handleCategoryChange = async (itemId: number, categoryId: string) => {
    if (!selected) return;
    await api.updateReceiptItem(selected.id, itemId, { category_id: categoryId ? Number(categoryId) : null });
    refreshSelected();
  };

  const handleAddItem = async () => {
    if (!selected || !newItem?.name || !newItem?.amount) return;
    await api.addReceiptItem(selected.id, { name: newItem.name, amount: parseFloat(newItem.amount) });
    setNewItem(null);
    refreshSelected();
  };

  const searchTransactions = async () => {
    if (!selected) return;
    const params: Record<string, string> = { limit: '10', offset: '0' };
    if (matchSearch) {
      // If input looks like a number, search by amount; otherwise by text
      const num = parseFloat(matchSearch.replace(',', '.'));
      if (!isNaN(num)) {
        params.amount_match = String(Math.abs(num));
        if (selected.receipt_date) params.date_match = selected.receipt_date;
      } else {
        params.search = matchSearch;
      }
    } else {
      if (selected.total_amount) params.amount_match = String(Math.abs(selected.total_amount));
      if (selected.receipt_date) params.date_match = selected.receipt_date;
    }
    const res = await api.getTransactions(params);
    setMatchResults(res.data);
  };

  const handleDelete = async (ids: number[]) => {
    for (const id of ids) {
      try { await api.deleteReceipt(id); } catch {}
    }
    load();
  };

  const columns: Column<any>[] = [
    {
      key: '_actions', label: '', sortable: false, className: 'px-2 py-0.5',
      render: r => <button onClick={() => openDetails(r.id)} className="px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700 hover:bg-blue-200">Podgląd</button>,
    },
    { key: 'receipt_date', label: 'Data', render: r => r.receipt_date || '-' },
    { key: 'store_name', label: 'Sklep', render: r => r.store_name ? <span className="font-medium">{r.store_name}</span> : <span className="text-gray-400 italic">Nieznany</span> },
    { key: 'total_amount', label: 'Kwota', headerClassName: 'text-right', className: 'px-2 py-0.5 text-right font-mono', render: r => r.total_amount ? `${r.total_amount.toFixed(2)} PLN` : '-' },
    { key: 'item_count', label: 'Pozycje', headerClassName: 'text-right', className: 'px-2 py-0.5 text-right text-gray-500', render: r => r.item_count || '-' },
    {
      key: 'transaction_id', label: 'Transakcja',
      render: r => r.transaction_id
        ? <span className="text-green-600 text-xs">Powiązano (#{r.transaction_id})</span>
        : <span className="text-orange-500 text-xs">Niepowiązano</span>,
    },
    { key: 'source_filename', label: 'Plik', className: 'px-2 py-0.5 text-xs text-gray-400 font-mono', render: r => r.source_filename },
    { key: 'created_at', label: 'Import', className: 'px-2 py-0.5 text-xs text-gray-400', render: r => r.created_at ? r.created_at.substring(0, 10) : '-' },
  ];

  const itemsSum = selected?.items?.reduce((s: number, i: any) => s + i.amount, 0) || 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Paragony</h1>
        <button onClick={() => setShowProfiles(!showProfiles)} className="text-xs text-blue-500 hover:text-blue-700">
          {showProfiles ? 'Ukryj profile' : 'Profile paragonów'}
        </button>
      </div>

      {showProfiles && (
        <div className="bg-white rounded-lg shadow p-4 mb-4">
          <h2 className="text-sm font-semibold mb-2">Profile parsowania paragonów</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-gray-500">
                  <th className="text-left py-1 px-2">Profil</th>
                  <th className="text-left py-1 px-2">Format daty</th>
                  <th className="text-left py-1 px-2">Początek produktów</th>
                  <th className="text-left py-1 px-2">Koniec produktów</th>
                  <th className="text-left py-1 px-2">Prefiks nazwy</th>
                  <th className="text-left py-1 px-2">Sufiks VAT (cena)</th>
                  <th className="text-left py-1 px-2">Format sztuk</th>
                  <th className="text-left py-1 px-2">Upusty</th>
                  <th className="text-left py-1 px-2">Nagłówek</th>
                  <th className="text-left py-1 px-2">Format sumy</th>
                </tr>
              </thead>
              <tbody>
                {profiles.map(p => (
                  <tr key={p.name} className="border-t hover:bg-gray-50">
                    <td className="py-1 px-2 font-medium whitespace-nowrap">{p.name}</td>
                    <td className="py-1 px-2 text-gray-500">{p.desc?.dateFormat || '-'}</td>
                    <td className="py-1 px-2 font-mono text-gray-400 text-[10px]">{p.desc?.productStartText || '-'}</td>
                    <td className="py-1 px-2 font-mono text-gray-400 text-[10px]">{p.desc?.productEndText || '-'}</td>
                    <td className="py-1 px-2 font-mono text-gray-400 text-[10px]">{p.desc?.namePrefixText || '-'}</td>
                    <td className="py-1 px-2">
                      <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] ${p.vatSuffix === 'spaced' ? 'bg-blue-50 text-blue-600' : p.vatSuffix === 'merged' ? 'bg-amber-50 text-amber-600' : 'bg-gray-50 text-gray-500'}`}>
                        {p.desc?.vatSuffixText || (p.vatSuffix === 'spaced' ? '14,99 A' : p.vatSuffix === 'merged' ? '14,99A' : 'brak')}
                      </span>
                    </td>
                    <td className="py-1 px-2 font-mono text-gray-400 text-[10px]">{p.desc?.qtyFormat || '-'}</td>
                    <td className="py-1 px-2">
                      <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] ${p.discountMode === 'apply' ? 'bg-green-50 text-green-600' : 'bg-gray-50 text-gray-500'}`}>
                        {p.discountMode === 'apply' ? 'pomniejsza cenę' : 'pomijany'}
                      </span>
                    </td>
                    <td className="py-1 px-2 text-gray-400 text-[10px]">{p.desc?.headerFormat || '-'}</td>
                    <td className="py-1 px-2 font-mono text-gray-400 text-[10px]">{p.desc?.totalFormat || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <DataTable
        data={receipts}
        columns={columns}
        getId={r => r.id}
        selectable
        onDelete={handleDelete}
        deleteLabel="Usuń zaznaczone"
        defaultSort={{ key: 'receipt_date', dir: 'desc' }}
      />

      {selected && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] overflow-auto">
            <div className="p-4 border-b">
              <div className="flex items-start justify-between mb-2">
                <div className="flex gap-3 items-center flex-wrap">
                  <div>
                    <label className="block text-[10px] text-gray-400">Sklep</label>
                    <input
                      value={selected.store_name || ''}
                      onChange={e => setSelected({ ...selected, store_name: e.target.value })}
                      onBlur={e => api.updateReceipt(selected.id, { store_name: e.target.value }).then(() => load())}
                      className="border rounded px-2 py-0.5 text-sm font-semibold w-40"
                      placeholder="Nazwa sklepu"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-gray-400">Data</label>
                    <input
                      type="date"
                      value={selected.receipt_date || ''}
                      onChange={e => { setSelected({ ...selected, receipt_date: e.target.value }); api.updateReceipt(selected.id, { receipt_date: e.target.value }).then(() => load()); }}
                      className="border rounded px-2 py-0.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-gray-400">Suma</label>
                    <input
                      type="number" step="0.01"
                      value={selected.total_amount || ''}
                      onChange={e => setSelected({ ...selected, total_amount: parseFloat(e.target.value) || 0 })}
                      onBlur={e => api.updateReceipt(selected.id, { total_amount: parseFloat(e.target.value) || 0 }).then(() => load())}
                      className="border rounded px-2 py-0.5 text-sm font-mono w-24"
                    />
                  </div>
                  <span className="text-xs text-gray-400 self-end">{selected.source_filename}</span>
                  {selected.profileUsed && (
                    <span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded self-end" title="Profil parsowania">
                      Profil: {selected.profileUsed}
                    </span>
                  )}
                </div>
                <button
                  onClick={handleReparse}
                  disabled={reparsing}
                  className="px-3 py-0.5.5 bg-amber-100 text-amber-700 rounded text-xs font-medium hover:bg-amber-200 disabled:opacity-50 shrink-0"
                >
                  {reparsing ? 'Interpretuję...' : 'Ponów interpretację'}
                </button>
              </div>
            </div>

            <div className="p-4">
              {selected.items?.length > 0 ? (
                <table className="w-full text-sm mb-3">
                  <thead>
                    <tr className="border-b text-gray-500 text-xs">
                      <th className="w-6"></th>
                      <th className="text-left py-0.5">Produkt</th>
                      <th className="text-right py-0.5 w-14">Ilość</th>
                      <th className="text-right py-0.5 w-20">Cena j.</th>
                      <th className="text-right py-0.5 w-20">Kwota</th>
                      <th className="text-left py-0.5 pl-2 w-36">Kategoria</th>
                      <th className="w-14"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {selected.items.map((item: any) => (
                      <tr key={item.id} className="border-b hover:bg-gray-50">
                        {editItemId === item.id ? (
                          <>
                            <td className="py-0.5"><button onClick={() => setEditItemId(null)} className="text-gray-400 text-xs">&#x2715;</button></td>
                            <td className="py-0.5"><input value={editItem.name} onChange={e => setEditItem({ ...editItem, name: e.target.value })} className="border rounded px-1 py-0.5 text-xs w-full" /></td>
                            <td className="py-0.5"><input type="number" value={editItem.quantity} onChange={e => setEditItem({ ...editItem, quantity: parseFloat(e.target.value) })} className="border rounded px-1 py-0.5 text-xs w-14 text-right" step="1" /></td>
                            <td className="py-0.5"><input type="number" value={editItem.unit_price} onChange={e => setEditItem({ ...editItem, unit_price: parseFloat(e.target.value) })} className="border rounded px-1 py-0.5 text-xs w-20 text-right" step="0.01" /></td>
                            <td className="py-0.5"><input type="number" value={editItem.amount} onChange={e => setEditItem({ ...editItem, amount: parseFloat(e.target.value) })} className="border rounded px-1 py-0.5 text-xs w-20 text-right" step="0.01" /></td>
                            <td className="py-0.5 pl-2">
                              <GroupedCategorySelect categories={categories} value={editItem.category_id || ''} onChange={v => setEditItem({ ...editItem, category_id: v ? Number(v) : null })} className="border rounded px-1 py-0.5 text-xs w-full" amount={-1} />
                            </td>
                            <td className="py-0.5 text-right">
                              <button onClick={handleUpdateItem} className="text-green-600 text-xs font-medium">Zapisz</button>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="py-0.5">
                              <button onClick={() => handleDeleteItem(item.id)} className="text-red-400 hover:text-red-600 text-xs leading-none">&#x2715;</button>
                            </td>
                            <td className="py-0.5 font-medium text-xs cursor-pointer hover:bg-blue-50" onClick={() => { setEditItemId(item.id); setEditItem({ name: item.name, quantity: item.quantity, unit_price: item.unit_price, amount: item.amount, category_id: item.category_id }); }}>{item.name}</td>
                            <td className="py-0.5 text-right text-gray-500 text-xs">{item.quantity}</td>
                            <td className="py-0.5 text-right font-mono text-xs">{item.unit_price?.toFixed(2) ?? '-'}</td>
                            <td className="py-0.5 text-right font-mono text-xs">{item.amount.toFixed(2)}</td>
                            <td className="py-0.5 pl-2">
                              <GroupedCategorySelect categories={categories} value={item.category_id || ''} onChange={v => handleCategoryChange(item.id, v)} className="border rounded px-1 py-0.5 text-xs w-full" amount={-1} />
                            </td>
                            <td className="py-0.5 text-right">
                              <button onClick={() => { setEditItemId(item.id); setEditItem({ name: item.name, quantity: item.quantity, unit_price: item.unit_price, amount: item.amount, category_id: item.category_id }); }} className="text-blue-500 text-xs">Edytuj</button>
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                    {/* Add new item row */}
                    {newItem ? (
                      <tr className="border-b bg-green-50/50">
                        <td className="py-0.5"><button onClick={() => setNewItem(null)} className="text-gray-400 text-xs">&#x2715;</button></td>
                        <td className="py-0.5"><input value={newItem.name} onChange={e => setNewItem({ ...newItem, name: e.target.value })} className="border rounded px-1 py-0.5 text-xs w-full" placeholder="Nazwa" autoFocus /></td>
                        <td colSpan={2}></td>
                        <td className="py-0.5"><input type="number" value={newItem.amount} onChange={e => setNewItem({ ...newItem, amount: e.target.value })} className="border rounded px-1 py-0.5 text-xs w-20 text-right" step="0.01" placeholder="0.00" /></td>
                        <td></td>
                        <td className="py-0.5 text-right"><button onClick={handleAddItem} className="text-green-600 text-xs font-medium">Dodaj</button></td>
                      </tr>
                    ) : (
                      <tr>
                        <td colSpan={7} className="py-0.5">
                          <button onClick={() => setNewItem({ name: '', amount: '' })} className="text-xs text-blue-500 hover:text-blue-700">+ Dodaj pozycję</button>
                        </td>
                      </tr>
                    )}
                  </tbody>
                  <tfoot>
                    <tr className="border-t font-medium text-xs">
                      <td></td>
                      <td colSpan={3} className="py-0.5 text-right">Suma pozycji:</td>
                      <td className={`py-0.5 text-right font-mono ${Math.abs(itemsSum - (selected.total_amount || 0)) > 0.1 ? 'text-red-600' : ''}`}>
                        {itemsSum.toFixed(2)}
                      </td>
                      <td colSpan={2} className="py-0.5 text-xs text-gray-400 pl-2">
                        {selected.total_amount && Math.abs(itemsSum - selected.total_amount) > 0.1 && (
                          <span>paragon: {selected.total_amount.toFixed(2)} (różnica: {(itemsSum - selected.total_amount).toFixed(2)})</span>
                        )}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              ) : (
                <div className="text-gray-400 text-sm mb-4 flex items-center gap-3">
                  <span>Brak wykrytych pozycji</span>
                  <button onClick={() => setNewItem({ name: '', amount: '' })} className="text-xs text-blue-500 hover:text-blue-700">+ Dodaj ręcznie</button>
                </div>
              )}

              {selected.raw_data && (
                <details className="mb-4">
                  <summary className="cursor-pointer text-xs text-gray-500 hover:text-gray-700">Surowy tekst OCR ({selected.raw_data.split('\n').length} linii)</summary>
                  <pre className="mt-2 p-3 bg-gray-50 rounded text-xs whitespace-pre-wrap max-h-60 overflow-auto border font-mono">{selected.raw_data}</pre>
                </details>
              )}

              {!selected.transaction_id && (
                <div className="border-t pt-3">
                  <h3 className="text-sm font-semibold mb-2">Skojarz z transakcją</h3>
                  <div className="flex gap-2 mb-2">
                    <input value={matchSearch} onChange={e => setMatchSearch(e.target.value)} className="flex-1 border rounded px-2 py-0.5 text-sm" placeholder="Kwota (np. 144.07) lub kontrahent..." onKeyDown={e => e.key === 'Enter' && searchTransactions()} />
                    <button onClick={searchTransactions} className="px-3 py-0.5 bg-gray-100 border rounded text-sm hover:bg-gray-200">Szukaj</button>
                  </div>
                  {matchResults.length === 0 && !matchSearch && (
                    <p className="text-xs text-gray-400 mb-2">Automatyczne dopasowanie wg kwoty {selected.total_amount?.toFixed(2)} i daty {selected.receipt_date}</p>
                  )}
                  {matchResults.length > 0 && (
                    <div className="max-h-40 overflow-auto border rounded mb-2">
                      {matchResults.map((tx: any) => (
                        <div key={tx.id} className="flex items-center justify-between px-2 py-0.5 border-b hover:bg-gray-50 text-xs">
                          <div>
                            <span className="text-gray-500">{tx.date}</span>
                            <span className="ml-2">{tx.counterparty || tx.description}</span>
                            <span className={`ml-2 font-mono ${tx.amount < 0 ? 'text-red-600' : 'text-green-600'}`}>{tx.amount.toFixed(2)}</span>
                          </div>
                          <button onClick={() => handleMatch(tx.id)} className="px-2 py-0.5 bg-green-100 text-green-700 rounded hover:bg-green-200">Skojarz</button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2 items-center text-xs text-gray-400">
                    <span>lub wpisz ID:</span>
                    <input value={matchTxId} onChange={e => setMatchTxId(e.target.value)} type="number" className="border rounded px-2 py-0.5 text-sm w-24" />
                    <button onClick={() => handleMatch()} disabled={!matchTxId} className="px-2 py-0.5 bg-green-600 text-white rounded text-xs hover:bg-green-700 disabled:opacity-30">Skojarz</button>
                  </div>
                </div>
              )}

              {selected.transaction_id && (
                <div className="border-t pt-3 text-sm text-green-700">
                  Powiązano z transakcją #{selected.transaction_id}
                  {selected.transaction_description && <span className="text-gray-500 ml-2">({selected.transaction_description})</span>}
                </div>
              )}
            </div>

            <div className="p-3 border-t flex justify-end">
              <button onClick={() => setSelected(null)} className="px-4 py-0.5 border rounded text-sm hover:bg-gray-50">Zamknij</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
