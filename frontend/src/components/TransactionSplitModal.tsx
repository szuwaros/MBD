import { useState } from 'react';
import { api } from '../api/client';
import GroupedCategorySelect from './GroupedCategorySelect';

interface SplitItem {
  description: string;
  amount: string;
  category_id: string;
  product_name: string;
}

interface Props {
  transaction: any;
  categories: any[];
  onClose: () => void;
  onSave: () => void;
}

export default function TransactionSplitModal({ transaction, categories, onClose, onSave }: Props) {
  const existingItems: SplitItem[] = transaction.items?.length > 0
    ? transaction.items.map((i: any) => ({
        description: i.description,
        amount: String(Math.abs(i.amount)),
        category_id: String(i.category_id || ''),
        product_name: i.product_name || '',
      }))
    : [{ description: '', amount: String(Math.abs(transaction.amount)), category_id: '', product_name: '' }];

  const [items, setItems] = useState<SplitItem[]>(existingItems);
  const [error, setError] = useState('');

  const totalAmount = Math.abs(transaction.amount);
  const itemsTotal = items.reduce((sum, i) => sum + (parseFloat(i.amount) || 0), 0);
  const remaining = totalAmount - itemsTotal;

  const updateItem = (index: number, field: keyof SplitItem, value: string) => {
    setItems(prev => prev.map((item, i) => i === index ? { ...item, [field]: value } : item));
  };

  const addItem = () => {
    setItems(prev => [...prev, { description: '', amount: remaining > 0 ? remaining.toFixed(2) : '0', category_id: '', product_name: '' }]);
  };

  const removeItem = (index: number) => {
    if (items.length <= 1) return;
    setItems(prev => prev.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    setError('');
    if (Math.abs(remaining) > 0.01) {
      setError(`Suma elementów (${itemsTotal.toFixed(2)}) musi być równa kwocie transakcji (${totalAmount.toFixed(2)})`);
      return;
    }

    const validItems = items.filter(i => i.description && parseFloat(i.amount) > 0);
    if (validItems.length === 0) {
      setError('Dodaj przynajmniej jeden element');
      return;
    }

    try {
      await api.splitTransaction(transaction.id, validItems.map(i => ({
        description: i.description,
        amount: transaction.amount < 0 ? -parseFloat(i.amount) : parseFloat(i.amount),
        category_id: i.category_id ? Number(i.category_id) : undefined,
        product_name: i.product_name || undefined,
      })));
      onSave();
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-auto">
        <div className="p-4 border-b">
          <h2 className="text-lg font-semibold">Rozbij transakcję</h2>
          <p className="text-sm text-gray-500 mt-1">{transaction.date} &mdash; {transaction.description}</p>
          <p className="text-sm font-mono mt-1">Kwota: <strong className={transaction.amount < 0 ? 'text-red-600' : 'text-green-600'}>{transaction.amount.toFixed(2)} PLN</strong></p>
        </div>

        <div className="p-4 space-y-3">
          {items.map((item, index) => (
            <div key={index} className="flex gap-2 items-start p-3 bg-gray-50 rounded">
              <div className="flex-1 space-y-2">
                <div className="flex gap-2">
                  <input
                    value={item.description}
                    onChange={e => updateItem(index, 'description', e.target.value)}
                    placeholder="Opis pozycji"
                    className="flex-1 border rounded px-2 py-1 text-sm"
                  />
                  <input
                    value={item.amount}
                    onChange={e => updateItem(index, 'amount', e.target.value)}
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Kwota"
                    className="w-28 border rounded px-2 py-1 text-sm text-right"
                  />
                </div>
                <div className="flex gap-2">
                  <GroupedCategorySelect
                    categories={categories}
                    value={item.category_id}
                    onChange={v => updateItem(index, 'category_id', v)}
                    className="flex-1 border rounded px-2 py-1 text-sm"
                    placeholder="Kategoria..."
                    amount={transaction.amount}
                  />
                  <input
                    value={item.product_name}
                    onChange={e => updateItem(index, 'product_name', e.target.value)}
                    placeholder="Nazwa produktu (opcjonalnie)"
                    className="flex-1 border rounded px-2 py-1 text-sm"
                  />
                </div>
              </div>
              <button onClick={() => removeItem(index)} className="text-red-400 hover:text-red-600 mt-1 text-lg leading-none">&times;</button>
            </div>
          ))}

          <div className="flex justify-between items-center text-sm">
            <button onClick={addItem} className="text-blue-600 hover:text-blue-800">+ Dodaj pozycję</button>
            <span className={`font-mono ${Math.abs(remaining) < 0.01 ? 'text-green-600' : 'text-red-600'}`}>
              Pozostało: {remaining.toFixed(2)} PLN
            </span>
          </div>
        </div>

        {error && <div className="mx-4 mb-2 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">{error}</div>}

        <div className="p-4 border-t flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 border rounded text-sm hover:bg-gray-50">Anuluj</button>
          <button onClick={handleSave} className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700">Zapisz rozbicie</button>
        </div>
      </div>
    </div>
  );
}
