'use client';

import { useState } from 'react';
import { Plus, Star, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { LocalContact, LocalLabel, PhoneType } from '@/lib/contacts/db';
import { fullName, newLocalId } from '@/lib/contacts/db';
import { createLocalContact, updateLocalContact } from '@/lib/contacts/syncEngine';
import { Modal, ModalContent, ModalHeader, ModalTitle, ModalBody, ModalFooter } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/button';
import { ContactAvatar } from './ContactAvatar';

interface DraftPhone {
  id: string;
  type: PhoneType;
  phone_number: string;
  is_primary: boolean;
}

interface DraftContact {
  first_name: string;
  last_name: string;
  notes: string;
  emergency_contact: string;
  is_favorite: boolean;
  is_archived: boolean;
  label_ids: string[];
  phones: DraftPhone[];
}

function emptyDraft(): DraftContact {
  return {
    first_name: '',
    last_name: '',
    notes: '',
    emergency_contact: '',
    is_favorite: false,
    is_archived: false,
    label_ids: [],
    phones: [],
  };
}

function draftFromContact(c: LocalContact): DraftContact {
  return {
    first_name: c.first_name ?? '',
    last_name: c.last_name ?? '',
    notes: c.notes ?? '',
    emergency_contact: c.emergency_contact ?? '',
    is_favorite: c.is_favorite,
    is_archived: c.is_archived,
    label_ids: [...c.label_ids],
    phones: c.phones.map((p) => ({ id: p.id, type: p.type, phone_number: p.phone_number, is_primary: p.is_primary ?? false })),
  };
}

interface ContactEditorModalProps {
  open: boolean;
  editing: LocalContact | null;
  userId?: string;
  labels: LocalLabel[];
  onClose: () => void;
}

export function ContactEditorModal({ open, editing, userId, labels, onClose }: ContactEditorModalProps) {
  const [draft, setDraft] = useState<DraftContact>(() =>
    editing ? draftFromContact(editing) : emptyDraft(),
  );

  if (!open) return null;

  const set = <K extends keyof DraftContact>(key: K, value: DraftContact[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const toggleLabel = (id: string) =>
    setDraft((d) => ({
      ...d,
      label_ids: d.label_ids.includes(id) ? d.label_ids.filter((l) => l !== id) : [...d.label_ids, id],
    }));

  const addPhone = () =>
    set('phones', [
      ...draft.phones,
      {
        id: newLocalId(),
        type: 'mobile',
        phone_number: draft.phones.length === 0 ? '+504 ' : '',
        is_primary: draft.phones.length === 0,
      },
    ]);

  const updatePhone = (id: string, patch: Partial<DraftPhone>) =>
    set('phones', draft.phones.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  const removePhone = (id: string) => set('phones', draft.phones.filter((p) => p.id !== id));

  const sectionTitle = (label: string) => (
    <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">{label}</p>
  );

  const save = async () => {
    if (!userId) return;
    const phones = draft.phones.filter((p) => p.phone_number.trim());
    if (phones.length > 0 && !phones.some((p) => p.is_primary)) phones[0].is_primary = true;
    const payload = {
      first_name: draft.first_name || null,
      last_name: draft.last_name || null,
      notes: draft.notes || null,
      emergency_contact: draft.emergency_contact || null,
      is_favorite: draft.is_favorite,
      is_archived: draft.is_archived,
      label_ids: draft.label_ids,
      phones: phones.map((p) => ({ id: p.id, type: p.type, phone_number: p.phone_number, is_primary: p.is_primary })),
    };
    if (editing) {
      await updateLocalContact(editing.id, payload);
    } else {
      await createLocalContact(userId, { ...payload, emails: [] });
    }
    onClose();
  };

  return (
    <Modal open={open} onOpenChange={onClose}>
      <ModalContent className="max-h-[92vh] flex flex-col overflow-hidden">
        <ModalHeader>
          <ModalTitle>{editing ? 'Editar contacto' : 'Nuevo contacto'}</ModalTitle>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
            <X size={20} />
          </button>
        </ModalHeader>

        <ModalBody className="flex-1 overflow-y-auto space-y-5">
          <div className="flex items-center gap-4">
            <ContactAvatar name={fullName(draft)} size="lg" />
            <div className="grid grid-cols-2 gap-3 flex-1">
              <Input placeholder="Nombre" value={draft.first_name} onChange={(e) => set('first_name', e.target.value)} />
              <Input placeholder="Apellido" value={draft.last_name} onChange={(e) => set('last_name', e.target.value)} />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              {sectionTitle('Teléfonos')}
              <Button type="button" size="sm" variant="outline" onClick={addPhone}>
                <Plus size={14} className="mr-1" /> Agregar
              </Button>
            </div>
            <div className="space-y-2">
              {draft.phones.map((p) => (
                <div key={p.id} className="flex items-center gap-2">
                  <Select value={p.type} onChange={(e) => updatePhone(p.id, { type: e.target.value as PhoneType })} className="w-32 shrink-0">
                    <option value="mobile">Celular</option>
                    <option value="work">Trabajo</option>
                    <option value="home">Casa</option>
                    <option value="whatsapp">WhatsApp</option>
                    <option value="fax">Fax</option>
                    <option value="other">Otro</option>
                  </Select>
                  <Input
                    placeholder="+504 0000-0000"
                    value={p.phone_number}
                    onChange={(e) => updatePhone(p.id, { phone_number: e.target.value })}
                  />
                  <button type="button" onClick={() => removePhone(p.id)} className="text-slate-400 hover:text-rose-500 shrink-0">
                    <X size={16} />
                  </button>
                </div>
              ))}
              {draft.phones.length === 0 && <p className="text-sm text-slate-400">Sin números de teléfono.</p>}
            </div>
          </div>

          {labels.length > 0 && (
            <div>
              {sectionTitle('Etiquetas')}
              <div className="mt-2 flex flex-wrap gap-2">
                {labels.map((label) => {
                  const active = draft.label_ids.includes(label.id);
                  return (
                    <button
                      key={label.id}
                      type="button"
                      onClick={() => toggleLabel(label.id)}
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
                        active
                          ? 'text-white'
                          : 'text-zinc-600 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700',
                      )}
                      style={active ? { backgroundColor: label.color } : undefined}
                    >
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: active ? '#fff' : label.color }} />
                      {label.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div>
            {sectionTitle('Información adicional (optativa)')}
            <div className="mt-2 grid grid-cols-1 gap-3">
              <Input placeholder="Contacto de emergencia" value={draft.emergency_contact} onChange={(e) => set('emergency_contact', e.target.value)} />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">Notas</label>
            <Textarea placeholder="Notas internas..." value={draft.notes} onChange={(e) => set('notes', e.target.value)} />
          </div>

          <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-200 cursor-pointer select-none">
            <input type="checkbox" checked={draft.is_favorite} onChange={(e) => set('is_favorite', e.target.checked)} className="accent-amber-500" />
            <Star size={15} className="text-amber-500" /> Marcar como favorito
          </label>
        </ModalBody>

        <ModalFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={save}>Guardar</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}