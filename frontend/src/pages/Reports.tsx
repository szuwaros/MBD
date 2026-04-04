import { useEffect, useState, useCallback } from 'react';
import { api } from '../api/client';
import { PieChart, Pie, Cell, BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from 'recharts';
import CategoryIcon from '../components/CategoryIcon';
import GroupedCategorySelect from '../components/GroupedCategorySelect';
import DateRangeSelector from '../components/DateRangeSelector';

const MONTHS = ['Sty', 'Lut', 'Mar', 'Kwi', 'Maj', 'Cze', 'Lip', 'Sie', 'Wrz', 'Paź', 'Lis', 'Gru'];

const GROUP_COLORS: Record<string, string> = {
  'Wydatki bieżące': '#22c55e', 'Transport': '#f59e0b', 'Dom i mieszkanie': '#ef4444',
  'Rachunki i opłaty': '#dc2626', 'Zdrowie': '#3b82f6', 'Rozrywka i wypoczynek': '#a855f7',
  'Edukacja': '#2563eb', 'Dzieci': '#ec4899', 'Odzież i obuwie': '#db2777',
  'Finanse': '#6366f1', 'Inne': '#6b7280',
};

export default function Reports() {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [accountId, setAccountId] = useState('');
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const [groupData, setGroupData] = useState<any[]>([]);
  const [monthlyData, setMonthlyData] = useState<any[]>([]);
  const [balanceData, setBalanceData] = useState<any[]>([]);

  // Drill state
  const [drillGroup, setDrillGroup] = useState<string | null>(null);
  const [drillCategory, setDrillCategory] = useState<{ id: number; name: string } | null>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [txTotal, setTxTotal] = useState(0);

  useEffect(() => {
    api.getAccounts().then(setAccounts);
    api.getCategories().then(setCategories);
  }, []);

  const dateParams = useCallback(() => {
    const p: Record<string, string> = {};
    if (accountId) p.account_id = accountId;
    if (from) p.from = from;
    if (to) p.to = to;
    return p;
  }, [accountId, from, to]);

  useEffect(() => {
    api.getReportByGroup(dateParams()).then(setGroupData);
    setDrillGroup(null);
    setDrillCategory(null);
    setTransactions([]);
  }, [dateParams]);

  useEffect(() => {
    const params: Record<string, string> = { year };
    if (accountId) params.account_id = accountId;
    api.getMonthlyTrend(params).then(data => {
      const byMonth = new Map(data.map((d: any) => [d.month, d]));
      const full = MONTHS.map((label, i) => {
        const m = String(i + 1).padStart(2, '0');
        const d = byMonth.get(m) as any;
        return { month: m, monthLabel: label, expenses: d?.expenses || 0, income: d?.income || 0 };
      });
      setMonthlyData(full);
    });
  }, [accountId, year]);

  useEffect(() => {
    api.getBalanceHistory(dateParams()).then(setBalanceData);
  }, [dateParams]);

  // Load transactions for selected category
  const loadTransactions = useCallback(async (categoryId: number) => {
    const p: Record<string, string> = { ...dateParams(), category_id: String(categoryId), limit: '200', offset: '0', sort_by: 'date', sort_dir: 'desc' };
    const res = await api.getTransactions(p);
    setTransactions(res.data);
    setTxTotal(res.total);
  }, [dateParams]);

  const handleDrillGroup = (groupName: string) => {
    setDrillGroup(groupName);
    setDrillCategory(null);
    setTransactions([]);
  };

  const handleDrillCategory = (catId: number, catName: string) => {
    setDrillCategory({ id: catId, name: catName });
    loadTransactions(catId);
  };

  const handleCategoryChange = async (txId: number, categoryId: string) => {
    await api.updateTransaction(txId, { category_id: categoryId ? Number(categoryId) : null });
    // Refresh
    if (drillCategory) loadTransactions(drillCategory.id);
    api.getReportByGroup(dateParams()).then(setGroupData);
  };

  const handleBack = () => {
    if (drillCategory) {
      setDrillCategory(null);
      setTransactions([]);
    } else if (drillGroup) {
      setDrillGroup(null);
    }
  };

  // Pie data
  const drilled = drillGroup ? groupData.find(g => g.group === drillGroup) : null;
  const pieData = drilled
    ? drilled.categories.map((c: any) => ({ name: c.category, value: c.total, color: c.color }))
    : groupData.map(g => ({ name: g.group, value: g.total, color: GROUP_COLORS[g.group] || '#6b7280' }));
  const pieTotal = pieData.reduce((s: number, d: any) => s + d.value, 0);

  // Find category IDs for drill-down clicks
  const getCategoryId = (catName: string): number | null => {
    const groupName = drillGroup;
    const match = categories.find(c => c.name === catName && c.group_name === groupName);
    return match?.id || categories.find(c => c.name === catName)?.id || null;
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Raporty</h1>

      <div className="bg-white rounded-lg shadow p-4 mb-6 flex gap-3 flex-wrap items-center">
        <DateRangeSelector from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />
        <div className="ml-auto flex gap-3 items-end">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Konto</label>
            <select value={accountId} onChange={e => setAccountId(e.target.value)} className="border rounded px-2 py-1.5 text-sm">
              <option value="">Wszystkie</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Rok (trend)</label>
            <input value={year} onChange={e => setYear(e.target.value)} type="number" className="border rounded px-2 py-1.5 text-sm w-20" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pie chart with drill-down */}
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-semibold">
              {drillCategory ? drillCategory.name : drillGroup || 'Wydatki wg grup'}
            </h2>
            {(drillGroup || drillCategory) && (
              <button onClick={handleBack} className="text-xs text-blue-500 hover:text-blue-700">&larr; Wróć</button>
            )}
          </div>

          {!drillCategory && pieData.length > 0 && (
            <>
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90}
                    isAnimationActive={false}
                    label={({ name, value }) => `${name}: ${value.toFixed(0)}`}
                    onClick={(_: any, idx: number) => {
                      if (!drillGroup) {
                        handleDrillGroup(groupData[idx]?.group);
                      } else if (drilled) {
                        const cat = drilled.categories[idx];
                        const catId = getCategoryId(cat.category);
                        if (catId) handleDrillCategory(catId, cat.category);
                      }
                    }}
                    style={{ cursor: 'pointer' }}
                  >
                    {pieData.map((e: any, i: number) => <Cell key={i} fill={e.color} />)}
                  </Pie>
                  <Tooltip formatter={(value: number) => `${value.toFixed(2)} PLN`} />
                </PieChart>
              </ResponsiveContainer>

              <div className="max-h-48 overflow-y-auto mt-1">
                <table className="w-full text-xs">
                  <tbody>
                    {pieData.map((d: any, i: number) => (
                      <tr
                        key={i}
                        className="border-t border-gray-50 cursor-pointer hover:bg-gray-50"
                        onClick={() => {
                          if (!drillGroup) {
                            handleDrillGroup(groupData[i]?.group);
                          } else if (drilled) {
                            const cat = drilled.categories[i];
                            const catId = getCategoryId(cat.category);
                            if (catId) handleDrillCategory(catId, cat.category);
                          }
                        }}
                      >
                        <td className="py-0.5 px-1 w-5">
                          <CategoryIcon name={d.name} group={!drillGroup} size={14} color={d.color} />
                        </td>
                        <td className="py-0.5 px-1 text-gray-700">{d.name}</td>
                        <td className="py-0.5 px-1 text-right font-mono text-gray-500">{d.value.toFixed(2)}</td>
                        <td className="py-0.5 px-1 text-right text-gray-300 w-12">{pieTotal > 0 ? `${(d.value / pieTotal * 100).toFixed(0)}%` : ''}</td>
                      </tr>
                    ))}
                    <tr className="border-t font-medium text-xs">
                      <td></td>
                      <td className="py-0.5 px-1">Razem</td>
                      <td className="py-0.5 px-1 text-right font-mono">{pieTotal.toFixed(2)}</td>
                      <td></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </>
          )}

          {!drillCategory && pieData.length === 0 && (
            <p className="text-gray-400 text-center py-8">Brak danych</p>
          )}

          {/* Transaction list when drilled into category */}
          {drillCategory && (
            <div className="max-h-[60vh] overflow-auto">
              <div className="text-xs text-gray-400 mb-2">{txTotal} transakcji</div>
              {transactions.length === 0 ? (
                <p className="text-gray-400 text-center py-4 text-sm">Brak transakcji</p>
              ) : (
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-white">
                    <tr className="border-b text-gray-500">
                      <th className="text-left py-1 px-1">Data</th>
                      <th className="text-left py-1 px-1">Kontrahent</th>
                      <th className="text-left py-1 px-1">Opis</th>
                      <th className="text-right py-1 px-1">Kwota</th>
                      <th className="text-left py-1 px-1 w-32">Kategoria</th>
                      <th className="text-left py-1 px-1">Notatka</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map(tx => (
                      <tr key={tx.id} className="border-t hover:bg-gray-50">
                        <td className="py-1 px-1 text-gray-500 whitespace-nowrap">{tx.date}</td>
                        <td className="py-1 px-1 max-w-[120px] truncate" title={tx.counterparty}>{tx.counterparty || '-'}</td>
                        <td className="py-1 px-1 max-w-[150px] truncate" title={tx.description}>{tx.description}</td>
                        <td className="py-1 px-1 text-right font-mono whitespace-nowrap">
                          <span className={tx.amount < 0 ? 'text-red-600' : 'text-green-600'}>{tx.amount.toFixed(2)}</span>
                        </td>
                        <td className="py-1 px-1">
                          <GroupedCategorySelect
                            categories={categories}
                            value={tx.category_id || ''}
                            onChange={v => handleCategoryChange(tx.id, v)}
                            className="border rounded px-1 py-0.5 text-xs w-full"
                          />
                        </td>
                        <td className="py-1 px-1 text-xs text-gray-400 max-w-[120px] truncate" title={tx.note || ''}>{tx.note || ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>

        {/* Monthly trend */}
        <div className="bg-white rounded-lg shadow p-4">
          <h2 className="text-lg font-semibold mb-4">Trend miesięczny ({year})</h2>
          {monthlyData.length === 0 ? (
            <p className="text-gray-400 text-center py-8">Brak danych</p>
          ) : (
            <ResponsiveContainer width="100%" height={350}>
              <BarChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="monthLabel" />
                <YAxis />
                <Tooltip formatter={(value: number) => `${value.toFixed(2)} PLN`} />
                <Legend />
                <Bar dataKey="income" name="Przychody" fill="#22c55e" isAnimationActive={false} />
                <Bar dataKey="expenses" name="Wydatki" fill="#ef4444" isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Balance history */}
        <div className="bg-white rounded-lg shadow p-4 lg:col-span-2">
          <h2 className="text-lg font-semibold mb-4">Historia salda</h2>
          {balanceData.length === 0 ? (
            <p className="text-gray-400 text-center py-8">Brak danych</p>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={balanceData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip formatter={(value: number) => `${value.toFixed(2)} PLN`} />
                <Legend />
                <Line type="monotone" dataKey="balance" name="Saldo" stroke="#3b82f6" dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}
