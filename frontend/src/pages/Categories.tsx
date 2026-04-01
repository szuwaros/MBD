import { useEffect, useState } from 'react';
import { api } from '../api/client';

export default function Categories() {
  const [categories, setCategories] = useState<any[]>([]);
  const [name, setName] = useState('');
  const [color, setColor] = useState('#6b7280');
  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');
  const [error, setError] = useState('');

  const load = () => api.getCategories().then(setCategories);
  useEffect(() => { load(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await api.createCategory({ name, color });
      setName(''); setColor('#6b7280');
      load();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleUpdate = async (id: number) => {
    await api.updateCategory(id, { name: editName, color: editColor });
    setEditId(null);
    load();
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Usunąć kategorię? Transakcje stracą przypisanie.')) return;
    await api.deleteCategory(id);
    load();
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Kategorie</h1>

      <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-4 mb-6 flex gap-3 items-end">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Nazwa</label>
          <input value={name} onChange={e => setName(e.target.value)} required className="border rounded px-3 py-1.5 text-sm" placeholder="np. Edukacja" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Kolor</label>
          <input type="color" value={color} onChange={e => setColor(e.target.value)} className="h-8 w-12 border rounded cursor-pointer" />
        </div>
        <button type="submit" className="bg-blue-600 text-white px-4 py-1.5 rounded text-sm hover:bg-blue-700">Dodaj</button>
        {error && <p className="text-red-500 text-sm">{error}</p>}
      </form>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50"><tr><th className="text-left px-4 py-3">Kolor</th><th className="text-left px-4 py-3">Nazwa</th><th className="text-right px-4 py-3">Użycia</th><th className="px-4 py-3"></th></tr></thead>
          <tbody>
            {categories.map(c => (
              <tr key={c.id} className="border-t">
                <td className="px-4 py-3">
                  {editId === c.id ? (
                    <input type="color" value={editColor} onChange={e => setEditColor(e.target.value)} className="h-6 w-10 border rounded cursor-pointer" />
                  ) : (
                    <span className="inline-block w-6 h-6 rounded" style={{ backgroundColor: c.color }} />
                  )}
                </td>
                <td className="px-4 py-3">
                  {editId === c.id ? (
                    <input value={editName} onChange={e => setEditName(e.target.value)} className="border rounded px-2 py-1 text-sm" />
                  ) : (
                    <span className="font-medium">{c.name}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right text-gray-500">{c.usage_count}</td>
                <td className="px-4 py-3 text-right space-x-2">
                  {editId === c.id ? (
                    <>
                      <button onClick={() => handleUpdate(c.id)} className="text-green-600 hover:text-green-800 text-xs">Zapisz</button>
                      <button onClick={() => setEditId(null)} className="text-gray-500 hover:text-gray-700 text-xs">Anuluj</button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => { setEditId(c.id); setEditName(c.name); setEditColor(c.color); }} className="text-blue-500 hover:text-blue-700 text-xs">Edytuj</button>
                      <button onClick={() => handleDelete(c.id)} className="text-red-500 hover:text-red-700 text-xs">Usuń</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
