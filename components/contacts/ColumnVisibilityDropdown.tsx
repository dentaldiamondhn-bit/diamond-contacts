'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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

/**
 * Column visibility menu.
 *
 * Portaled into `document.body` because glass surfaces use `backdrop-filter`,
 * which creates a stacking context that would clip an inline menu.
 *
 * Accessibility notes:
 * - Uses `aria-haspopup="listbox"` (not the incorrect `role="menu"`) since the
 *   options are native checkboxes that handle their own Tab/Space keyboard
 *   interaction.
 * - Returns focus to the trigger button when the menu closes (Escape or
 *   click outside).
 */
export function ColumnVisibilityDropdown({ columns, visible, onToggle }: ColumnVisibilityDropdownProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const updatePosition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPos({ top: rect.bottom + 8, left: rect.right });
  }, []);

  const returnFocus = useCallback(() => {
    triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        returnFocus();
      }
    };
    const onReflow = () => updatePosition();

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onReflow);
    window.addEventListener('scroll', onReflow, true);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onReflow);
      window.removeEventListener('scroll', onReflow, true);
    };
  }, [open, updatePosition, returnFocus]);

  const menu =
    open && pos
      ? createPortal(
          <div
            ref={menuRef}
            aria-label="Columnas"
            style={{ position: 'fixed', top: pos.top, left: pos.left, transform: 'translateX(-100%)' }}
            className="z-[9999] w-56 min-w-[200px] rounded-xl glass-card shadow-2xl py-1"
          >
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
                    className="accent-blue-600 cursor-pointer disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:outline-none"
                  />
                  <span className={cn(col.lockable && 'opacity-60')}>{col.label}</span>
                </label>
              ))}
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        ref={triggerRef}
        onClick={() => {
          if (!open) updatePosition();
          setOpen((v) => !v);
        }}
        className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
        title="Columnas"
        aria-label="Columnas"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <Columns size={16} /> Columnas
      </button>
      {menu}
    </>
  );
}
