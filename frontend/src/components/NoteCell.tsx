import { useState, useRef } from 'react';
import { api } from '../api/client';

export default function NoteCell({ txId, note, onSave }: { txId: number; note: string | null; onSave: (txId: number, note: string | null) => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(note || '');
  const saving = useRef(false);

  const save = async () => {
    if (saving.current) return;
    saving.current = true;
    const newNote = value || null;
    setEditing(false);
    onSave(txId, newNote);
    await api.updateTransaction(txId, { note: newNote });
    saving.current = false;
  };

  if (editing) {
    return (
      <input
        value={value}
        onChange={e => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }}
        className="border rounded px-1 py-0.5 text-xs w-full"
        autoFocus
      />
    );
  }

  return (
    <span
      onClick={() => { setValue(note || ''); setEditing(true); }}
      className={`cursor-pointer text-xs block truncate max-w-[140px] ${note ? 'text-gray-600' : 'text-gray-300 italic hover:text-gray-400'}`}
      title={note || 'Kliknij aby dodać notatkę'}
    >
      {note || '+'}
    </span>
  );
}
