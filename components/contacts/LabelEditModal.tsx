'use client';

import { useState } from 'react';
import { Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { LocalLabel } from '@/lib/contacts/db';
import { LABEL_COLORS } from '@/lib/contacts/db';
import { Modal, ModalContent, ModalHeader, ModalTitle, ModalBody, ModalFooter } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/button';

interface LabelEditModalProps {
  label: LocalLabel | null;
  onSave: (id: string, name: string, color: string) => void | Promise<void>;
  onClose: () => void;
}

export function LabelEditModal({ label, onSave, onClose }: LabelEditModalProps) {
  const [name, setName] = useState(label?.name ?? '');
  const [color, setColor] = useState(label?.color ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!label) return null;

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('El nombre de la etiqueta no puede estar vacío.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSave(label.id, trimmed, color);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar la etiqueta');
      setBusy(false);
    }
  };

  return (
    <Modal open onOpenChange={onClose}>
      <ModalContent className="max-h-[92vh] flex flex-col overflow-hidden">
        <ModalHeader>
          <ModalTitle>Editar etiqueta</ModalTitle>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
            <X size={20} />
          </button>
        </ModalHeader>

        <ModalBody className="flex-1 overflow-y-auto space-y-4">
          <div>
            <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">Nombre</label>
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nombre de la etiqueta"
              onKeyDown={(e) => {
                if (e.key === 'Enter') void save();
              }}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-2">Color</label>
            <div className="flex flex-wrap gap-2">
              {LABEL_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={cn(
                    'w-7 h-7 rounded-full transition-transform',
                    color === c && 'ring-2 ring-offset-2 ring-zinc-900 dark:ring-zinc-100 scale-110',
                  )}
                  style={{ backgroundColor: c }}
                  aria-label={`Color ${c}`}
                >
                  {color === c && <Check size={14} className="text-white mx-auto" />}
                </button>
              ))}
              <label className="relative inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 px-2 py-1.5 text-xs text-zinc-600 dark:text-zinc-300 cursor-pointer">
                Personalizado
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="w-5 h-5 border-0 bg-transparent cursor-pointer"
                />
              </label>
            </div>
          </div>

          {error && <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}
        </ModalBody>

        <ModalFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={() => void save()} disabled={busy}>
            {busy ? 'Guardando…' : 'Guardar'}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}