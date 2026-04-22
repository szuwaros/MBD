import { useEffect, useState } from 'react';
import { api } from '../api/client';
import CategoryIcon from '../components/CategoryIcon';

const TYPE_LABELS: Record<string, string> = {
  expense: 'Wydatek',
  income: 'Wpływ',
  transfer: 'Transfer',
};

export default function Categories() {
  const [categories, setCategories] = useState<any[]>([]);
  const [groups, setGroups] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [color, setColor] = useState('#6b7280');
  const [catType, setCatType] = useState('expense');
  const [groupName, setGroupName] = useState('');
  const [newGroup, setNewGroup] = useState('');
  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');
  const [editCatType, setEditCatType] = useState('expense');
  const [editGroup, setEditGroup] = useState('');
  const [error, setError] = useState('');

  const load = () => {
    api.getCategories().then(setCategories);
    api.getCategoryGroups().then(setGroups);
  };
  useEffect(() => { load(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const finalGroup = newGroup.trim() || groupName || undefined;
    try {
      await api.createCategory({ name, color, cat_type: catType, group_name: finalGroup });
      setName(''); setColor('#6b7280'); setCatType('expense'); setGroupName(''); setNewGroup('');
      load();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleUpdate = async (id: number) => {
    await api.updateCategory(id, { name: editName, color: editColor, cat_type: editCatType, group_name: editGroup || undefined });
    setEditId(null);
    load();
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Usunąć kategorię?')) return;
    await api.deleteCategory(id);
    load();
  };

  const handleMoveCategory = async (id: number, direction: 'up' | 'down') => {
    await api.moveCategory(id, direction);
    load();
  };

  const handleMoveGroup = async (group: string, direction: 'up' | 'down') => {
    await api.moveGroup(group, direction);
    load();
  };

  // Group categories by group_name (preserving DB sort order)
  const grouped: [string, any[]][] = [];
  const groupMap = new Map<string, any[]>();
  for (const c of categories) {
    const g = c.group_name || 'Bez grupy';
    if (!groupMap.has(g)) {
      groupMap.set(g, []);
      grouped.push([g, groupMap.get(g)!]);
    }
    groupMap.get(g)!.push(c);
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Kategorie</h1>

      <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-4 mb-6 flex gap-3 items-end flex-wrap">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Grupa</label>
          <select value={newGroup ? '__new__' : groupName} onChange={e => { if (e.target.value === '__new__') { setNewGroup(' '); setGroupName(''); } else { setGroupName(e.target.value); setNewGroup(''); } }} className="border rounded px-2 py-1.5 text-sm">
            <option value="">- brak -</option>
            {groups.map(g => <option key={g} value={g}>{g}</option>)}
            <option value="__new__">+ Nowa grupa...</option>
          </select>
        </div>
        {newGroup !== '' && (
          <div>
            <label className="block text-xs text-gray-500 mb-1">Nowa grupa</label>
            <input value={newGroup.trim() ? newGroup : ''} onChange={e => setNewGroup(e.target.value)} className="border rounded px-2 py-1.5 text-sm" placeholder="np. Dom i mieszkanie" autoFocus />
          </div>
        )}
        <div>
          <label className="block text-xs text-gray-500 mb-1">Nazwa kategorii</label>
          <input value={name} onChange={e => setName(e.target.value)} required className="border rounded px-2 py-1.5 text-sm" placeholder="np. Artykuły spożywcze" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Typ</label>
          <select value={catType} onChange={e => setCatType(e.target.value)} className="border rounded px-2 py-1.5 text-sm">
            <option value="expense">Wydatek</option>
            <option value="income">Wpływ</option>
            <option value="transfer">Transfer</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Kolor</label>
          <input type="color" value={color} onChange={e => setColor(e.target.value)} className="h-8 w-10 border rounded cursor-pointer" />
        </div>
        <button type="submit" className="bg-blue-600 text-white px-4 py-1.5 rounded text-sm hover:bg-blue-700">Dodaj</button>
        {error && <p className="text-red-500 text-sm">{error}</p>}
      </form>

      <div className="space-y-4">
        {grouped.map(([group, cats], groupIdx) => (
          <div key={group} className="bg-white rounded-lg shadow">
            <div className="px-4 py-2 bg-gray-50 border-b rounded-t-lg flex items-center gap-2">
              <div className="flex flex-col mr-1">
                <button onClick={() => handleMoveGroup(group, 'up')} disabled={groupIdx === 0} className="text-gray-400 hover:text-gray-600 disabled:opacity-20 text-[10px] leading-none">&#9650;</button>
                <button onClick={() => handleMoveGroup(group, 'down')} disabled={groupIdx === grouped.length - 1} className="text-gray-400 hover:text-gray-600 disabled:opacity-20 text-[10px] leading-none">&#9660;</button>
              </div>
              <CategoryIcon name={group} group size={18} className="text-gray-500" />
              <h3 className="font-semibold text-sm text-gray-700">{group}</h3>
              <span className="text-xs text-gray-400 ml-auto">{cats.length} kat.</span>
            </div>
            <table className="w-full text-sm">
              <tbody>
                {cats.map((c: any, catIdx: number) => (
                  <tr key={c.id} className="border-t hover:bg-gray-50">
                    <td className="px-1 py-0.5 w-6">
                      <div className="flex flex-col items-center">
                        <button onClick={() => handleMoveCategory(c.id, 'up')} disabled={catIdx === 0} className="text-gray-300 hover:text-gray-500 disabled:opacity-20 text-[10px] leading-none">&#9650;</button>
                        <button onClick={() => handleMoveCategory(c.id, 'down')} disabled={catIdx === cats.length - 1} className="text-gray-300 hover:text-gray-500 disabled:opacity-20 text-[10px] leading-none">&#9660;</button>
                      </div>
                    </td>
                    <td className="px-2 py-0.5 w-10">
                      {editId === c.id
                        ? <input type="color" value={editColor} onChange={e => setEditColor(e.target.value)} className="h-6 w-8 border rounded cursor-pointer" />
                        : <span className="inline-block w-5 h-5 rounded" style={{ backgroundColor: c.color }} />}
                    </td>
                    <td className="px-2 py-0.5 w-8">
                      <CategoryIcon name={c.name} size={16} color={c.color} />
                    </td>
                    <td className="px-2 py-0.5">
                      {editId === c.id
                        ? <input value={editName} onChange={e => setEditName(e.target.value)} className="border rounded px-2 py-0.5 text-sm w-full" autoFocus />
                        : <span className="font-medium">{c.name}</span>}
                    </td>
                    <td className="px-2 py-0.5 w-28">
                      {editId === c.id
                        ? <select value={editGroup} onChange={e => setEditGroup(e.target.value)} className="border rounded px-1 py-0.5 text-xs w-full">
                            <option value="">- brak -</option>
                            {groups.map(g => <option key={g} value={g}>{g}</option>)}
                          </select>
                        : null}
                    </td>
                    <td className="px-2 py-0.5 w-20">
                      {editId === c.id
                        ? <select value={editCatType} onChange={e => setEditCatType(e.target.value)} className="border rounded px-1 py-0.5 text-xs">
                            <option value="expense">Wydatek</option>
                            <option value="income">Wpływ</option>
                            <option value="transfer">Transfer</option>
                          </select>
                        : <span className="text-gray-400 text-xs">{TYPE_LABELS[c.cat_type || 'expense']}</span>}
                    </td>
                    <td className="px-2 py-0.5 w-16 text-right text-gray-400 text-xs">{c.usage_count}</td>
                    <td className="px-2 py-0.5 w-32 text-right space-x-1">
                      {editId === c.id ? (
                        <>
                          <button onClick={() => handleUpdate(c.id)} className="text-green-600 hover:text-green-800 text-xs">Zapisz</button>
                          <button onClick={() => setEditId(null)} className="text-gray-500 hover:text-gray-700 text-xs">Anuluj</button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => { setEditId(c.id); setEditName(c.name); setEditColor(c.color); setEditCatType(c.cat_type || 'expense'); setEditGroup(c.group_name || ''); }} className="text-blue-500 hover:text-blue-700 text-xs">Edytuj</button>
                          <button onClick={() => handleDelete(c.id)} className="text-red-400 hover:text-red-600 text-xs">Usuń</button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  );
}
