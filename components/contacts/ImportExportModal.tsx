'use client';

import { useRef, useState } from 'react';
import { Download, Upload, X, Check } from 'lucide-react';
import type { LocalContact } from '@/lib/contacts/db';
import { createLocalContact, type NewContactInput } from '@/lib/contacts/syncEngine';
import { exportContacts, parseVcfText } from '@/lib/contacts/vcard';
import { Modal, ModalContent, ModalHeader, ModalTitle, ModalBody, ModalFooter } from '@/components/ui/Modal';
import { Button } from '@/components/ui/button';

interface ImportExportModalProps {
  open: boolean;
  userId?: string;
  allContacts: LocalContact[];
  onClose: () => void;
}

export function ImportExportModal({ open, userId, allContacts, onClose }: ImportExportModalProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  const handleFile = async (file: File) => {
    setBusy(true);
    setMessage(null);
    try {
      const text = await file.text();
      const parsed = parseVcfText(text);
      if (parsed.length === 0 || !userId) {
        setMessage({ ok: false, text: 'No se encontraron contactos válidos en el archivo.' });
        return;
      }
      for (const contact of parsed) {
        const input: NewContactInput = {
          first_name: contact.first_name,
          last_name: contact.last_name,
          company: contact.company,
          job_title: contact.job_title,
          notes: contact.notes,
          phones: (contact.phones ?? []).map((p) => ({
            type: (['mobile', 'work', 'home', 'whatsapp'] as string[]).includes(p.type) ? (p.type as NewContactInput['phones'][number]['type']) : 'other',
            phone_number: p.phone_number,
            is_primary: p.is_primary ?? false,
          })),
          emails: (contact.emails ?? []).map((e) => ({
            type: (['work', 'personal'] as string[]).includes(e.type) ? (e.type as 'work' | 'personal' | 'other') : 'other',
            email: e.email,
            is_primary: e.is_primary ?? false,
          })),
        };
        await createLocalContact(userId, input);
      }
      setMessage({ ok: true, text: `Se importaron ${parsed.length} contacto${parsed.length > 1 ? 's' : ''}.` });
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : 'Error al importar el archivo.' });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <Modal open={open} onOpenChange={onClose}>
      <ModalContent>
        <ModalHeader>
          <ModalTitle>Importar / Exportar contactos</ModalTitle>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
            <X size={20} />
          </button>
        </ModalHeader>
        <ModalBody className="space-y-4">
          <div className="space-y-2">
            <p className="text-sm font-medium text-zinc-800 dark:text-zinc-100">Exportar</p>
            <Button variant="outline" className="w-full justify-start" onClick={() => exportContacts(allContacts)}>
              <Download size={16} className="mr-2" /> Exportar todos ({allContacts.length}) a .vcf
            </Button>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium text-zinc-800 dark:text-zinc-100">Importar desde .vcf</p>
            <label className="flex items-center gap-2 w-full rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 px-4 py-3 text-sm text-zinc-600 dark:text-zinc-300 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors">
              <Upload size={16} /> {busy ? 'Importando…' : 'Seleccionar archivo .vcf / .vcard'}
              <input
                ref={fileRef}
                type="file"
                accept=".vcf,.vcard,text/vcard"
                className="hidden"
                disabled={busy}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleFile(file);
                }}
              />
            </label>
            <p className="text-xs text-zinc-400 dark:text-zinc-500">
              Los contactos importados se guardan localmente y se sincronizan en segundo plano.
            </p>
          </div>
          {message && (
            <div
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
                message.ok
                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400'
                  : 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400'
              }`}
            >
              {message.ok ? <Check size={15} /> : <X size={15} />}
              {message.text}
            </div>
          )}
        </ModalBody>
        <ModalFooter>
          <Button variant="outline" onClick={onClose}>Cerrar</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}