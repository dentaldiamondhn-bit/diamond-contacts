'use client';

import { useEffect, useRef, useState } from 'react';
import { Columns } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ColumnDef {
  key: string;
  label: string;
  lockable?: boolean;
}

interface ColumnVisibilityDropdownProps {
  columns: ColumnDef[];
  visible: Set<string>;
  onToggle: (key: string) => void;
}

export function ColumnVisibilityDropdown({ columns, visible, onToggle }: ColumnVisibilityDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
        title="Columnas"
        aria-label="Columnas"
        aria-expanded={open}
      >
        <Columns size={16} /> Columnas
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-56 rounded-lg bg-white dark:bg-zinc-800 shadow-lg ring-1 ring-black/5 ring-opacity-5 dark:ring-zinc-700 focus:outline-none z-50">
          <p className="px-4 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
            Columnas
          </p>
          <div className="py-1">
            {columns.map((col) => (
              <label
                key={col.key}
                className="flex items-center gap-2.5 px-4 py-2 text-sm text-zinc-700 dark:text-zinc-200 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-700/50"
              >
                <input
                  type="checkbox"
                  checked={visible.has(col.key)}
                  disabled={col.lockable}
                  onChange={() => onToggle(col.key)}
                  className="accent-blue-600 cursor-pointer disabled:cursor-not-allowed"
                />
                <span className={cn(col.lockable && 'opacity-60')}>{col.label}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}