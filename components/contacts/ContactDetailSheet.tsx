'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import {
  X,
  Pencil,
  Star,
  Printer,
  Trash2,
  RotateCcw,
  Phone,
  Mail,
  MapPin,
  CalendarDays,
  User,
  Siren,
  Shield,
  FileBadge,
  Stethoscope,
  Activity,
  FolderHeart,
  AlertTriangle,
  HeartPulse,
  Pill,
  ExternalLink,
  Copy,
  Check,
  Plus,
  Droplets,
  FileText,
  Share2,
  CalendarPlus,
  Link2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { LocalContact, LocalLabel, MedicalHistory } from '@/lib/contacts/db';
import { LABEL_COLORS, formatDate, fullName, primaryPhone } from '@/lib/contacts/db';
import { openPrintView, sharePatientContact } from '@/lib/contacts/vcard';
import { dateToDateStr } from '@/calendario/rbcAdapter';
import { meaningfulMedicalTags } from '@/lib/contacts/patientLink';
import { PatientLinkModal } from './PatientLinkModal';
import { ContactAvatar } from './ContactAvatar';
import { ContactQuickActions } from './ContactQuickActions';

type SheetTab = 'info' | 'medical' | 'labels';

interface InfoRowProps {
  icon: React.ReactNode;
  label: string;
  value?: string | null;
  placeholder?: string;
}

function InfoRow({ icon, label, value, placeholder = 'Sin datos' }: InfoRowProps) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-zinc-100 dark:border-zinc-800 last:border-0">
      <span className="text-zinc-400 dark:text-zinc-500 mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wide text-zinc-400 dark:text-zinc-500 font-medium">{label}</p>
        {value ? (
          <p className="text-sm text-zinc-800 dark:text-zinc-200 break-words">{value}</p>
        ) : (
          <p className="text-sm text-zinc-300 dark:text-zinc-600 italic">{placeholder}</p>
        )}
      </div>
    </div>
  );
}

function TabButton({
  active = false,
  icon,
  label,
  onClick,
}: {
  active?: boolean;
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
        active
          ? 'text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-500/10'
          : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800',
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[11px] uppercase tracking-wide text-zinc-400 dark:text-zinc-500 font-semibold mb-2">
      {children}
    </h3>
  );
}

function TagPill({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium text-white"
      style={{ backgroundColor: color }}
    >
      {children}
    </span>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-zinc-300 dark:text-zinc-600 italic">{children}</p>;
}

interface ContactDetailSheetProps {
  contact: LocalContact | null;
  labels: LocalLabel[];
  medical?: MedicalHistory;
  onClose: () => void;
  onEdit: (c: LocalContact) => void;
  onToggleFavorite: (c: LocalContact) => void;
  onDelete: (c: LocalContact) => void;
  onRestore: (c: LocalContact) => void;
  onToggleLabel: (c: LocalContact, labelId: string) => void;
  onAddLabel: (name: string, color?: string) => void;
  onEditMedical: (c: LocalContact) => void;
}

export function ContactDetailSheet({
  contact,
  labels,
  medical,
  onClose,
  onEdit,
  onToggleFavorite,
  onDelete,
  onRestore,
  onToggleLabel,
  onAddLabel,
  onEditMedical,
}: ContactDetailSheetProps) {
  const router = useRouter();
  const [tab, setTab] = useState<SheetTab>('info');
  const [copied, setCopied] = useState(false);
  const [shared, setShared] = useState<'idle' | 'shared' | 'copied'>('idle');
  const [addingLabel, setAddingLabel] = useState(false);
  const [labelName, setLabelName] = useState('');
  const [labelColor, setLabelColor] = useState(LABEL_COLORS[0]);
  const [linkerOpen, setLinkerOpen] = useState(false);

  const open = !!contact;
  if (!contact) return null;

  const name = fullName(contact);
  const label = (id: string) => labels.find((l) => l.id === id);
  const isTrash = contact.deleted === 1;
  const mainPhone = primaryPhone(contact);
  const effectiveAllergies = meaningfulMedicalTags(medical?.allergies ?? []);
  const effectiveConditions = meaningfulMedicalTags(medical?.chronicConditions ?? []);
  const effectiveMedications = meaningfulMedicalTags(medical?.currentMedications ?? []);

  const createAppointment = () => {
    const params = new URLSearchParams();
    params.set('view', 'day');
    params.set('date', dateToDateStr(new Date()));
    params.set('new', '1');
    const trimmedName = name?.trim();
    if (trimmedName) params.set('contact_name', trimmedName);
    if (mainPhone?.phone_number) params.set('phone', mainPhone.phone_number);
    if (contact.patient_id) params.set('patient_id', contact.patient_id);
    router.push(`/calendario?${params.toString()}`);
  };

  const openEhr = () => {
    if (contact.patient_id) router.push(`/patient-preview/${contact.patient_id}`);
  };

  const copyPatientId = async () => {
    if (!contact.patient_id) return;
    try {
      await navigator.clipboard.writeText(contact.patient_id);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  const handleShare = async () => {
    if (!mainPhone) return;
    const result = await sharePatientContact(name || 'Contacto', mainPhone.phone_number, contact.emails[0]?.email);
    setShared(result === 'shared' ? 'shared' : result === 'copied' ? 'copied' : 'idle');
    setTimeout(() => setShared('idle'), 1800);
  };

  const submitLabel = () => {
    const trimmed = labelName.trim();
    if (trimmed) {
      onAddLabel(trimmed, labelColor);
      setLabelName('');
      setAddingLabel(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="sheet-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/40 dark:bg-black/60"
            onClick={onClose}
          />
          <motion.aside
            key="sheet-panel"
            initial={{ x: 480 }}
            animate={{ x: 0 }}
            exit={{ x: 480 }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-md flex flex-col bg-white dark:bg-zinc-900 border-l border-zinc-200 dark:border-zinc-800 shadow-2xl"
          >
            {/* Header */}
            <div className="shrink-0 flex flex-col items-center px-6 pt-8 pb-4 border-b border-zinc-200 dark:border-zinc-800">
              <div className="flex items-start w-full">
                <button
                  onClick={onClose}
                  className="p-2 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 dark:hover:text-zinc-200 dark:hover:bg-zinc-800 text-sm"
                >
                  <X size={18} />
                </button>
              </div>
              <ContactAvatar name={name || 'C'} size="lg" className="mt-2" />
              <h2 className="mt-3 text-xl font-semibold text-zinc-900 dark:text-white text-center">
                {name || 'Sin nombre'}
              </h2>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
                {[contact.job_title, contact.company].filter(Boolean).join(' · ') || 'Contacto'}
              </p>
              {contact.label_ids.length > 0 && (
                <div className="flex items-center gap-1 flex-wrap justify-center mt-3">
                  {contact.label_ids.map((id) => {
                    const l = label(id);
                    if (!l) return null;
                    return (
                      <span
                        key={id}
                        className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium text-white"
                        style={{ backgroundColor: l.color }}
                      >
                        {l.name}
                      </span>
                    );
                  })}
                </div>
              )}
              {/* Quick actions */}
              <div className="flex items-center gap-1.5 mt-4">
                {isTrash ? (
                  <>
                    <button
                      onClick={() => onRestore(contact)}
                      className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 transition-colors"
                    >
                      <RotateCcw size={15} /> Restaurar
                    </button>
                    <button
                      onClick={() => onDelete(contact)}
                      className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-500/10 hover:bg-rose-100 dark:hover:bg-rose-500/20 transition-colors"
                    >
                      <Trash2 size={15} /> Eliminar definitivamente
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => onEdit(contact)}
                      className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 transition-colors"
                    >
                      <Pencil size={15} /> Editar
                    </button>
                    <button
                      onClick={() => onToggleFavorite(contact)}
                      title={contact.is_favorite ? 'Quitar de favoritos' : 'Marcar como favorito'}
                      className={cn(
                        'p-2 rounded-lg transition-colors',
                        contact.is_favorite
                          ? 'text-amber-500 bg-amber-50 dark:bg-amber-500/10'
                          : 'text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800',
                      )}
                    >
                      <Star size={16} className={contact.is_favorite ? 'fill-amber-400' : ''} />
                    </button>
                    <button
                      onClick={() => openPrintView(contact)}
                      title="Imprimir"
                      className="p-2 rounded-lg text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                    >
                      <Printer size={16} />
                    </button>
                    <button
                      onClick={() => onDelete(contact)}
                      title="Mover a papelera"
                      className="p-2 rounded-lg text-zinc-500 hover:bg-rose-50 hover:text-rose-600 dark:text-zinc-400 dark:hover:bg-rose-500/10 dark:hover:text-rose-400"
                    >
                      <Trash2 size={16} />
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Tabs */}
            <div className="shrink-0 flex items-center gap-1 px-4 py-3 border-b border-zinc-200 dark:border-zinc-800">
              <TabButton active={tab === 'info'} icon={<User size={15} />} label="Información" onClick={() => setTab('info')} />
              <TabButton active={tab === 'medical'} icon={<FolderHeart size={15} />} label="Historial Médico" onClick={() => setTab('medical')} />
              <TabButton active={tab === 'labels'} icon={<Activity size={15} />} label="Etiquetas" onClick={() => setTab('labels')} />
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {tab === 'info' && (
                <>
                  {/* Calendar shortcut */}
                  {!isTrash && (
                    <section className="mb-5">
                      <button
                        onClick={createAppointment}
                        className="flex w-full items-center justify-center gap-2 rounded-xl border border-teal-200 dark:border-teal-500/30 bg-teal-50 dark:bg-teal-500/10 px-4 py-3 text-sm font-medium text-teal-700 dark:text-teal-300 hover:bg-teal-100 dark:hover:bg-teal-500/20 transition-colors"
                      >
                        <CalendarPlus size={16} /> Crear cita en el calendario
                      </button>
                    </section>
                  )}

                  {/* Clinical deep-link banner */}
                  {!isTrash && (
                    <section className="mb-5 rounded-xl border border-blue-200 dark:border-blue-500/30 bg-blue-50/60 dark:bg-blue-500/10 p-4">
                      <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300">
                        <FileText size={16} />
                        <p className="text-sm font-semibold">
                          {contact.patient_id ? 'Expediente EHR vinculado' : 'Sin expediente clínico'}
                        </p>
                      </div>
                      {contact.patient_id ? (
                        <>
                          <p className="mt-1.5 text-xs text-blue-600 dark:text-blue-300/80 break-all">
                            ID de paciente: {contact.patient_id}
                          </p>
                          <div className="mt-3 flex items-center gap-2">
                            <button
                              onClick={openEhr}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium px-3 py-2 transition-colors"
                            >
                              <ExternalLink size={14} /> Abrir Expediente EHR Completo
                            </button>
                            <button
                              onClick={copyPatientId}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-blue-300 dark:border-blue-500/40 text-blue-700 dark:text-blue-300 text-xs font-medium px-2.5 py-2 hover:bg-blue-100 dark:hover:bg-blue-500/20 transition-colors"
                              title="Copiar ID de paciente"
                            >
                              {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                              {copied ? 'Copiado' : 'Copiar ID'}
                            </button>
                          </div>
                        </>
                      ) : (
                        <>
                          <p className="mt-1.5 text-xs text-blue-600/80 dark:text-blue-300/60">
                            Vincula este contacto a una ficha de paciente para abrir su expediente completo desde aquí.
                          </p>
                          <button
                            onClick={() => setLinkerOpen(true)}
                            className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-blue-300 dark:border-blue-500/40 text-blue-700 dark:text-blue-300 text-xs font-medium px-3 py-2 hover:bg-blue-100 dark:hover:bg-blue-500/20 transition-colors"
                          >
                            <Link2 size={14} /> Vincular a ficha de paciente
                          </button>
                        </>
                      )}
                    </section>
                  )}

                  {!isTrash && mainPhone && (
                    <section className="mb-5">
                      <div className="flex items-center justify-between rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/40 px-4 py-3">
                        <div>
                          <p className="text-[11px] uppercase tracking-wide text-zinc-400 dark:text-zinc-500 font-medium">
                            Acciones rápidas
                          </p>
                          <p className="mt-0.5 text-sm font-medium text-zinc-800 dark:text-zinc-200">
                            {mainPhone.phone_number}
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          <ContactQuickActions phone={mainPhone.phone_number} patientName={name} />
                          <button
                            onClick={handleShare}
                            className="p-2 rounded-full text-blue-500 hover:bg-blue-500/10 transition-colors"
                            title="Compartir contacto"
                            aria-label="Compartir contacto"
                          >
                            <Share2 size={16} className={shared !== 'idle' ? 'text-emerald-500' : ''} />
                          </button>
                          {shared !== 'idle' && (
                            <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                              {shared === 'shared' ? 'Compartido' : 'Copiado'}
                            </span>
                          )}
                        </div>
                      </div>
                    </section>
                  )}

                  {contact.phones.length > 0 && (
                    <section className="mb-5">
                      <SectionTitle>Teléfonos</SectionTitle>
                      {contact.phones.map((p) => (
                        <div key={p.id} className="flex items-center gap-2 py-1.5 text-sm text-zinc-800 dark:text-zinc-200">
                          <Phone size={14} className="text-zinc-400 shrink-0" />
                          <span className="font-medium">{p.phone_number}</span>
                          <span className="text-xs text-zinc-400 uppercase">{p.type}</span>
                        </div>
                      ))}
                    </section>
                  )}
                  {contact.emails.length > 0 && (
                    <section className="mb-5">
                      <SectionTitle>Correos</SectionTitle>
                      {contact.emails.map((e) => (
                        <div key={e.id} className="flex items-center gap-2 py-1.5 text-sm text-zinc-800 dark:text-zinc-200">
                          <Mail size={14} className="text-zinc-400 shrink-0" />
                          <span>{e.email}</span>
                        </div>
                      ))}
                    </section>
                  )}

                  <section className="mb-5">
                    <SectionTitle>Información personal</SectionTitle>
                    <InfoRow icon={<MapPin size={15} />} label="Dirección" value={contact.address} />
                    <InfoRow icon={<CalendarDays size={15} />} label="Fecha de nacimiento" value={contact.dob ? formatDate(contact.dob) : null} />
                    <InfoRow icon={<User size={15} />} label="Contacto de emergencia" value={contact.emergency_contact} />
                    <InfoRow icon={<Stethoscope size={15} />} label="Notas" value={contact.notes} />
                  </section>
                </>
              )}

              {tab === 'medical' && (
                <>
                  {effectiveAllergies.length > 0 ? (
                    <section className="mb-5 rounded-lg border border-rose-200 dark:border-rose-500/30 bg-rose-50 dark:bg-rose-500/10 p-3">
                      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-rose-600 dark:text-rose-400 mb-2">
                        <AlertTriangle size={13} /> Alergias
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {effectiveAllergies.map((a, i) => (
                          <TagPill key={`${a}-${i}`} color="#EF4444">
                            {a}
                          </TagPill>
                        ))}
                      </div>
                    </section>
                  ) : (
                    <section className="mb-5">
                      <SectionTitle>Alergias</SectionTitle>
                      <EmptyHint>Sin alergias registradas</EmptyHint>
                    </section>
                  )}

                  <section className="mb-5">
                    <SectionTitle>Condiciones crónicas</SectionTitle>
                    {effectiveConditions.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {effectiveConditions.map((c, i) => (
                          <TagPill key={`${c}-${i}`} color="#8B5CF6">
                            {c}
                          </TagPill>
                        ))}
                      </div>
                    ) : (
                      <EmptyHint>Sin condiciones registradas</EmptyHint>
                    )}
                  </section>

                  <section className="mb-5">
                    <SectionTitle>Medicamentos actuales</SectionTitle>
                    {effectiveMedications.length > 0 ? (
                      <ul className="space-y-1.5">
                        {effectiveMedications.map((m, i) => (
                          <li key={`${m}-${i}`} className="flex items-center gap-2 text-sm text-zinc-800 dark:text-zinc-200">
                            <Pill size={14} className="text-zinc-400 shrink-0" /> {m}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <EmptyHint>Ninguno registrado</EmptyHint>
                    )}
                  </section>

                  <section className="mb-5">
                    <SectionTitle>Última consulta odontológica</SectionTitle>
                    {medical?.lastDentalVisit ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 dark:bg-blue-500/10 px-2.5 py-1 text-xs font-medium text-blue-600 dark:text-blue-400">
                        <CalendarDays size={12} /> {medical.lastDentalVisit}
                      </span>
                    ) : (
                      <EmptyHint>Sin consultas registradas</EmptyHint>
                    )}
                  </section>

                  <section className="mb-5">
                    <SectionTitle>Notas de odontograma</SectionTitle>
                    {medical?.odontogramNotes ? (
                      <p className="text-sm text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap">{medical.odontogramNotes}</p>
                    ) : (
                      <EmptyHint>Sin notas</EmptyHint>
                    )}
                  </section>

                  <section className="mb-5">
                    <SectionTitle>Tipo de sangre</SectionTitle>
                    {medical?.bloodType ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 dark:bg-rose-500/10 px-2.5 py-1 text-xs font-medium text-rose-600 dark:text-rose-400">
                        <Droplets size={12} /> {medical.bloodType}
                      </span>
                    ) : (
                      <EmptyHint>Sin registro</EmptyHint>
                    )}
                  </section>

                  {!isTrash && (
                    <button
                      onClick={() => onEditMedical(contact)}
                      className="mt-1 flex items-center gap-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 px-3 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-200 transition-colors"
                    >
                      <Pencil size={15} /> Editar Antecedentes
                    </button>
                  )}
                </>
              )}

              {tab === 'labels' && (
                <>
                  <SectionTitle>Etiquetas y categorías</SectionTitle>
                  <div className="space-y-1">
                    {labels.length === 0 && <EmptyHint>Sin etiquetas.</EmptyHint>}
                    {labels.map((l) => {
                      const active = contact.label_ids.includes(l.id);
                      return (
                        <button
                          key={l.id}
                          onClick={() => !isTrash && onToggleLabel(contact, l.id)}
                          className={cn(
                            'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors',
                            active
                              ? 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300'
                              : 'text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800',
                          )}
                        >
                          <span
                            className={cn(
                              'flex h-4 w-4 items-center justify-center rounded border transition-colors',
                              active ? 'border-blue-600 bg-blue-600' : 'border-zinc-300 dark:border-zinc-600',
                            )}
                          >
                            {active && <Check size={12} className="text-white" />}
                          </span>
                          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: l.color }} />
                          <span className="truncate">{l.name}</span>
                        </button>
                      );
                    })}
                  </div>

                  {!isTrash && (
                    <div className="mt-4 border-t border-zinc-100 dark:border-zinc-800 pt-4">
                      {addingLabel ? (
                        <div className="space-y-2">
                          <div className="flex items-center gap-1.5">
                            <input
                              autoFocus
                              value={labelName}
                              onChange={(e) => setLabelName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') submitLabel();
                                if (e.key === 'Escape') {
                                  setAddingLabel(false);
                                  setLabelName('');
                                }
                              }}
                              placeholder="Nombre de la etiqueta..."
                              className="flex h-9 w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            <button onClick={submitLabel} className="text-emerald-500" title="Guardar">
                              <Check size={18} />
                            </button>
                            <button
                              onClick={() => {
                                setAddingLabel(false);
                                setLabelName('');
                              }}
                              className="text-zinc-400"
                              title="Cancelar"
                            >
                              <X size={18} />
                            </button>
                          </div>
                          <div className="flex items-center gap-1.5">
                            {LABEL_COLORS.map((c) => (
                              <button
                                key={c}
                                onClick={() => setLabelColor(c)}
                                className={cn(
                                  'h-5 w-5 rounded-full transition-transform',
                                  labelColor === c && 'ring-2 ring-offset-1 ring-zinc-400 dark:ring-zinc-500 scale-110',
                                )}
                                style={{ backgroundColor: c }}
                                title={c}
                              />
                            ))}
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => setAddingLabel(true)}
                          className="flex items-center gap-1.5 text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          <Plus size={15} /> Crear etiqueta
                        </button>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </motion.aside>
        </>
      )}
      {!isTrash && contact && (
        <PatientLinkModal key="sheet-linker" open={linkerOpen} contact={contact} onClose={() => setLinkerOpen(false)} />
      )}
    </AnimatePresence>
  );
}