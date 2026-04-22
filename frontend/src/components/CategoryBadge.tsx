interface Props {
  name: string | null;
  color: string | null;
}

export default function CategoryBadge({ name, color }: Props) {
  if (!name) return <span className="text-gray-400 text-xs">brak kategorii</span>;
  return (
    <span
      className="inline-block px-2 py-0.5 rounded text-xs font-medium text-white"
      style={{ backgroundColor: color || '#6b7280' }}
    >
      {name}
    </span>
  );
}
