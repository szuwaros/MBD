import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';

const navItems = [
  { to: '/', label: 'Dashboard' },
  { to: '/accounts', label: 'Konta' },
  { to: '/import', label: 'Import' },
  { to: '/transactions', label: 'Transakcje' },
  { to: '/categories', label: 'Kategorie' },
  { to: '/receipts', label: 'Paragony' },
  { to: '/products', label: 'Produkty' },
];

export default function Layout() {
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-screen flex">
      {/* Mobile overlay */}
      {open && (
        <div className="fixed inset-0 bg-black/40 z-30 lg:hidden" onClick={() => setOpen(false)} />
      )}

      {/* Sidebar */}
      <nav className={`
        fixed lg:static inset-y-0 left-0 z-40
        w-56 bg-gray-800 text-white flex-shrink-0
        transform transition-transform duration-200
        ${open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        <div className="p-4 border-b border-gray-700 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">MBD</h1>
            <p className="text-xs text-gray-400">Budzet Domowy</p>
          </div>
          <button onClick={() => setOpen(false)} className="lg:hidden text-gray-400 hover:text-white text-xl leading-none">&times;</button>
        </div>
        <ul className="py-2">
          {navItems.map(item => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.to === '/'}
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  `block px-4 py-2.5 text-sm hover:bg-gray-700 ${isActive ? 'bg-gray-700 font-semibold' : ''}`
                }
              >
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile header */}
        <header className="lg:hidden bg-gray-800 text-white px-4 py-3 flex items-center gap-3 flex-shrink-0">
          <button onClick={() => setOpen(true)} className="text-xl leading-none">&#9776;</button>
          <span className="font-bold">MBD</span>
        </header>
        <main className="flex-1 p-4 lg:p-6 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
