'use client';

import { useEffect } from 'react';

interface MobileSidebarSheetProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

/**
 * Left slide-over drawer used to surface the full ContactsSidebar on small
 * screens (below `lg`), where the pinned sidebar is hidden to maximize table
 * width. Modals (z-50) intentionally sit above this (z-40).
 */
export function MobileSidebarSheet({ open, onClose, children }: MobileSidebarSheetProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 lg:hidden">
      <div className="absolute inset-0 animate-fade-in bg-slate-950/45 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div className="absolute inset-y-0 left-0 flex w-80 max-w-[85vw] animate-slide-in-left shadow-2xl">
        {children}
      </div>
    </div>
  );
}