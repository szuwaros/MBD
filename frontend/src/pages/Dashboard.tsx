import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { PieChart, Pie, Cell, BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from 'recharts';
import CategoryIcon from '../components/CategoryIcon';
import GroupedCategorySelect from '../components/GroupedCategorySelect';
import NoteCell from '../components/NoteCell';
import DateRangeSelector from '../components/DateRangeSelector';

const ACCOUNT_COLORS = ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#a855f7', '#ec4899', '#6366f1', '#14b8a6'];

const MONTHS = ['Sty', 'Lut', 'Mar', 'Kwi', 'Maj', 'Cze', 'Lip', 'Sie', 'Wrz', 'Paź', 'Lis', 'Gru'];

const GROUP_COLORS: Record<string, string> = {
  'Wydatki bieżące': '#22c55e', 'Transport': '#f59e0b', 'Dom i mieszkanie': '#ef4444',
  'Rachunki i opłaty': '#dc2626', 'Zdrowie': '#3b82f6', 'Rozrywka i wypoczynek': '#a855f7',
  'Edukacja': '#2563eb', 'Dzieci': '#ec4899', 'Odzież i obuwie': '#db2777',
  'Finanse': '#6366f1', 'Inne': '#6b7280',
};

export default function Dashboard() {
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [groupData, setGroupData] = useState<any[]>([]);
  const [monthlyData, setMonthlyData] = useState<any[]>([]);
  const [balanceChartData, setBalanceChartData] = useState<any[]>([]);
  const [balanceAccountNames, setBalanceAccountNames] = useState<string[]>([]);

  // Drill state
  const [drillGroup, setDrillGroup] = useState<string | null>(null);
  const [drillCategory, setDrillCategory] = useState<{ id: number | 'none'; name: string } | null>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [txTotal, setTxTotal] = useState(0);

  const now = new Date();
  const initFrom = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const initTo = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  const [from, setFrom] = useState(initFrom);
  const [to, setTo] = useState(initTo);
  const [accountId, setAccountId] = useState('');
  const [excludeTransfers, setExcludeTransfers] = useState(true);

  const dateParams = useCallback((): Record<string, string> => {
    const p: Record<string, string> = {};
    if (from) p.from = from;
    if (to) p.to = to;
    if (accountId) p.account_id = accountId;
    if (!excludeTransfers) p.exclude_transfers = '0';
    return p;
  }, [from, to, accountId, excludeTransfers]);

  const loadData = useCallback(() => {
    const params = dateParams();
    api.getReportByGroup(params).then(setGroupData);
    setDrillGroup(null);
    setDrillCategory(null);
    setTransactions([]);

    const trendYear = from ? from.substring(0, 4) : String(now.getFullYear());
    const trendParams: Record<string, string> = { year: trendYear };
    if (accountId) trendParams.account_id = accountId;
    if (!excludeTransfers) trendParams.exclude_transfers = '0';
    api.getMonthlyTrend(trendParams).then(data => {
      const byMonth = new Map(data.map((d: any) => [d.month, d]));
      const full = MONTHS.map((label, i) => {
        const m = String(i + 1).padStart(2, '0');
        const d = byMonth.get(m) as any;
        return { month: m, monthLabel: label, expenses: d?.expenses || 0, income: d?.income || 0 };
      });
      setMonthlyData(full);
    });

    // Balance history — multi-account lines + total
    const balanceParams: Record<string, string> = {};
    if (from) balanceParams.from = from;
    if (to) balanceParams.to = to;
    if (accountId) balanceParams.account_id = accountId;
    api.getBalanceHistory(balanceParams).then((raw: any[]) => {
      // Pivot: { date -> { account1: bal, account2: bal, ... , Suma: total } }
      const acctNames = new Set<string>();
      const byDate = new Map<string, Record<string, number>>();
      for (const r of raw) {
        acctNames.add(r.account_name);
        if (!byDate.has(r.date)) byDate.set(r.date, {});
        byDate.get(r.date)![r.account_name] = r.balance;
      }
      const names = Array.from(acctNames);
      setBalanceAccountNames(names);

      // Forward-fill balances and compute total
      const dates = Array.from(byDate.keys()).sort();
      const lastKnown: Record<string, number> = {};
      const chartData = dates.map(date => {
        const entry: Record<string, any> = { date };
        let total = 0;
        for (const name of names) {
          if (byDate.get(date)![name] !== undefined) {
            lastKnown[name] = byDate.get(date)![name];
          }
          const val = lastKnown[name] ?? 0;
          entry[name] = val;
          total += val;
        }
        entry['Suma'] = Math.round(total * 100) / 100;
        return entry;
      });
      setBalanceChartData(chartData);
    });
  }, [dateParams]);

  useEffect(() => {
    api.getAccounts().then(setAccounts);
    api.getCategories().then(setCategories);
  }, []);
  useEffect(() => { loadData(); }, [loadData]);

  // Drill-down
  const getCategoryId = (catName: string): number | null => {
    const match = categories.find(c => c.name === catName && c.group_name === drillGroup);
    return match?.id || categories.find(c => c.name === catName)?.id || null;
  };

  const loadTransactions = useCallback(async (categoryId: number | 'none') => {
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

  const handleDrillCategory = (catId: number | 'none', catName: string) => {
    setDrillCategory({ id: catId, name: catName });
    loadTransactions(catId);
  };

  const handleCategoryChange = async (txId: number, categoryId: string) => {
    const catId = categoryId ? Number(categoryId) : null;
    setTransactions(prev => prev.map(t => t.id === txId ? { ...t, category_id: catId } : t));
    await api.updateTransaction(txId, { category_id: catId });
    // Refresh pie data
    api.getReportByGroup(dateParams()).then(setGroupData);
  };

  const handleBack = () => {
    if (drillCategory) { setDrillCategory(null); setTransactions([]); }
    else if (drillGroup) setDrillGroup(null);
  };

  const totalExpenses = groupData.reduce((sum, g) => sum + g.total, 0);
  const drilled = drillGroup ? groupData.find(g => g.group === drillGroup) : null;
  const pieData = drilled
    ? drilled.categories.map((c: any) => ({ name: c.category, value: c.total, color: c.color }))
    : groupData.map(g => ({ name: g.group, value: g.total, color: GROUP_COLORS[g.group] || '#6b7280' }));
  const pieTotal = pieData.reduce((s: number, d: any) => s + d.value, 0);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Dashboard</h1>

      <div className="bg-white rounded-lg shadow p-3 mb-4 flex items-center gap-4 flex-wrap">
        <DateRangeSelector from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />
        <div>
          <select value={accountId} onChange={e => setAccountId(e.target.value)} className="border rounded px-2 py-1.5 text-sm">
            <option value="">Wszystkie konta</option>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        <label className="flex items-center gap-1.5 text-xs text-gray-500 ml-auto cursor-pointer select-none">
          <input type="checkbox" checked={excludeTransfers} onChange={e => setExcludeTransfers(e.target.checked)} className="rounded" />
          Pomiń przelewy wewnętrzne
        </label>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500">Liczba kont</p>
          <p className="text-2xl font-bold">{accounts.length}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500">Wydatki (okres)</p>
          <p className="text-2xl font-bold text-red-600">{totalExpenses.toFixed(2)} PLN</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500">Średnio dziennie</p>
          <p className="text-2xl font-bold text-red-400">
            {from && to ? (totalExpenses / Math.max(1, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86400000) + 1)).toFixed(2) : '-'} PLN
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6 items-start">
        {/* Pie chart with drill-down */}
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-base font-semibold">
              {drillCategory ? drillCategory.name : drillGroup || 'Wydatki wg grup'}
            </h2>
            {(drillGroup || drillCategory) && (
              <button onClick={handleBack} className="text-xs text-blue-500 hover:text-blue-700">&larr; Wróć</button>
            )}
          </div>

          {!drillCategory && pieData.length > 0 && (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={75}
                    isAnimationActive={false}
                    label={({ name, value }) => `${name}: ${value.toFixed(0)}`}
                    onClick={(_: any, idx: number) => {
                      if (!drillGroup) handleDrillGroup(groupData[idx]?.group);
                      else if (drilled) {
                        const cat = drilled.categories[idx];
                        const catId = getCategoryId(cat.category);
                        handleDrillCategory(catId ?? 'none', cat.category);
                      }
                    }}
                    style={{ cursor: 'pointer' }}
                  >
                    {pieData.map((e: any, i: number) => <Cell key={i} fill={e.color} />)}
                  </Pie>
                  <Tooltip formatter={(value: number) => `${value.toFixed(2)} PLN`} />
                </PieChart>
              </ResponsiveContainer>
              <div>
                <table className="w-full text-xs">
                  <tbody>
                    {pieData.map((d: any, i: number) => (
                      <tr key={i} className="border-t border-gray-50 cursor-pointer hover:bg-gray-50"
                        onClick={() => {
                          if (!drillGroup) handleDrillGroup(groupData[i]?.group);
                          else if (drilled) {
                            const cat = drilled.categories[i];
                            const catId = getCategoryId(cat.category);
                            handleDrillCategory(catId ?? 'none', cat.category);
                          }
                        }}
                      >
                        <td className="py-0.5 px-1 w-5"><CategoryIcon name={d.name} group={!drillGroup} size={14} color={d.color} /></td>
                        <td className="py-0.5 px-1 text-gray-700">{d.name}</td>
                        <td className="py-0.5 px-1 text-right font-mono text-gray-500">{d.value.toFixed(2)}</td>
                        <td className="py-0.5 px-1 text-right text-gray-300 w-10">{pieTotal > 0 ? `${(d.value / pieTotal * 100).toFixed(0)}%` : ''}</td>
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

          {/* Transaction list */}
          {drillCategory && (
            <div className="max-h-[50vh] overflow-auto">
              <div className="text-xs text-gray-400 mb-1 flex items-center justify-between">
                <span>{txTotal} transakcji</span>
                <button
                  onClick={() => {
                    const catId = drillCategory?.id;
                    sessionStorage.setItem('tx:filters', JSON.stringify({
                      account_id: accountId, from, to, category_id: String(catId ?? ''), search: '', amount_min: '', amount_max: '',
                    }));
                    sessionStorage.removeItem('dt:transactions');
                    navigate('/transactions');
                  }}
                  className="text-blue-500 hover:text-blue-700"
                >
                  Pokaż w Transakcjach &rarr;
                </button>
              </div>
              {transactions.length === 0 ? (
                <p className="text-gray-400 text-center py-4 text-sm">Brak transakcji</p>
              ) : (
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-white">
                    <tr className="border-b text-gray-500">
                      <th className="text-left py-0.5 px-1">Data</th>
                      <th className="text-left py-0.5 px-1">Kontrahent</th>
                      <th className="text-right py-0.5 px-1">Kwota</th>
                      <th className="text-left py-0.5 px-1 w-28">Kategoria</th>
                      <th className="text-left py-0.5 px-1">Notatka</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map(tx => (
                      <tr key={tx.id} className="border-t hover:bg-gray-50">
                        <td className="py-0.5 px-1 text-gray-500 whitespace-nowrap">{tx.date}</td>
                        <td className="py-0.5 px-1 max-w-[140px] truncate" title={tx.counterparty || tx.description}>{tx.counterparty || tx.description}</td>
                        <td className="py-0.5 px-1 text-right font-mono whitespace-nowrap">
                          <span className={tx.amount < 0 ? 'text-red-600' : 'text-green-600'}>{tx.amount.toFixed(2)}</span>
                        </td>
                        <td className="py-0.5 px-1">
                          <GroupedCategorySelect categories={categories} value={tx.category_id || ''} onChange={v => handleCategoryChange(tx.id, v)} amount={tx.amount} />
                        </td>
                        <td className="py-0.5 px-1"><NoteCell txId={tx.id} note={tx.note} onSave={(id, newNote) => setTransactions(prev => prev.map(t => t.id === id ? { ...t, note: newNote } : t))} /></td>
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
          <h2 className="text-base font-semibold mb-3">Trend miesięczny {from ? String(new Date(from).getFullYear()) : String(now.getFullYear())}</h2>
          {monthlyData.length === 0 ? (
            <p className="text-gray-400 text-center py-8">Brak danych</p>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={monthlyData}>
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
      </div>

      {/* Balance history — multi-account + total */}
      <div className="bg-white rounded-lg shadow p-4">
        <h2 className="text-base font-semibold mb-3">Historia sald</h2>
        {balanceChartData.length === 0 ? (
          <p className="text-gray-400 text-center py-8">Brak danych</p>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={balanceChartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip formatter={(value: number) => `${value.toFixed(2)} PLN`} />
              <Legend />
              {balanceAccountNames.map((name, i) => (
                <Line key={name} type="monotone" dataKey={name} stroke={ACCOUNT_COLORS[i % ACCOUNT_COLORS.length]} dot={false} isAnimationActive={false} strokeWidth={1.5} />
              ))}
              <Line type="monotone" dataKey="Suma" stroke="#1e293b" dot={false} isAnimationActive={false} strokeWidth={2.5} strokeDasharray="5 3" />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

    </div>
  );
}
