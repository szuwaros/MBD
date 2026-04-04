import { useEffect, useState, useCallback } from 'react';
import { api } from '../api/client';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import CategoryIcon from '../components/CategoryIcon';
import DateRangeSelector from '../components/DateRangeSelector';

const MONTHS = ['Sty', 'Lut', 'Mar', 'Kwi', 'Maj', 'Cze', 'Lip', 'Sie', 'Wrz', 'Paź', 'Lis', 'Gru'];

const GROUP_COLORS: Record<string, string> = {
  'Wydatki bieżące': '#22c55e', 'Transport': '#f59e0b', 'Dom i mieszkanie': '#ef4444',
  'Rachunki i opłaty': '#dc2626', 'Zdrowie': '#3b82f6', 'Rozrywka i wypoczynek': '#a855f7',
  'Edukacja': '#2563eb', 'Dzieci': '#ec4899', 'Odzież i obuwie': '#db2777',
  'Finanse': '#6366f1', 'Inne': '#6b7280',
};

export default function Dashboard() {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [groupData, setGroupData] = useState<any[]>([]);
  const [monthlyData, setMonthlyData] = useState<any[]>([]);
  const [drillGroup, setDrillGroup] = useState<string | null>(null);

  // Date range for pie chart
  const now = new Date();
  const initFrom = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const initTo = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  const [from, setFrom] = useState(initFrom);
  const [to, setTo] = useState(initTo);
  const [trendYear, setTrendYear] = useState(now.getFullYear());

  const loadPie = useCallback(() => {
    api.getReportByGroup({ from, to }).then(setGroupData);
    setDrillGroup(null);
  }, [from, to]);

  const loadTrend = useCallback(() => {
    api.getMonthlyTrend({ year: String(trendYear) }).then(data => {
      const byMonth = new Map(data.map((d: any) => [d.month, d]));
      const full = MONTHS.map((label, i) => {
        const m = String(i + 1).padStart(2, '0');
        const d = byMonth.get(m) as any;
        return { month: m, monthLabel: label, expenses: d?.expenses || 0, income: d?.income || 0 };
      });
      setMonthlyData(full);
    });
  }, [trendYear]);

  useEffect(() => { api.getAccounts().then(setAccounts); }, []);
  useEffect(() => { loadPie(); }, [loadPie]);
  useEffect(() => { loadTrend(); }, [loadTrend]);

  const totalBalance = accounts.reduce((sum, a) => sum + (a.current_balance || 0), 0);
  const totalExpenses = groupData.reduce((sum, g) => sum + g.total, 0);

  const drilled = drillGroup ? groupData.find(g => g.group === drillGroup) : null;
  const pieData = drilled
    ? drilled.categories.map((c: any) => ({ name: c.category, value: c.total, color: c.color }))
    : groupData.map(g => ({ name: g.group, value: g.total, color: GROUP_COLORS[g.group] || '#6b7280' }));

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Dashboard</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500">Liczba kont</p>
          <p className="text-2xl font-bold">{accounts.length}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500">Saldo łączne</p>
          <p className="text-2xl font-bold">{totalBalance.toFixed(2)} PLN</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500">Wydatki (wybrany okres)</p>
          <p className="text-2xl font-bold text-red-600">{totalExpenses.toFixed(2)} PLN</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="mb-3">
            <DateRangeSelector from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />
          </div>
          {drillGroup && (
            <div className="flex items-center gap-2 mb-2">
              <button onClick={() => setDrillGroup(null)} className="text-xs text-blue-500 hover:text-blue-700">&larr; Wszystkie grupy</button>
              <span className="text-sm font-medium text-gray-600">{drillGroup}</span>
            </div>
          )}
          {pieData.length === 0 ? (
            <p className="text-gray-400 text-center py-8">Brak danych</p>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90}
                    isAnimationActive={false}
                    label={({ name, value }) => `${name}: ${value.toFixed(0)}`}
                    onClick={(_: any, idx: number) => {
                      if (!drillGroup && groupData[idx]) setDrillGroup(groupData[idx].group);
                    }}
                    style={!drillGroup ? { cursor: 'pointer' } : undefined}
                  >
                    {pieData.map((e: any, i: number) => <Cell key={i} fill={e.color} />)}
                  </Pie>
                  <Tooltip formatter={(value: number) => `${value.toFixed(2)} PLN`} />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-1 max-h-40 overflow-y-auto">
                <table className="w-full text-xs">
                  <tbody>
                    {pieData.map((d: any, i: number) => (
                      <tr
                        key={i}
                        className={`border-t border-gray-50 ${!drillGroup ? 'cursor-pointer hover:bg-gray-50' : ''}`}
                        onClick={() => { if (!drillGroup && groupData[i]) setDrillGroup(groupData[i].group); }}
                      >
                        <td className="py-0.5 px-1 w-5">
                          <CategoryIcon name={d.name} group={!drillGroup} size={14} color={d.color} />
                        </td>
                        <td className="py-0.5 px-1 text-gray-700">{d.name}</td>
                        <td className="py-0.5 px-1 text-right font-mono text-gray-500">{d.value.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between mb-4">
            <button onClick={() => setTrendYear(y => y - 1)} className="px-2 py-1 rounded hover:bg-gray-100 text-gray-500 text-lg font-bold">&lsaquo;</button>
            <h2 className="text-lg font-semibold">Trend miesięczny: {trendYear}</h2>
            <button onClick={() => setTrendYear(y => y + 1)} disabled={trendYear >= now.getFullYear()} className="px-2 py-1 rounded hover:bg-gray-100 text-gray-500 text-lg font-bold disabled:opacity-20">&rsaquo;</button>
          </div>
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

      {accounts.length > 0 && (
        <div className="bg-white rounded-lg shadow p-4 mt-6">
          <h2 className="text-lg font-semibold mb-4">Konta</h2>
          <table className="w-full text-sm">
            <thead><tr className="border-b"><th className="text-left py-1">Nazwa</th><th className="text-left py-1">Bank</th><th className="text-right py-1">Saldo</th><th className="text-right py-1">Transakcje</th></tr></thead>
            <tbody>
              {accounts.map(a => (
                <tr key={a.id} className="border-b">
                  <td className="py-1">{a.name}</td>
                  <td className="py-1">{a.bank}</td>
                  <td className="py-1 text-right font-mono">{a.current_balance?.toFixed(2) || '-'} PLN</td>
                  <td className="py-1 text-right">{a.transaction_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
