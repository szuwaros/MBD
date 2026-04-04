import { useState, useEffect, useCallback, ReactNode } from 'react';

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
  // Expandable rows
  isExpandable?: (row: T) => boolean;
  renderExpanded?: (row: T) => ReactNode;
  // Expandable child rows (rendered in same column grid)
  getChildRows?: (row: T) => any[] | undefined;
  childColumns?: Column<any>[];
  childLabel?: (row: T) => string | undefined;
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
  isExpandable,
  renderExpanded,
  getChildRows,
  childColumns,
  childLabel,
}: Props<T>) {
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(defaultPageSize);
  const [sort, setSort] = useState(defaultSort);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

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
  useEffect(() => { setSelected(new Set()); }, [data]);

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
    setSort(prev => ({ key, dir: prev.key === key && prev.dir === 'desc' ? 'asc' : 'desc' }));
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
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === processedData.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(processedData.map(getId)));
    }
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

      <div className="bg-white rounded-lg shadow overflow-auto max-h-[80vh]">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 sticky top-0 z-10">
            <tr>
              {hasExpand && <th className="px-1 py-1.5 w-8"></th>}
              {selectable && (
                <th className="px-2 py-1.5 w-8">
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
                  className={`px-2 py-1.5 whitespace-nowrap ${col.sortable !== false ? 'cursor-pointer select-none hover:bg-gray-100' : ''} ${col.headerClassName || 'text-left'}`}
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
                <tr key={id} className={`border-t hover:bg-gray-50 ${selected.has(id) ? 'bg-blue-50' : ''}`}>
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
                  {columns.map(col => (
                    <td key={col.key} className={col.className || 'px-2 py-1'}>
                      {col.render(row)}
                    </td>
                  ))}
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
                      <td colSpan={colCount} className="px-6 py-1 text-xs text-gray-400">{label}</td>
                    </tr>
                  )}
                  {children.map((child: any, ci: number) => (
                    <tr key={`${id}-child-${child.id ?? ci}`} className="bg-purple-50/30 border-t border-gray-100">
                      {hasExpand && <td></td>}
                      {selectable && <td></td>}
                      {columns.map((col, colIdx) => {
                        const childCol = childColumns!.find(cc => cc.key === col.key);
                        return (
                          <td key={col.key} className={childCol ? (childCol.className || col.className || 'px-3 py-1.5') : 'px-3 py-1.5'}>
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
            <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="px-3 py-1 border rounded disabled:opacity-30">Wstecz</button>
            <span className="text-gray-500">Strona {page + 1} z {totalPages}</span>
            <button onClick={() => setPage(p => p + 1)} disabled={(page + 1) * pageSize >= total} className="px-3 py-1 border rounded disabled:opacity-30">Dalej</button>
          </div>
        </div>
      </div>
    </div>
  );
}
