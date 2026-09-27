'use client';

import { useState } from 'react';
import { AlertTriangle, Trash2, X } from 'lucide-react';
import type { LocalContact } from '@/lib/contacts/db';
import { fullName } from '@/lib/contacts/db';
import { Modal, ModalContent, ModalHeader, ModalTitle, ModalBody, ModalFooter } from '@/components/ui/Modal';
import { Button } from '@/components/ui/button';

interface DeleteContactModalProps {
  contacts: LocalContact[];
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}

export function DeleteContactModal({ contacts, onConfirm, onCancel }: DeleteContactModalProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (contacts.length === 0) return null;

  const permanent = contacts.every((c) => c.deleted === 1);
  const shown = contacts.slice(0, 2).map((c) => fullName(c) || 'Contacto sin nombre');
  const more = contacts.length - shown.length;

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo completar la eliminación');
      setBusy(false);
    }
  };

  return (
    <Modal open onOpenChange={onCancel}>
      <ModalContent className="max-h-[92vh] flex flex-col overflow-hidden">
        <ModalHeader>
          <ModalTitle>
            <span className="inline-flex items-center gap-2">
              <Trash2 size={18} className="text-rose-500" />
              {permanent ? 'Eliminar definitivamente' : 'Mover a la papelera'}
            </span>
          </ModalTitle>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
            <X size={20} />
          </button>
        </ModalHeader>

        <ModalBody className="flex-1 overflow-y-auto space-y-4">
          {permanent && (
            <div className="flex items-start gap-3 rounded-lg border border-rose-200 dark:border-rose-900 bg-rose-50/60 dark:bg-rose-500/5 p-3">
              <AlertTriangle size={18} className="text-rose-500 shrink-0 mt-0.5" />
              <p className="text-sm text-rose-700 dark:text-rose-300">
                Esta acción no se puede deshacer. Se eliminará de este dispositivo y de la nube, incluyendo
                teléfonos, correos, etiquetas e historial clínico.
              </p>
            </div>
          )}

          <p className="text-sm text-zinc-600 dark:text-zinc-300">
            {shown.length === 1 ? (
              <>
                ¿Estás seguro de {permanent ? 'eliminar definitivamente' : 'mover a la papelera'} a{' '}
                <span className="font-medium text-zinc-900 dark:text-zinc-100">{shown[0]}</span>?
              </>
            ) : (
              <>
                ¿Estás seguro de {permanent ? 'eliminar definitivamente' : 'mover a la papelera'} los contactos:{' '}
                <span className="font-medium text-zinc-900 dark:text-zinc-100">{shown.join(', ')}</span>
                {more > 0 ? <> y {more} más</> : null}?
              </>
            )}
          </p>

          {!permanent && (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Podrás restaurarlo desde la papelera en cualquier momento.
            </p>
          )}

          {error && <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}
        </ModalBody>

        <ModalFooter>
          <Button variant="outline" onClick={onCancel} disabled={busy}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={confirm} disabled={busy}>
            <Trash2 size={15} className="mr-1.5" />
            {busy ? 'Eliminando…' : permanent ? 'Eliminar definitivamente' : 'Mover a la papelera'}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}