import { useState, useEffect, useCallback, useRef, ReactNode } from 'react';

const PAGE_SIZES = [50, 100, 200, 1000];

export interface Column<T> {
  key: string;
  label: string;
  sortable?: boolean;
  className?: string;
  headerClassName?: string;
  render: (row: T) => ReactNode;
}

interface Props<T> {
  data: T[];
  columns: Column<T>[];
  getId: (row: T) => number;
  total?: number;
  onFetch?: (params: { limit: number; offset: number; sort_by: string; sort_dir: string }) => void;
  selectable?: boolean;
  onDelete?: (ids: number[]) => void;
  deleteLabel?: string;
  defaultSort?: { key: string; dir: 'asc' | 'desc' };
  defaultPageSize?: number;
  onSelectionChange?: (ids: number[]) => void;
  // Expandable rows
  isExpandable?: (row: T) => boolean;
  renderExpanded?: (row: T) => ReactNode;
  // Expandable child rows (rendered in same column grid)
  getChildRows?: (row: T) => any[] | undefined;
  childColumns?: Column<any>[];
  childLabel?: (row: T) => string | undefined;
  // Child row selection
  childSelectable?: boolean;
  onChildSelectionChange?: (children: any[]) => void;
  // Persist table state in sessionStorage under this key
  storageKey?: string;
  // Double-click handler on row (overrides text expand behavior)
  onRowDoubleClick?: (row: T) => void;
}

export default function DataTable<T>({
  data,
  columns,
  getId,
  total: serverTotal,
  onFetch,
  selectable = false,
  onDelete,
  deleteLabel = 'Usun zaznaczone',
  defaultSort = { key: '', dir: 'desc' as const },
  defaultPageSize = 50,
  onSelectionChange,
  isExpandable,
  renderExpanded,
  getChildRows,
  childColumns,
  childLabel,
  childSelectable = false,
  onChildSelectionChange,
  storageKey,
  onRowDoubleClick,
}: Props<T>) {
  const loadStored = () => {
    if (!storageKey) return null;
    try {
      const raw = sessionStorage.getItem(`dt:${storageKey}`);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  };
  const stored = loadStored();

  const [page, setPage] = useState(stored?.page ?? 0);
  const [pageSize, setPageSize] = useState(stored?.pageSize ?? defaultPageSize);
  const [sort, setSort] = useState(stored?.sort ?? defaultSort);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [expandedText, setExpandedText] = useState<Set<number>>(new Set());
  const [selectedChildren, setSelectedChildren] = useState<Map<string, any>>(new Map());
  const scrollRef = useRef<HTMLDivElement>(null);

  // Persist table state
  useEffect(() => {
    if (!storageKey) return;
    sessionStorage.setItem(`dt:${storageKey}`, JSON.stringify({ page, pageSize, sort }));
  }, [storageKey, page, pageSize, sort]);

  const isServerSide = !!onFetch;

  const triggerFetch = useCallback(() => {
    if (onFetch) {
      onFetch({
        limit: pageSize,
        offset: page * pageSize,
        sort_by: sort.key,
        sort_dir: sort.dir,
      });
    }
  }, [onFetch, page, pageSize, sort]);

  useEffect(() => { triggerFetch(); }, [triggerFetch]);
  useEffect(() => {
    setSelected(new Set()); onSelectionChange?.([]); setSelectedChildren(new Map()); onChildSelectionChange?.([]);
    // Restore scroll position after data loads
    if (storageKey && scrollRef.current) {
      try {
        const scrollTop = Number(sessionStorage.getItem(`dt:${storageKey}:scroll`) || 0);
        if (scrollTop > 0) setTimeout(() => { scrollRef.current?.scrollTo(0, scrollTop); }, 0);
      } catch {}
    }
  }, [data]);

  const processedData = isServerSide ? data : (() => {
    let sorted = [...data];
    if (sort.key) {
      sorted.sort((a: any, b: any) => {
        const va = a[sort.key] ?? '';
        const vb = b[sort.key] ?? '';
        const cmp = typeof va === 'number' ? va - vb : String(va).localeCompare(String(vb), 'pl');
        return sort.dir === 'asc' ? cmp : -cmp;
      });
    }
    return sorted.slice(page * pageSize, (page + 1) * pageSize);
  })();

  const total = serverTotal ?? data.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const handleSort = (key: string) => {
    setSort((prev: { key: string; dir: string }) => ({ key, dir: prev.key === key && prev.dir === 'desc' ? 'asc' as const : 'desc' as const }));
    setPage(0);
  };

  const handlePageSize = (size: number) => {
    setPageSize(size);
    setPage(0);
  };

  const toggleSelect = (id: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      onSelectionChange?.([...next]);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === processedData.length) {
      setSelected(new Set());
      onSelectionChange?.([]);
    } else {
      const all = new Set(processedData.map(getId));
      setSelected(all);
      onSelectionChange?.([...all]);
    }
  };

  const childKey = (parentId: number, child: any, idx: number) => `${parentId}:${child.id ?? idx}:${child._type || ''}`;

  const toggleChildSelect = (parentId: number, child: any, idx: number) => {
    setSelectedChildren(prev => {
      const next = new Map(prev);
      const key = childKey(parentId, child, idx);
      if (next.has(key)) next.delete(key); else next.set(key, child);
      onChildSelectionChange?.([...next.values()]);
      return next;
    });
  };

  const toggleAllChildren = (parentId: number, children: any[]) => {
    setSelectedChildren(prev => {
      const next = new Map(prev);
      const keys = children.map((c, i) => childKey(parentId, c, i));
      const allSelected = keys.every(k => next.has(k));
      if (allSelected) {
        keys.forEach(k => next.delete(k));
      } else {
        children.forEach((c, i) => next.set(keys[i], c));
      }
      onChildSelectionChange?.([...next.values()]);
      return next;
    });
  };

  const handleDelete = () => {
    if (selected.size === 0 || !onDelete) return;
    if (!confirm(`Usunac ${selected.size} rekordow?`)) return;
    onDelete([...selected]);
    setSelected(new Set());
  };

  // Determine expand mode: childRows (aligned columns) or freeform renderExpanded
  const hasChildRows = !!(getChildRows && childColumns);
  const hasFreeExpand = !!(isExpandable && renderExpanded && !hasChildRows);
  const hasExpand = hasChildRows || hasFreeExpand;

  const expandable = (row: T) => {
    if (hasChildRows) {
      const children = getChildRows!(row);
      return !!children && children.length > 0;
    }
    if (hasFreeExpand) return isExpandable!(row);
    return false;
  };

  const colCount = columns.length + (selectable ? 1 : 0) + (hasExpand ? 1 : 0);

  const toggleTextExpand = (id: number) => {
    setExpandedText(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleExpand = (id: number) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <div>
      {selectable && selected.size > 0 && onDelete && (
        <div className="mb-3 flex justify-end">
          <button onClick={handleDelete} className="px-4 py-2 bg-red-500 text-white text-sm rounded hover:bg-red-600">
            {deleteLabel} ({selected.size})
          </button>
        </div>
      )}

      <div ref={scrollRef} className="bg-white rounded-lg shadow overflow-auto max-h-[80vh]" onScroll={storageKey ? () => { if (scrollRef.current) sessionStorage.setItem(`dt:${storageKey}:scroll`, String(scrollRef.current.scrollTop)); } : undefined}>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 sticky top-0 z-10">
            <tr>
              {hasExpand && <th className="px-1 py-0.5 w-8"></th>}
              {selectable && (
                <th className="px-2 py-0.5 w-8">
                  <input
                    type="checkbox"
                    checked={processedData.length > 0 && selected.size === processedData.length}
                    onChange={toggleAll}
                    className="rounded"
                  />
                </th>
              )}
              {columns.map(col => (
                <th
                  key={col.key}
                  className={`px-2 py-0.5 whitespace-nowrap ${col.sortable !== false ? 'cursor-pointer select-none hover:bg-gray-100' : ''} ${col.headerClassName || 'text-left'}`}
                  onClick={col.sortable !== false ? () => handleSort(col.key) : undefined}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.label}
                    {col.sortable !== false && sort.key === col.key && (
                      <span className="text-blue-500">{sort.dir === 'asc' ? '\u25B2' : '\u25BC'}</span>
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {processedData.map(row => {
              const id = getId(row);
              const canExpand = expandable(row);
              const isExpanded = canExpand && expanded.has(id);
              const children = isExpanded && hasChildRows ? (getChildRows!(row) || []) : [];
              const label = isExpanded && childLabel ? childLabel(row) : undefined;
              return (
                <>
                <tr key={id} className={`border-t hover:bg-gray-50 ${selected.has(id) ? 'bg-blue-50' : ''} ${onRowDoubleClick ? 'cursor-pointer' : ''}`} onDoubleClick={() => onRowDoubleClick ? onRowDoubleClick(row) : toggleTextExpand(id)}>
                  {hasExpand && (
                    <td className="px-1 py-1 text-center">
                      {canExpand && (
                        <button
                          onClick={() => toggleExpand(id)}
                          className="w-5 h-5 flex items-center justify-center rounded hover:bg-gray-200 text-gray-500 text-xs font-bold"
                        >
                          {isExpanded ? '\u25BC' : '\u25B6'}
                        </button>
                      )}
                    </td>
                  )}
                  {selectable && (
                    <td className="px-2 py-1">
                      <input
                        type="checkbox"
                        checked={selected.has(id)}
                        onChange={() => toggleSelect(id)}
                        className="rounded"
                      />
                    </td>
                  )}
                  {columns.map(col => {
                    const cls = col.className || 'px-2 py-1';
                    const textExpanded = expandedText.has(id);
                    const tdClass = textExpanded ? cls.replace(/truncate/g, '').replace(/whitespace-nowrap/g, '') + ' whitespace-normal break-words' : cls;
                    return (
                      <td key={col.key} className={tdClass}>
                        {col.render(row)}
                      </td>
                    );
                  })}
                </tr>
                {isExpanded && hasFreeExpand && (
                  <tr key={`${id}-expanded`} className="bg-gray-50/70">
                    <td colSpan={colCount} className="px-0 py-0">
                      {renderExpanded!(row)}
                    </td>
                  </tr>
                )}
                {isExpanded && hasChildRows && (
                  <>
                  {label && (
                    <tr key={`${id}-label`} className="bg-purple-50/50">
                      {hasExpand && <td></td>}
                      {selectable && childSelectable && (
                        <td className="px-2 py-1">
                          <input
                            type="checkbox"
                            checked={children.length > 0 && children.every((c: any, i: number) => selectedChildren.has(childKey(id, c, i)))}
                            onChange={() => toggleAllChildren(id, children)}
                            className="rounded"
                            title="Zaznacz wszystkie pozycje"
                          />
                        </td>
                      )}
                      {selectable && !childSelectable && <td></td>}
                      <td colSpan={columns.length} className="px-3 py-1 text-xs text-gray-400">{label}</td>
                    </tr>
                  )}
                  {children.map((child: any, ci: number) => (
                    <tr key={`${id}-child-${child.id ?? ci}`} className={`bg-purple-50/30 border-t border-gray-100 ${selectedChildren.has(childKey(id, child, ci)) ? 'bg-blue-50' : ''}`}>
                      {hasExpand && <td></td>}
                      {selectable && childSelectable && (
                        <td className="px-2 py-0.5">
                          <input
                            type="checkbox"
                            checked={selectedChildren.has(childKey(id, child, ci))}
                            onChange={() => toggleChildSelect(id, child, ci)}
                            className="rounded"
                          />
                        </td>
                      )}
                      {selectable && !childSelectable && <td></td>}
                      {columns.map((col, colIdx) => {
                        const childCol = childColumns!.find(cc => cc.key === col.key);
                        return (
                          <td key={col.key} className={childCol ? (childCol.className || col.className || 'px-3 py-0.5') : 'px-3 py-0.5'}>
                            {childCol ? childCol.render(child) : (colIdx === 0 ? <span className="text-gray-300 pl-2">{'└'}</span> : null)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  </>
                )}
                </>
              );
            })}
            {processedData.length === 0 && (
              <tr><td colSpan={colCount} className="px-4 py-8 text-center text-gray-400">Brak danych</td></tr>
            )}
          </tbody>
        </table>

        <div className="flex items-center justify-between px-4 py-2 border-t bg-gray-50 text-sm sticky bottom-0">
          <div className="flex items-center gap-4">
            <span className="text-gray-500">
              Razem: {total}
              {selected.size > 0 && ` | Zaznaczono: ${selected.size}`}
            </span>
            <div className="flex items-center gap-1">
              <span className="text-gray-500">Wierszy:</span>
              {PAGE_SIZES.map(size => (
                <button
                  key={size}
                  onClick={() => handlePageSize(size)}
                  className={`px-2 py-0.5 rounded text-xs ${
                    pageSize === size ? 'bg-blue-600 text-white' : 'border hover:bg-gray-100 text-gray-600'
                  }`}
                >
                  {size}
                </button>
              ))}
            </div>
          </div>
          <div className="space-x-2">
            <button onClick={() => setPage((p: number) => Math.max(0, p - 1))} disabled={page === 0} className="px-3 py-1 border rounded disabled:opacity-30">Wstecz</button>
            <span className="text-gray-500">Strona {page + 1} z {totalPages}</span>
            <button onClick={() => setPage((p: number) => p + 1)} disabled={(page + 1) * pageSize >= total} className="px-3 py-1 border rounded disabled:opacity-30">Dalej</button>
          </div>
        </div>
      </div>
    </div>
  );
}
