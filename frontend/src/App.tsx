import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Accounts from './pages/Accounts';
import Import from './pages/Import';
import Transactions from './pages/Transactions';
import Categories from './pages/Categories';
import Receipts from './pages/Receipts';
import Products from './pages/Products';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/accounts" element={<Accounts />} />
        <Route path="/import" element={<Import />} />
        <Route path="/transactions" element={<Transactions />} />
        <Route path="/categories" element={<Categories />} />
        <Route path="/receipts" element={<Receipts />} />
        <Route path="/products" element={<Products />} />
      </Route>
    </Routes>
  );
}
