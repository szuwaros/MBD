import { NavLink, Outlet } from 'react-router-dom';

const navItems = [
  { to: '/', label: 'Dashboard' },
  { to: '/accounts', label: 'Konta' },
  { to: '/import', label: 'Import' },
  { to: '/transactions', label: 'Transakcje' },
  { to: '/categories', label: 'Kategorie' },
  { to: '/receipts', label: 'E-paragony' },
  { to: '/products', label: 'Produkty' },
  { to: '/reports', label: 'Raporty' },
];

export default function Layout() {
  return (
    <div className="min-h-screen flex">
      <nav className="w-56 bg-gray-800 text-white flex-shrink-0">
        <div className="p-4 border-b border-gray-700">
          <h1 className="text-xl font-bold">MBD</h1>
          <p className="text-xs text-gray-400">Budżet Domowy</p>
        </div>
        <ul className="py-2">
          {navItems.map(item => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  `block px-4 py-2 text-sm hover:bg-gray-700 ${isActive ? 'bg-gray-700 font-semibold' : ''}`
                }
              >
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <main className="flex-1 p-6 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
