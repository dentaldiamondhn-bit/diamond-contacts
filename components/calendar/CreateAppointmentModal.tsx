'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, CalendarPlus, MessageCircle, Search, UserRound, Users, X } from 'lucide-react';
import { Modal, ModalContent, ModalHeader, ModalTitle, ModalBody, ModalFooter } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/button';
import { PROCEDURES, PROCEDURE_COLORS, NO_PROCEDURE_COLOR } from '@/lib/types-calendar';
import { clinicDateKey, clinicClockTime } from '@/calendario/rbcAdapter';
import { useToast } from './Toast';
import { openWhatsAppDirectly } from '@/lib/contacts/vcard';

export interface PrefilledContact {
  id: string;
  first_name: string;
  last_name: string;
  phone?: string;
  email?: string;
  patient_id?: string;
}

/** One patient result from `/api/patients/search` (patients table row). */
interface SearchResult {
  paciente_id: string;
  nombre_completo: string;
  telefono?: string;
  codigopais?: string;
}

/** Lightweight clinic-user snapshot for the invitee picker (mirrors `/api/users` shape). */
interface DraftInvitee {
  id: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  profileImageUrl?: string | null;
  role?: string;
}

const avatarFor = (u: DraftInvitee) =>
  u.profileImageUrl ||
  `https://ui-avatars.com/api/?name=${encodeURIComponent((u.first_name || '') + ' ' + (u.last_name || ''))}&background=random`;

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

  // patient search
  const [selectedPatient, setSelectedPatient] = useState<SearchResult | null>(null);
  const [showPatientSearch, setShowPatientSearch] = useState(false);
  const [patientQuery, setPatientQuery] = useState('');
  const [patientResults, setPatientResults] = useState<SearchResult[]>([]);
  const [patientSearching, setPatientSearching] = useState(false);

  // invitees
  const [userPool, setUserPool] = useState<DraftInvitee[]>([]);
  const [invitees, setInvitees] = useState<DraftInvitee[]>([]);
  const [showInviteePicker, setShowInviteePicker] = useState(false);
  const [inviteeQuery, setInviteeQuery] = useState('');

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
    setSelectedPatient(null);
    setShowPatientSearch(false);
    setPatientQuery('');
    setPatientResults([]);
    setPatientSearching(false);
    setInvitees([]);
    setShowInviteePicker(false);
    setInviteeQuery('');

    // Load user pool for the invitee picker (clinic staff from Clerk).
    fetch('/api/users')
      .then((r) => (r.ok ? r.json() : []))
      .catch(() => [])
      .then((users) => setUserPool(users as DraftInvitee[]));
  }, [isOpen, patientName]);

  // patient search debounce (ported from the calendar's EventModal step 1)
  useEffect(() => {
    if (!showPatientSearch || patientQuery.trim() === '') {
      setPatientResults([]);
      return;
    }
    const t = setTimeout(async () => {
      setPatientSearching(true);
      try {
        const res = await fetch(`/api/patients/search?q=${encodeURIComponent(patientQuery)}`);
        if (res.ok) setPatientResults(((await res.json()) as SearchResult[]).slice(0, 6));
      } catch {
        // ignore
      } finally {
        setPatientSearching(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [patientQuery, showPatientSearch]);

  const selectPatient = (p: SearchResult) => {
    setSelectedPatient(p);
    setTitle((prev) => (prev.trim() ? prev : `Cita con ${p.nombre_completo}`));
    setShowPatientSearch(false);
    setPatientQuery('');
    setPatientResults([]);
  };

  const filteredPool = userPool.filter((u) => {
    const q = inviteeQuery.toLowerCase();
    return (
      `${u.first_name || ''} ${u.last_name || ''}`.toLowerCase().includes(q) ||
      (u.email || '').toLowerCase().includes(q)
    );
  });

  const effectivePatientName = selectedPatient?.nombre_completo ?? patientName;
  const effectivePhone = selectedPatient?.telefono ?? prefilledContact?.phone ?? '';
  const phoneDigits = effectivePhone.replace(/\D/g, '');
  const phoneCountry = selectedPatient?.codigopais || '504';
  const color = procedure ? PROCEDURE_COLORS[procedure] ?? NO_PROCEDURE_COLOR : NO_PROCEDURE_COLOR;

  const waMessage = useMemo(() => {
    if (!phoneDigits) return '';
    return `Hola ${effectivePatientName || 'paciente'}, te confirmamos tu cita${procedure ? ` de ${procedure}` : ''} para el ${date} a las ${startTime}. ¡Te esperamos!`;
  }, [phoneDigits, effectivePatientName, procedure, date, startTime]);

  const submit = async (force = false) => {
    setError(null);
    setConflict(null);
    setSubmitting(true);
    try {
      const firstDoctor = invitees.find(
        (i) => (i.role || '').toLowerCase() === 'doctor'
      );
      const dentistName = firstDoctor
        ? `${firstDoctor.first_name || ''} ${firstDoctor.last_name || ''}`.trim()
        : '';
      const res = await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim() || `Cita - ${effectivePatientName}`,
          patient_name: effectivePatientName,
          phone: phoneDigits,
          phone_country: phoneCountry,
          patient_id: selectedPatient?.paciente_id ?? prefilledContact?.patient_id ?? prefilledContact?.id ?? null,
          date,
          start_time: startTime,
          end_time: endTime,
          procedure: procedure || '',
          dentist: dentist.trim() || dentistName,
          status,
          notes: notes.trim(),
          invitees: invitees.map((i) => i.id),
          force_conflict: force,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        if (res.status === 409) {
          const code = (json as { code?: string })?.code;
          if (code === 'DENTIST_CONFLICT' || code === 'INVITEE_CONFLICT') {
            setConflict(
              (json as { error?: string })?.error ??
                'Conflicto de agenda: hay otra cita en ese horario.'
            );
            setSubmitting(false);
            return;
          }
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
                La cita de <span className="font-semibold">{effectivePatientName || title}</span> fue guardada en la agenda de la
                clínica para el <span className="font-semibold">{date}</span> a las{' '}
                <span className="font-semibold">{startTime}</span>.
              </p>
              {phoneDigits && waMessage && (
                <button
                  type="button"
                  onClick={() => {
                    push('Confirmación enviada por WhatsApp', 'success');
                    void openWhatsAppDirectly(effectivePhone, waMessage, `+${phoneCountry}`);
                  }}
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-4 py-2 transition-colors"
                >
                  <MessageCircle size={16} /> Enviar confirmación por WhatsApp
                </button>
              )}
            </div>
          </ModalBody>
        ) : (
          <ModalBody>
            <div className="space-y-4">
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <label className="block text-[11px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500 mb-1">
                    Paciente
                  </label>
                  <div className="flex h-10 w-full items-center gap-2 rounded-xl border border-slate-200/80 bg-white/70 px-3 text-sm text-slate-700 shadow-sm backdrop-blur-sm dark:border-slate-700/70 dark:bg-slate-800/70 dark:text-slate-300">
                    <UserRound size={15} className="shrink-0 text-teal-600" />
                    <span className="truncate">{effectivePatientName || 'Sin paciente vinculado'}</span>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setShowPatientSearch((v) => !v)}
                  aria-label="Buscar paciente"
                >
                  <Search size={16} />
                </Button>
              </div>

              {showPatientSearch && (
                <div className="rounded-xl border border-slate-200/80 bg-white/60 p-3 backdrop-blur-sm dark:border-slate-700/70 dark:bg-slate-800/60">
                  <Input
                    autoFocus
                    value={patientQuery}
                    onChange={(e) => setPatientQuery(e.target.value)}
                    placeholder="Buscar por nombre o identidad…"
                  />
                  <div className="mt-2 max-h-48 overflow-y-auto">
                    {patientSearching ? (
                      <p className="text-center py-3 text-sm text-zinc-400">Buscando…</p>
                    ) : patientResults.length > 0 ? (
                      patientResults.map((p) => (
                        <button
                          key={p.paciente_id}
                          type="button"
                          onClick={() => selectPatient(p)}
                          className="w-full text-left p-2.5 rounded-lg hover:bg-teal-50 dark:hover:bg-teal-900/30 text-sm"
                        >
                          <span className="font-medium text-zinc-800 dark:text-zinc-100">{p.nombre_completo}</span>
                          {p.telefono ? <span className="text-xs text-zinc-400 ml-2">{p.telefono}</span> : null}
                        </button>
                      ))
                    ) : patientQuery.trim() !== '' ? (
                      <p className="text-center py-3 text-sm text-zinc-400">Sin resultados</p>
                    ) : null}
                  </div>
                </div>
              )}

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

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-[11px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                    Invitados
                  </label>
                  <span className="text-[11px] text-zinc-400">
                    {invitees.length} seleccionado{invitees.length === 1 ? '' : 's'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowInviteePicker((v) => !v)}
                  className="flex w-full items-center gap-2 rounded-xl border border-slate-200/80 bg-white/70 px-3 py-2.5 text-sm text-zinc-400 shadow-sm backdrop-blur-sm transition-colors hover:bg-white dark:border-slate-700/70 dark:bg-slate-800/70 dark:hover:bg-slate-800"
                >
                  <Users size={15} />
                  {invitees.length === 0 ? 'Buscar usuarios para invitar…' : `${invitees.length} usuario(s)`}
                </button>

                {showInviteePicker && (
                  <div className="mt-2 rounded-xl border border-slate-200/80 bg-white/60 p-3 backdrop-blur-sm dark:border-slate-700/70 dark:bg-slate-800/60">
                    <Input
                      value={inviteeQuery}
                      onChange={(e) => setInviteeQuery(e.target.value)}
                      placeholder="Filtrar usuarios…"
                    />
                    <div className="mt-2 max-h-56 overflow-y-auto space-y-1">
                      {filteredPool.length === 0 ? (
                        <p className="text-center py-3 text-sm text-zinc-400">Sin usuarios</p>
                      ) : (
                        filteredPool.map((u) => {
                          const selected = invitees.some((i) => i.id === u.id);
                          return (
                            <button
                              key={u.id}
                              type="button"
                              onClick={() =>
                                setInvitees((prev) =>
                                  selected ? prev.filter((i) => i.id !== u.id) : [...prev, u]
                                )
                              }
                              className={`w-full text-left p-2.5 rounded-lg border text-sm flex items-center gap-3 transition-colors ${
                                selected
                                  ? 'border-teal-500 bg-teal-50 dark:bg-teal-900/30'
                                  : 'border-slate-200/80 dark:border-slate-700/70 hover:bg-white dark:hover:bg-slate-800'
                              }`}
                            >
                              <img
                                src={avatarFor(u)}
                                alt={`${u.first_name || ''} ${u.last_name || ''}`}
                                className="h-8 w-8 rounded-full object-cover"
                                onError={(e) => {
                                  e.currentTarget.src = avatarFor({ ...u, profileImageUrl: '' });
                                }}
                              />
                              <span className="flex-1 min-w-0">
                                <span className="block font-medium text-zinc-800 dark:text-zinc-100 truncate">
                                  {u.first_name || ''} {u.last_name || ''}
                                </span>
                                {u.email ? (
                                  <span className="block text-xs text-zinc-400 truncate">{u.email}</span>
                                ) : null}
                              </span>
                              {selected && <Check size={16} className="shrink-0 text-teal-600" />}
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}

                {invitees.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {invitees.map((u) => (
                      <span
                        key={u.id}
                        className="inline-flex items-center gap-2 pl-1 pr-2 py-1 bg-slate-100 rounded-full text-xs text-zinc-700 dark:bg-slate-800 dark:text-zinc-200"
                      >
                        <img
                          src={avatarFor(u)}
                          alt=""
                          className="h-6 w-6 rounded-full object-cover"
                          onError={(e) => {
                            e.currentTarget.src = avatarFor({ ...u, profileImageUrl: '' });
                          }}
                        />
                        <span className="max-w-[120px] truncate">
                          {u.first_name || ''} {u.last_name || ''}
                        </span>
                        <button
                          type="button"
                          onClick={() => setInvitees((prev) => prev.filter((i) => i.id !== u.id))}
                          className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                          aria-label="Quitar"
                        >
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
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
                  <Input value={effectivePhone} readOnly className="text-sm" />
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