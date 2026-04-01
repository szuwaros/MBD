import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { PieChart, Pie, Cell, BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from 'recharts';

const MONTHS = ['Sty', 'Lut', 'Mar', 'Kwi', 'Maj', 'Cze', 'Lip', 'Sie', 'Wrz', 'Paź', 'Lis', 'Gru'];

export default function Reports() {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [accountId, setAccountId] = useState('');
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const [categoryData, setCategoryData] = useState<any[]>([]);
  const [monthlyData, setMonthlyData] = useState<any[]>([]);
  const [balanceData, setBalanceData] = useState<any[]>([]);

  useEffect(() => { api.getAccounts().then(setAccounts); }, []);

  useEffect(() => {
    const params: Record<string, string> = {};
    if (accountId) params.account_id = accountId;
    if (from) params.from = from;
    if (to) params.to = to;
    api.getReportByCategory(params).then(setCategoryData);
  }, [accountId, from, to]);

  useEffect(() => {
    const params: Record<string, string> = { year };
    if (accountId) params.account_id = accountId;
    api.getMonthlyTrend(params).then(data => {
      setMonthlyData(data.map((d: any) => ({ ...d, monthLabel: MONTHS[parseInt(d.month) - 1] })));
    });
  }, [accountId, year]);

  useEffect(() => {
    const params: Record<string, string> = {};
    if (accountId) params.account_id = accountId;
    if (from) params.from = from;
    if (to) params.to = to;
    api.getBalanceHistory(params).then(setBalanceData);
  }, [accountId, from, to]);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Raporty</h1>

      <div className="bg-white rounded-lg shadow p-4 mb-6 flex gap-3 flex-wrap items-end">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Konto</label>
          <select value={accountId} onChange={e => setAccountId(e.target.value)} className="border rounded px-2 py-1.5 text-sm">
            <option value="">Wszystkie</option>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Rok</label>
          <input value={year} onChange={e => setYear(e.target.value)} type="number" className="border rounded px-2 py-1.5 text-sm w-24" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Od</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="border rounded px-2 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Do</label>
          <input type="date" value={to} onChange={e => setTo(e.target.value)} className="border rounded px-2 py-1.5 text-sm" />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow p-4">
          <h2 className="text-lg font-semibold mb-4">Wydatki wg kategorii</h2>
          {categoryData.length === 0 ? (
            <p className="text-gray-400 text-center py-8">Brak danych</p>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie data={categoryData} dataKey="total" nameKey="category" cx="50%" cy="50%" outerRadius={100} label={({ category, total }) => `${category}: ${total.toFixed(0)}`}>
                    {categoryData.map((entry: any, i: number) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip formatter={(value: number) => `${value.toFixed(2)} PLN`} />
                </PieChart>
              </ResponsiveContainer>
              <table className="w-full text-sm mt-4">
                <tbody>
                  {categoryData.map((c, i) => (
                    <tr key={i} className="border-t">
                      <td className="py-1"><span className="inline-block w-3 h-3 rounded mr-2" style={{ backgroundColor: c.color }} />{c.category}</td>
                      <td className="py-1 text-right font-mono">{c.total.toFixed(2)} PLN</td>
                    </tr>
                  ))}
                  <tr className="border-t font-bold">
                    <td className="py-1">Razem</td>
                    <td className="py-1 text-right font-mono">{categoryData.reduce((s, c) => s + c.total, 0).toFixed(2)} PLN</td>
                  </tr>
                </tbody>
              </table>
            </>
          )}
        </div>

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
                <Bar dataKey="income" name="Przychody" fill="#22c55e" />
                <Bar dataKey="expenses" name="Wydatki" fill="#ef4444" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

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
                <Line type="monotone" dataKey="balance" name="Saldo" stroke="#3b82f6" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}
