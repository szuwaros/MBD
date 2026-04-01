import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';

const MONTHS = ['Sty', 'Lut', 'Mar', 'Kwi', 'Maj', 'Cze', 'Lip', 'Sie', 'Wrz', 'Paź', 'Lis', 'Gru'];

export default function Dashboard() {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [categoryData, setCategoryData] = useState<any[]>([]);
  const [monthlyData, setMonthlyData] = useState<any[]>([]);

  useEffect(() => {
    api.getAccounts().then(setAccounts);

    const now = new Date();
    const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const to = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-31`;
    api.getReportByCategory({ from, to }).then(setCategoryData);
    api.getMonthlyTrend({ year: String(now.getFullYear()) }).then(data => {
      setMonthlyData(data.map((d: any) => ({ ...d, monthLabel: MONTHS[parseInt(d.month) - 1] })));
    });
  }, []);

  const totalBalance = accounts.reduce((sum, a) => sum + (a.current_balance || 0), 0);
  const totalExpenses = categoryData.reduce((sum, c) => sum + c.total, 0);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Dashboard</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500">Liczba kont</p>
          <p className="text-2xl font-bold">{accounts.length}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500">Saldo łączne</p>
          <p className="text-2xl font-bold">{totalBalance.toFixed(2)} PLN</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500">Wydatki (bieżący miesiąc)</p>
          <p className="text-2xl font-bold text-red-600">{totalExpenses.toFixed(2)} PLN</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow p-4">
          <h2 className="text-lg font-semibold mb-4">Wydatki wg kategorii (bieżący miesiąc)</h2>
          {categoryData.length === 0 ? (
            <p className="text-gray-400 text-center py-8">Brak danych</p>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie data={categoryData} dataKey="total" nameKey="category" cx="50%" cy="50%" outerRadius={100} label={({ category, total }) => `${category}: ${total.toFixed(0)}`}>
                  {categoryData.map((entry: any, i: number) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number) => `${value.toFixed(2)} PLN`} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <h2 className="text-lg font-semibold mb-4">Trend miesięczny ({new Date().getFullYear()})</h2>
          {monthlyData.length === 0 ? (
            <p className="text-gray-400 text-center py-8">Brak danych</p>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={monthlyData}>
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
      </div>

      {accounts.length > 0 && (
        <div className="bg-white rounded-lg shadow p-4 mt-6">
          <h2 className="text-lg font-semibold mb-4">Konta</h2>
          <table className="w-full text-sm">
            <thead><tr className="border-b"><th className="text-left py-2">Nazwa</th><th className="text-left py-2">Bank</th><th className="text-right py-2">Saldo</th><th className="text-right py-2">Transakcje</th></tr></thead>
            <tbody>
              {accounts.map(a => (
                <tr key={a.id} className="border-b">
                  <td className="py-2">{a.name}</td>
                  <td className="py-2">{a.bank}</td>
                  <td className="py-2 text-right font-mono">{a.current_balance?.toFixed(2) || '-'} PLN</td>
                  <td className="py-2 text-right">{a.transaction_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
