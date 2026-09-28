'use client';

import { Printer, X } from 'lucide-react';
import type { LocalContact } from '@/lib/contacts/db';
import { openPrintPreview } from '@/lib/contacts/vcard';
import { Button } from '@/components/ui/button';

interface PrintPreviewModalProps {
  open: boolean;
  contact: LocalContact;
  onClose: () => void;
}

/**
 * Inline print preview. Avoids window.open() entirely (blocked in the Android
 * WebView shell) and instead renders the contact as a modal and triggers the
 * native print dialog via window.print(), with a visibility-based @media print
 * rule so only the preview card lands on paper.
 */
export function PrintPreviewModal({ open, contact, onClose }: PrintPreviewModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/40 print:hidden" onClick={onClose} />
      <div className="print-modal-content relative w-full max-w-lg bg-white rounded-xl shadow-xl flex flex-col max-h-[90vh] overflow-hidden print:max-h-none print:shadow-none">
        <div className="print:hidden flex items-center justify-between px-4 py-3 border-b border-zinc-200 sticky top-0 bg-white">
          <h3 className="text-sm font-semibold text-zinc-900">Vista previa de impresión</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>
        <div
          className="flex-1 overflow-y-auto p-5 print:overflow-visible"
          dangerouslySetInnerHTML={{ __html: openPrintPreview(contact) }}
        />
        <div className="print:hidden flex justify-end gap-2 px-4 py-3 border-t border-zinc-200 sticky bottom-0 bg-white">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => window.print()}>
            <Printer size={15} className="mr-1" /> Imprimir
          </Button>
        </div>
      </div>
      <style>{`
        .print-modal-content { font-family: system-ui, Segoe UI, Roboto, sans-serif; color: #18181b; }
        .print-modal-content h1 { font-size: 26px; margin-bottom: 4px; }
        .print-modal-content .sub { color: #71717a; margin-bottom: 24px; }
        .print-modal-content section { margin-bottom: 24px; }
        .print-modal-content h2 { font-size: 12px; text-transform: uppercase; letter-spacing: .05em; color: #a1a1aa; margin-bottom: 8px; border-bottom: 1px solid #e4e4e7; padding-bottom: 6px; }
        .print-modal-content ul { list-style: none; padding: 0; margin: 0; }
        .print-modal-content li { padding: 5px 0; color: #3f3f46; }
        .print-modal-content li b { color: #18181b; display: inline-block; min-width: 80px; }
        @media print {
          body * { visibility: hidden; }
          .print-modal-content, .print-modal-content * { visibility: visible; }
          .print-modal-content { position: absolute; left: 0; top: 0; width: 100%; }
        }
      `}</style>
    </div>
  );
}