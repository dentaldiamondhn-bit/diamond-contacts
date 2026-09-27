'use client';

import { useState } from 'react';
import { X, HeartPulse } from 'lucide-react';
import type { LocalContact, MedicalHistory } from '@/lib/contacts/db';
import { updateMedicalHistory } from '@/lib/contacts/syncEngine';
import { meaningfulMedicalTags } from '@/lib/contacts/patientLink';
import { Modal, ModalContent, ModalHeader, ModalTitle, ModalBody, ModalFooter } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Button } from '@/components/ui/button';

function splitList(value: string): string[] {
  return meaningfulMedicalTags(value.split(/[,\n]/).map((s) => s.trim()));
}

const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

interface MedicalHistoryModalProps {
  open: boolean;
  contact: LocalContact;
  medical?: MedicalHistory;
  onClose: () => void;
}

export function MedicalHistoryModal({ open, contact, medical, onClose }: MedicalHistoryModalProps) {
  const [allergies, setAllergies] = useState(medical?.allergies.join(', ') ?? '');
  const [chronicConditions, setChronicConditions] = useState(medical?.chronicConditions.join(', ') ?? '');
  const [currentMedications, setCurrentMedications] = useState(medical?.currentMedications.join(', ') ?? '');
  const [odontogramNotes, setOdontogramNotes] = useState(medical?.odontogramNotes ?? '');
  const [lastDentalVisit, setLastDentalVisit] = useState(medical?.lastDentalVisit ?? '');
  const [bloodType, setBloodType] = useState(medical?.bloodType ?? '');
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  const save = async () => {
    setSaving(true);
    try {
      await updateMedicalHistory(contact.id, {
        allergies: splitList(allergies),
        chronicConditions: splitList(chronicConditions),
        currentMedications: splitList(currentMedications),
        odontogramNotes: odontogramNotes.trim() || null,
        lastDentalVisit: lastDentalVisit.trim() || null,
        bloodType: bloodType || null,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onOpenChange={onClose}>
      <ModalContent className="max-h-[92vh] flex flex-col overflow-hidden">
        <ModalHeader>
          <ModalTitle>
            <span className="inline-flex items-center gap-2">
              <HeartPulse size={18} className="text-rose-500" /> Editar antecedentes
            </span>
          </ModalTitle>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
            <X size={20} />
          </button>
        </ModalHeader>

        <ModalBody className="flex-1 overflow-y-auto space-y-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Los campos de texto aceptan varios valores separados por coma. Los cambios se guardan localmente y se
            sincronizan con la nube.
          </p>

          <div>
            <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">Alergias</label>
            <Textarea
              rows={2}
              placeholder="Penicilina, Anestesia con epinefrina, Látex"
              value={allergies}
              onChange={(e) => setAllergies(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">
              Condiciones crónicas
            </label>
            <Textarea
              rows={2}
              placeholder="Diabetes tipo II, Hipertensión"
              value={chronicConditions}
              onChange={(e) => setChronicConditions(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">
              Medicamentos actuales
            </label>
            <Textarea
              rows={2}
              placeholder="Metformina 500mg, Losartán 50mg"
              value={currentMedications}
              onChange={(e) => setCurrentMedications(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">
                Última consulta odontológica
              </label>
              <Input
                type="text"
                value={lastDentalVisit}
                onChange={(e) => setLastDentalVisit(e.target.value)}
                placeholder="Ej: hace 6 meses"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">
                Tipo de sangre
              </label>
              <select
                value={bloodType}
                onChange={(e) => setBloodType(e.target.value)}
                className="flex h-9 w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Sin registrar</option>
                {BLOOD_TYPES.map((bt) => (
                  <option key={bt} value={bt}>
                    {bt}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">
              Notas de odontograma (resumen)
            </label>
            <Textarea
              rows={3}
              placeholder="Resumen clínico breve del plan/odontograma..."
              value={odontogramNotes}
              onChange={(e) => setOdontogramNotes(e.target.value)}
            />
          </div>
        </ModalBody>

        <ModalFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar antecedentes'}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}