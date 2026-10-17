'use client';

import { useEffect } from 'react';
import { useFocusTrap } from '@/hooks/useFocusTrap';

interface MobileSidebarSheetProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

/**
 * Left slide-over drawer used to surface the full ContactsSidebar on small
 * screens (below `lg`), where the pinned sidebar is hidden to maximize table
 * width. Modals (z-50) intentionally sit above this (z-40).
 *
 * Scroll lock: saves scrollY, pins `body` with `position: fixed` + negative
 * `top` so the page doesn't jump, restores scroll position on close. Works
 * reliably on iOS Safari (unlike `document.body.style.overflow='hidden'`).
 * Safe areas: sheet panel adds `env(safe-area-inset-*)` padding so content
 * clears notches, status bars and gesture indicators on the Capacitor shell.
 */
export function MobileSidebarSheet({ open, onClose, children }: MobileSidebarSheetProps) {
  // Confine Tab to the drawer and restore focus to the hamburger on close, so
  // keyboard users are not dropped behind the overlay.
  const panelRef = useFocusTrap<HTMLDivElement>(open);

  useEffect(() => {
    if (!open) return;
    const scrollY = window.scrollY;
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = '100%';
    document.body.style.overflow = 'hidden';

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const preventTouchMove = (e: TouchEvent) => e.preventDefault();

    document.addEventListener('keydown', onKey);
    ;(document as any).addEventListener('touchmove', preventTouchMove, { passive: false });

    return () => {
      document.removeEventListener('keydown', onKey);
      ;(document as any).removeEventListener('touchmove', preventTouchMove, { passive: false });
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      document.body.style.overflow = '';
      window.scrollTo(0, scrollY);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 lg:hidden">
      <div
        className="absolute inset-0 animate-fade-in bg-slate-950/45 backdrop-blur-sm touch-none"
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={panelRef}
        className="absolute inset-y-0 left-0 flex w-80 max-w-[85vw] animate-slide-in-left shadow-2xl pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
      >
        {children}
      </div>
    </div>
  );
}
