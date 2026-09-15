import type { PointerMode } from '../engine/types';
import { cn } from '../utils/cn';

const MODES: { id: PointerMode; label: string; hint: string }[] = [
  { id: 'stylus', label: 'Finger & Stift', hint: 'Für Finger und günstige Universal-Stifte (mit Glättung)' },
  { id: 'pen', label: 'Apple Pencil', hint: 'Nur Stift + Maus, Handballen wird ignoriert' },
  { id: 'all', label: 'Alles', hint: 'Maus, Touch und Stift gleichzeitig' },
];


export default function PointerModePicker({ value, onChange }: { value: PointerMode; onChange: (m: PointerMode) => void }) {
  return (
    <div>
      <p className="mb-1.5 text-sm font-semibold">Womit schreibst du?</p>
      <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Eingabemodus">
        {MODES.map((m) => (
          <button
            key={m.id}
            role="radio"
            aria-checked={value === m.id}
            onClick={() => onChange(m.id)}
            className={cn(
              'min-h-[52px] rounded-xl border px-2 py-1.5 text-xs font-semibold',
              value === m.id
                ? 'border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900'
                : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900',
            )}
          >
            {m.label}
          </button>
        ))}
      </div>
      <p className="mt-1 text-xs text-slate-400">{MODES.find((m) => m.id === value)?.hint}</p>
    </div>
  );
}
