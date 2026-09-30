'use client';

import { useEffect, useMemo, useState } from 'react';
import { CalendarPlus, MessageCircle } from 'lucide-react';
import { Modal, ModalContent, ModalHeader, ModalTitle, ModalBody, ModalFooter } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/button';
import { PROCEDURES, PROCEDURE_COLORS, NO_PROCEDURE_COLOR } from '@/lib/types-calendar';
import { clinicDateKey, clinicClockTime } from '@/calendario/rbcAdapter';
import { useToast } from './Toast';

export interface PrefilledContact {
  id: string;
  first_name: string;
  last_name: string;
  phone?: string;
  email?: string;
  patient_id?: string;
}

interface CreateAppointmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  prefilledContact?: PrefilledContact;
  onSuccess?: () => void;
}

function nextHalfHourSlot(now: string): string {
  const [h = 9, m = 0] = now.split(':').map(Number);
  const mins = h * 60 + m;
  const slot = Math.ceil((mins + 1) / 30) * 30;
  return `${String(Math.floor(slot / 60) % 24).padStart(2, '0')}:${String(slot % 60).padStart(2, '0')}`;
}

function addMinutes(time: string, delta: number): string {
  const [h = 0, m = 0] = time.split(':').map(Number);
  const total = (h * 60 + m + delta) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export function CreateAppointmentModal({
  isOpen,
  onClose,
  prefilledContact,
  onSuccess,
}: CreateAppointmentModalProps) {
  const { push } = useToast();
  const patientName = useMemo(() => {
    if (!prefilledContact) return '';
    return [prefilledContact.first_name, prefilledContact.last_name].filter(Boolean).join(' ').trim();
  }, [prefilledContact]);

  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('09:30');
  const [procedure, setProcedure] = useState('');
  const [dentist, setDentist] = useState('');
  const [status, setStatus] = useState<'scheduled' | 'confirmed'>('scheduled');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [conflict, setConflict] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const now = clinicClockTime();
    const start = nextHalfHourSlot(now);
    setTitle(`Cita - ${patientName}`.trim());
    setDate(clinicDateKey());
    setStartTime(start);
    setEndTime(addMinutes(start, 30));
    setProcedure('');
    setDentist('');
    setStatus('scheduled');
    setNotes('');
    setSubmitting(false);
    setConflict(null);
    setError(null);
    setDone(false);
  }, [isOpen, patientName]);

  const phoneDigits = (prefilledContact?.phone ?? '').replace(/\D/g, '');
  const color = procedure ? PROCEDURE_COLORS[procedure] ?? NO_PROCEDURE_COLOR : NO_PROCEDURE_COLOR;

  const waLink = useMemo(() => {
    if (!phoneDigits) return '';
    const intl = phoneDigits.startsWith('504') ? phoneDigits : `504${phoneDigits}`;
    const msg = `Hola ${patientName || 'paciente'}, te confirmamos tu cita${procedure ? ` de ${procedure}` : ''} para el ${date} a las ${startTime}. ¡Te esperamos!`;
    return `https://wa.me/${intl}?text=${encodeURIComponent(msg)}`;
  }, [phoneDigits, patientName, procedure, date, startTime]);

  const submit = async (force = false) => {
    setError(null);
    setConflict(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim() || `Cita - ${patientName}`,
          patient_name: patientName,
          phone: phoneDigits,
          phone_country: '504',
          patient_id: prefilledContact?.patient_id ?? prefilledContact?.id ?? null,
          date,
          start_time: startTime,
          end_time: endTime,
          procedure: procedure || '',
          dentist: dentist.trim(),
          status,
          notes: notes.trim(),
          force_conflict: force,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        if (res.status === 409 && (json as { code?: string })?.code === 'DENTIST_CONFLICT') {
          setConflict((json as { error?: string })?.error ?? 'Conflicto con la agenda del odontólogo.');
          setSubmitting(false);
          return;
        }
        throw new Error((json as { error?: string })?.error || 'No se pudo agendar la cita.');
      }
      setDone(true);
      push('Cita agendada correctamente', 'success');
      onSuccess?.();
    } catch (err) {
      setError((err as Error).message);
      setSubmitting(false);
    }
  };

  const resetAndClose = () => {
    if (submitting) return;
    onClose();
  };

  return (
    <Modal open={isOpen} onOpenChange={() => resetAndClose()}>
      <ModalContent>
        <ModalHeader>
          <ModalTitle className="flex items-center gap-2">
            <span
              className="inline-flex h-7 w-7 items-center justify-center rounded-lg"
              style={{ backgroundColor: color }}
            >
              <CalendarPlus size={15} className="text-white" />
            </span>
            {done ? 'Cita agendada' : 'Agendar cita'}
          </ModalTitle>
        </ModalHeader>

        {done ? (
          <ModalBody>
            <div className="space-y-3 text-center py-2">
              <p className="text-sm text-zinc-600 dark:text-zinc-300">
                La cita de <span className="font-semibold">{patientName || title}</span> fue guardada en la agenda de la
                clínica para el <span className="font-semibold">{date}</span> a las{' '}
                <span className="font-semibold">{startTime}</span>.
              </p>
              {waLink && (
                <a
                  href={waLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => push('Confirmación enviada por WhatsApp', 'success')}
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-4 py-2 transition-colors"
                >
                  <MessageCircle size={16} /> Enviar confirmación por WhatsApp
                </a>
              )}
            </div>
          </ModalBody>
        ) : (
          <ModalBody>
            <div className="space-y-4">
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500 mb-1">
                  Título
                </label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título de la cita" />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-1">
                  <label className="block text-[11px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500 mb-1">
                    Fecha
                  </label>
                  <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="text-sm" />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500 mb-1">
                    Inicio
                  </label>
                  <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="text-sm" />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500 mb-1">
                    Fin
                  </label>
                  <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="text-sm" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500 mb-1">
                    Procedimiento
                  </label>
                  <Select value={procedure} onChange={(e) => setProcedure(e.target.value)}>
                    <option value="">Sin procedimiento</option>
                    {PROCEDURES.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500 mb-1">
                    Odontólogo
                  </label>
                  <Input value={dentist} onChange={(e) => setDentist(e.target.value)} placeholder="Nombre del doctor" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500 mb-1">
                    Estado
                  </label>
                  <Select value={status} onChange={(e) => setStatus(e.target.value as 'scheduled' | 'confirmed')}>
                    <option value="scheduled">Programada</option>
                    <option value="confirmed">Confirmada</option>
                  </Select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500 mb-1">
                    Teléfono
                  </label>
                  <Input value={prefilledContact?.phone ?? ''} readOnly className="text-sm" />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500 mb-1">
                  Notas
                </label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notas para la cita" rows={3} />
              </div>

              {conflict && (
                <div className="rounded-lg border border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300">
                  <p className="font-medium">{conflict}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      onClick={() => void submit(true)}
                      disabled={submitting}
                      className="inline-flex items-center rounded-lg bg-amber-600 hover:bg-amber-700 disabled:opacity-50 px-3 py-1.5 text-xs font-medium text-white transition-colors"
                    >
                      Agendar de todos modos
                    </button>
                    <button
                      onClick={() => setConflict(null)}
                      className="text-xs font-medium text-amber-700 dark:text-amber-300 hover:underline"
                    >
                      Cambiar horario
                    </button>
                  </div>
                </div>
              )}

              {error && (
                <p className="rounded-lg border border-rose-300 dark:border-rose-500/40 bg-rose-50 dark:bg-rose-500/10 p-3 text-sm text-rose-700 dark:text-rose-300">
                  {error}
                </p>
              )}
            </div>
          </ModalBody>
        )}

        <ModalFooter>
          <Button variant="outline" onClick={resetAndClose} disabled={submitting}>
            {done ? 'Cerrar' : 'Cancelar'}
          </Button>
          {!done && (
            <Button onClick={() => void submit()} disabled={submitting} className="min-w-[140px]">
              {submitting ? 'Guardando…' : 'Agendar cita'}
            </Button>
          )}
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}