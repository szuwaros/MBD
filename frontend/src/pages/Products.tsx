import { useEffect, useState } from 'react';
import { api } from '../api/client';
import DataTable, { Column } from '../components/DataTable';
import GroupedCategorySelect from '../components/GroupedCategorySelect';

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

  const handleDelete = async (ids: number[]) => {
    for (const id of ids) await api.deleteProduct(id);
    load();
  };

  const columns: Column<any>[] = [
    { key: 'name', label: 'Nazwa', render: p => <span className="font-medium">{p.name}</span> },
    {
      key: 'category_name', label: 'Kategoria',
      render: p => (
        <GroupedCategorySelect
          categories={categories}
          value={p.category_id || ''}
          onChange={v => handleCategoryChange(p.id, v)}
          className="border rounded px-1 py-0.5 text-xs"
        />
      ),
    },
    { key: 'last_price', label: 'Ostatnia cena', headerClassName: 'text-right', className: 'px-2 py-1 text-right font-mono', render: p => <>{p.last_price?.toFixed(2) || '-'} PLN</> },
    { key: 'times_purchased', label: 'Zakupy', headerClassName: 'text-right', className: 'px-2 py-1 text-right', render: p => p.times_purchased },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Produkty</h1>
      <div className="bg-white rounded-lg shadow p-4 mb-4">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Szukaj produktu..." className="border rounded px-3 py-1.5 text-sm w-full max-w-sm" />
      </div>
      <DataTable
        data={products}
        columns={columns}
        getId={p => p.id}
        selectable
        onDelete={handleDelete}
        deleteLabel="Usun zaznaczone"
        defaultSort={{ key: 'times_purchased', dir: 'desc' }}
      />
    </div>
  );
}
