import { useState, useEffect } from 'react';

export type Preset = 'today' | '7d' | 'week' | '30d' | 'month' | '365d' | 'year' | 'all' | 'custom';

const PRESET_LABELS: Record<Preset, string> = {
  today: 'Dziś',
  '7d': '7 dni',
  week: 'Tydzień',
  '30d': '30 dni',
  month: 'Miesiąc',
  '365d': '365 dni',
  year: 'Rok',
  all: 'Całość',
  custom: 'Zakres',
};

function fmt(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function calcRange(preset: Preset, offset: number): { from: string; to: string; label: string } {
  const now = new Date();
  let from: Date, to: Date, label: string;

  switch (preset) {
    case 'today': {
      const d = new Date(now);
      d.setDate(d.getDate() + offset);
      from = to = d;
      label = fmt(d);
      break;
    }
    case '7d': {
      to = new Date(now);
      to.setDate(to.getDate() + offset * 7);
      from = new Date(to);
      from.setDate(from.getDate() - 6);
      label = `${fmt(from)} — ${fmt(to)}`;
      break;
    }
    case 'week': {
      const ref = new Date(now);
      ref.setDate(ref.getDate() + offset * 7);
      const day = ref.getDay() || 7;
      from = new Date(ref);
      from.setDate(ref.getDate() - day + 1);
      to = new Date(from);
      to.setDate(from.getDate() + 6);
      label = `${fmt(from)} — ${fmt(to)}`;
      break;
    }
    case '30d': {
      to = new Date(now);
      to.setDate(to.getDate() + offset * 30);
      from = new Date(to);
      from.setDate(from.getDate() - 29);
      label = `${fmt(from)} — ${fmt(to)}`;
      break;
    }
    case 'month': {
      const m = new Date(now.getFullYear(), now.getMonth() + offset, 1);
      from = m;
      to = new Date(m.getFullYear(), m.getMonth() + 1, 0);
      const monthNames = ['Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec', 'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień'];
      label = `${monthNames[m.getMonth()]} ${m.getFullYear()}`;
      break;
    }
    case '365d': {
      to = new Date(now);
      to.setDate(to.getDate() + offset * 365);
      from = new Date(to);
      from.setDate(from.getDate() - 364);
      label = `${fmt(from)} — ${fmt(to)}`;
      break;
    }
    case 'year': {
      const y = now.getFullYear() + offset;
      from = new Date(y, 0, 1);
      to = new Date(y, 11, 31);
      label = String(y);
      break;
    }
    case 'all': {
      from = new Date(2000, 0, 1);
      to = now;
      label = 'Całość';
      break;
    }
    default:
      from = to = now;
      label = '';
  }

  return { from: fmt(from), to: fmt(to), label };
}

interface Props {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
  defaultPreset?: Preset;
}

export default function DateRangeSelector({ from, to, onChange, defaultPreset = 'month' }: Props) {
  const [preset, setPreset] = useState<Preset>(defaultPreset);
  const [offset, setOffset] = useState(0);
  const [showCustom, setShowCustom] = useState(false);

  useEffect(() => {
    if (preset === 'custom') return;
    const r = calcRange(preset, offset);
    onChange(r.from, r.to);
  }, [preset, offset]);

  const selectPreset = (p: Preset) => {
    if (p === 'custom') {
      setShowCustom(true);
      setPreset('custom');
      return;
    }
    setShowCustom(false);
    setPreset(p);
    setOffset(0);
  };

  const hasArrows = preset !== 'custom' && preset !== 'all';
  const label = preset !== 'custom' ? calcRange(preset, offset).label : '';
  const isNow = offset === 0;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="flex gap-1 flex-wrap">
        {(Object.keys(PRESET_LABELS) as Preset[]).map(p => (
          <button
            key={p}
            onClick={() => selectPreset(p)}
            className={`px-2 py-1 rounded text-xs ${preset === p ? 'bg-blue-600 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-600'}`}
          >
            {PRESET_LABELS[p]}
          </button>
        ))}
      </div>

      {hasArrows && (
        <div className="flex items-center gap-1">
          <button onClick={() => setOffset(o => o - 1)} className="px-1.5 py-0.5 rounded hover:bg-gray-100 text-gray-500 font-bold">&lsaquo;</button>
          <span className="text-xs text-gray-600 min-w-[140px] text-center">{label}</span>
          <button onClick={() => setOffset(o => o + 1)} disabled={isNow} className="px-1.5 py-0.5 rounded hover:bg-gray-100 text-gray-500 font-bold disabled:opacity-20">&rsaquo;</button>
        </div>
      )}

      {showCustom && (
        <div className="flex items-center gap-2">
          <input type="date" value={from} onChange={e => onChange(e.target.value, to)} className="border rounded px-2 py-1 text-xs" />
          <span className="text-gray-400">—</span>
          <input type="date" value={to} onChange={e => onChange(from, e.target.value)} className="border rounded px-2 py-1 text-xs" />
        </div>
      )}
    </div>
  );
}
