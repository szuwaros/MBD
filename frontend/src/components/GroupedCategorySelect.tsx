interface Props {
  categories: any[];
  value: string | number;
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
}

export default function GroupedCategorySelect({ categories, value, onChange, className = '', placeholder = '-' }: Props) {
  // Group by group_name, fallback to cat_type label
  const groupOrder: string[] = [];
  const groupMap = new Map<string, any[]>();

  for (const c of categories) {
    const group = c.group_name || (c.cat_type === 'income' ? 'Przychody' : c.cat_type === 'transfer' ? 'Finanse' : 'Inne');
    if (!groupMap.has(group)) {
      groupOrder.push(group);
      groupMap.set(group, []);
    }
    groupMap.get(group)!.push(c);
  }

  return (
    <select value={value || ''} onChange={e => onChange(e.target.value)} className={className}>
      <option value="">{placeholder}</option>
      {groupOrder.map(group => (
        <optgroup key={group} label={group}>
          {groupMap.get(group)!.map((c: any) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
