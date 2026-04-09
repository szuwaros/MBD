import { useState, useRef, useEffect } from 'react';

interface Props {
  categories: any[];
  value: string | number;
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
  amount?: number;
}

export default function GroupedCategorySelect({ categories, value, onChange, className = '', placeholder = '-', amount }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Focus input on open
  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  const selected = categories.find(c => String(c.id) === String(value));
  const displayLabel = selected ? selected.name : placeholder;

  // Group and filter
  const lower = search.toLowerCase();
  const groupOrder: string[] = [];
  const groupMap = new Map<string, any[]>();

  for (const c of categories) {
    // Filter by amount sign: positive → only income, negative → no income
    if (amount !== undefined && amount > 0 && c.cat_type !== 'income') continue;
    if (amount !== undefined && amount < 0 && c.cat_type === 'income') continue;
    if (lower && !c.name.toLowerCase().includes(lower) && !(c.group_name || '').toLowerCase().includes(lower)) continue;
    const group = c.group_name || (c.cat_type === 'income' ? 'Przychody' : c.cat_type === 'transfer' ? 'Finanse' : 'Inne');
    if (!groupMap.has(group)) {
      groupOrder.push(group);
      groupMap.set(group, []);
    }
    groupMap.get(group)!.push(c);
  }

  const handleSelect = (id: string) => {
    onChange(id);
    setOpen(false);
    setSearch('');
  };

  return (
    <div ref={ref} className="relative" style={{ minWidth: 0 }}>
      <button
        type="button"
        onClick={() => { setOpen(!open); setSearch(''); }}
        className="w-full text-left truncate border rounded px-1 py-0.5 text-xs bg-white hover:bg-gray-50 flex items-center justify-between gap-1"
      >
        <span className={selected ? '' : 'text-gray-400'}>{displayLabel}</span>
        <span className="text-gray-300 text-[10px]">▾</span>
      </button>

      {open && (
        <div className="absolute z-50 mt-0.5 left-0 w-56 bg-white border rounded shadow-lg max-h-64 flex flex-col">
          <input
            ref={inputRef}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="border-b px-2 py-1 text-xs outline-none shrink-0"
            placeholder="Szukaj kategorii..."
            onKeyDown={e => {
              if (e.key === 'Escape') { setOpen(false); setSearch(''); }
            }}
          />
          <div className="overflow-y-auto flex-1">
            {/* Clear option */}
            <div
              onClick={() => handleSelect('')}
              className="px-2 py-0.5 text-xs text-gray-400 hover:bg-gray-50 cursor-pointer"
            >
              {placeholder}
            </div>

            {groupOrder.length === 0 && (
              <div className="px-2 py-2 text-xs text-gray-300 text-center">Brak wyników</div>
            )}

            {groupOrder.map(group => (
              <div key={group}>
                <div className="px-2 py-0.5 text-[10px] font-semibold text-gray-400 bg-gray-50 sticky top-0">
                  {group}
                </div>
                {groupMap.get(group)!.map(c => (
                  <div
                    key={c.id}
                    onClick={() => handleSelect(String(c.id))}
                    className={`px-3 py-0.5 text-xs cursor-pointer hover:bg-blue-50 flex items-center gap-1.5 ${String(c.id) === String(value) ? 'bg-blue-50 font-medium' : ''}`}
                  >
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: c.color || '#6b7280' }} />
                    <span className="truncate">{c.name}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
