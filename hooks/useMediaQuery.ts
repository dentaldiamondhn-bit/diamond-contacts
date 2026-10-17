'use client';

import { useEffect, useState } from 'react';

/**
 * Subscribes to a CSS media query.
 *
 * Used to render *one* of the two contacts views instead of both behind
 * `hidden sm:block` / `sm:hidden`. Tailwind's responsive `display` only hides
 * markup visually: React still mounts both trees, so the page was building
 * 2 x N rows (and 2 x N Lottie WhatsApp icons) and re-rendering all of them on
 * every keystroke. Branching on the query keeps exactly one tree mounted.
 *
 * Starts `false` and syncs in an effect so server and first client render agree
 * (no hydration mismatch).
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia(query);
    const update = () => setMatches(mql.matches);
    update();
    // Safari < 14 only has the deprecated addListener/removeListener API.
    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', update);
      return () => mql.removeEventListener('change', update);
    }
    mql.addListener(update);
    return () => mql.removeListener(update);
  }, [query]);

  return matches;
}

/** True at Tailwind's `sm` breakpoint and above, i.e. where the table is shown. */
export function useIsWide(): boolean {
  return useMediaQuery('(min-width: 640px)');
}

/**
 * Returns `value` only after it has stopped changing for `delay` ms.
 *
 * The contacts search runs a full IndexedDB read plus a per-contact string build
 * on every change, so feeding it the raw input value re-ran that on every
 * keystroke and made typing feel heavy. The input itself keeps the immediate
 * value, so typing stays responsive while the query trails behind.
 */
export function useDebouncedValue<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    if (value === debounced) return;
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, debounced, delay]);

  return debounced;
}