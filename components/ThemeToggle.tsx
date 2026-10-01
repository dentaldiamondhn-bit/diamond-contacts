'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ThemeToggleProps {
  className?: string;
}

/**
 * Moon/Sun toggle synced to next-themes. Renders nothing until mounted so the
 * icon never flashes the classifier result during hydration.
 */
export function ThemeToggle({ className }: ThemeToggleProps) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return <div className={cn('h-8 w-8 rounded-lg', className)} aria-hidden />;
  }

  const dark = resolvedTheme === 'dark';

  return (
    <button
      onClick={() => setTheme(dark ? 'light' : 'dark')}
      title={dark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
      aria-label={dark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
      className={cn(
        'relative inline-flex h-8 w-8 items-center justify-center rounded-lg transition-all',
        'text-zinc-500 hover:text-teal-600 hover:bg-white/70 dark:text-zinc-400 dark:hover:text-teal-300 dark:hover:bg-white/10',
        'hover:-translate-y-0.5 active:translate-y-0',
        className,
      )}
    >
      {dark ? <Moon size={16} /> : <Sun size={17} />}
    </button>
  );
}