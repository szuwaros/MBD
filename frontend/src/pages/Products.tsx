import { useEffect, useState } from 'react';
import { api } from '../api/client';
import CategoryBadge from '../components/CategoryBadge';

export default function Products() {
  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [search, setSearch] = useState('');

  const load = () => {
    const params: Record<string, string> = {};
    if (search) params.search = search;
    api.getProducts(params).then(setProducts);
  };

  useEffect(() => { load(); api.getCategories().then(setCategories); }, []);
  useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t); }, [search]);

  const handleCategoryChange = async (productId: number, categoryId: string) => {
    await api.updateProduct(productId, { category_id: categoryId ? Number(categoryId) : null });
    load();
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Produkty</h1>

      <div className="bg-white rounded-lg shadow p-4 mb-4">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Szukaj produktu..."
          className="border rounded px-3 py-1.5 text-sm w-full max-w-sm"
        />
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-4 py-3">Nazwa</th>
              <th className="text-left px-4 py-3">Kategoria</th>
              <th className="text-right px-4 py-3">Ostatnia cena</th>
              <th className="text-right px-4 py-3">Liczba zakupów</th>
            </tr>
          </thead>
          <tbody>
            {products.map(p => (
              <tr key={p.id} className="border-t hover:bg-gray-50">
                <td className="px-4 py-2 font-medium">{p.name}</td>
                <td className="px-4 py-2">
                  <select
                    value={p.category_id || ''}
                    onChange={e => handleCategoryChange(p.id, e.target.value)}
                    className="border rounded px-1 py-0.5 text-xs"
                  >
                    <option value="">-</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </td>
                <td className="px-4 py-2 text-right font-mono">{p.last_price?.toFixed(2) || '-'} PLN</td>
                <td className="px-4 py-2 text-right">{p.times_purchased}</td>
              </tr>
            ))}
            {products.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400">Brak produktów</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
