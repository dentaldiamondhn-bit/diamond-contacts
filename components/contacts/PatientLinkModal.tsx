'use client';

import { useEffect, useState } from 'react';
import { BadgeCheck, Loader2, Search, X } from 'lucide-react';
import type { LocalContact } from '@/lib/contacts/db';
import { fullName } from '@/lib/contacts/db';
import {
  linkContactToPatient,
  scorePatientMatch,
  type PatientLinkMatch,
} from '@/lib/contacts/patientLink';
import { Modal, ModalContent, ModalHeader, ModalTitle, ModalBody, ModalFooter } from '@/components/ui/Modal';
import { Button } from '@/components/ui/button';

interface PatientLinkModalProps {
  open: boolean;
  contact: LocalContact;
  onClose: () => void;
}

export function PatientLinkModal({ open, contact, onClose }: PatientLinkModalProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Array<{ patient: PatientLinkMatch; score: number }>>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Seed suggestions with the contact's own name so likely matches surface first.
  useEffect(() => {
    if (!open) return;
    setQuery(fullName(contact) || '');
    setResults([]);
    setError('');
  }, [open, contact]);

  // Debounced search against patients (nombre, identidad, teléfono).
  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (!q) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/patients/search?q=${encodeURIComponent(q)}`);
        if (!res.ok) throw new Error();
        const rows: PatientLinkMatch[] = await res.json();
        setResults(
          rows
            .map((patient) => ({ patient, score: scorePatientMatch(contact, patient) }))
            .sort(
              (a, b) =>
                b.score - a.score ||
                (a.patient.nombre_completo ?? '').localeCompare(b.patient.nombre_completo ?? ''),
            ),
        );
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [query, open, contact]);

  const doLink = async (patient: PatientLinkMatch) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await linkContactToPatient(contact, patient);
      onClose();
    } catch {
      setError('No se pudo vincular la ficha. Inténtalo de nuevo.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onOpenChange={(o) => !o && onClose()}>
      <ModalContent className="max-h-[85vh] flex flex-col overflow-hidden">
        <ModalHeader>
          <ModalTitle>Vincular a ficha de paciente</ModalTitle>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
            <X size={20} />
          </button>
        </ModalHeader>

        <ModalBody className="flex-1 overflow-y-auto">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por nombre, identidad o teléfono…"
              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-transparent pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <p className="mt-2 text-xs text-slate-400">
            Se copiará al contacto: datos de información y del historial médico de la ficha elegida.
          </p>

          <div className="mt-4 space-y-1.5">
            {loading ? (
              <p className="flex items-center gap-2 py-3 text-sm text-slate-400">
                <Loader2 size={14} className="animate-spin" /> Buscando…
              </p>
            ) : results.length === 0 ? (
              query.trim() ? (
                <p className="py-3 text-sm text-slate-400">Sin coincidencias.</p>
              ) : (
                <p className="py-3 text-sm text-slate-400">Escribe para buscar pacientes.</p>
              )
            ) : (
              results.map(({ patient, score }) => (
                <button
                  key={patient.paciente_id}
                  onClick={() => void doLink(patient)}
                  disabled={busy}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 p-3 text-left hover:bg-slate-50 dark:hover:bg-slate-700/40 disabled:opacity-60 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-slate-800 dark:text-slate-100">
                      {patient.nombre_completo || 'Sin nombre'}
                    </span>
                    {score > 0 && (
                      <span className="inline-flex items-center gap-1 shrink-0 rounded-full bg-teal-50 dark:bg-teal-500/10 px-2 py-0.5 text-[11px] font-medium text-teal-700 dark:text-teal-300">
                        <BadgeCheck size={12} /> Posible coincidencia
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400">
                    {patient.numero_identidad && <span>{patient.numero_identidad}</span>}
                    {patient.telefono && <span>{patient.telefono}</span>}
                  </div>
                </button>
              ))
            )}
          </div>

          {error && <p className="mt-3 text-sm text-rose-600 dark:text-rose-400">{error}</p>}
        </ModalBody>

        <ModalFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}