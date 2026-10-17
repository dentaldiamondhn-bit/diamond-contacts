'use client';

import { ExternalLink, FileText, Mail, Star, StarOff, Cloud, CloudOff, CheckCircle2, Trash2, RotateCcw, Eye, CalendarPlus } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { LocalContact, LocalLabel } from '@/lib/contacts/db';
import { fullName, primaryPhone, primaryEmail, formatDate } from '@/lib/contacts/db';
import { formatPhoneDisplay } from '@/lib/contacts/vcard';
import {
  whatsappHref,
  openWhatsAppConversation,
  usesNativeWhatsAppIntent,
} from '@/lib/contacts/vcard';
import { ContactQuickActions } from './ContactQuickActions';
import { ContactAvatar } from './ContactAvatar';

interface ContactMobileCardProps {
  contact: LocalContact;
  labelMap: Map<string, LocalLabel>;
  isOnline?: boolean;
  onOpen: (c: LocalContact) => void;
  onOpenEhr: (c: LocalContact) => void;
  onSchedule: (c: LocalContact) => void;
  onDelete: (c: LocalContact) => void;
  onRestore: (c: LocalContact) => void;
  onToggleFavorite: (c: LocalContact) => void;
  onToggleLabel?: (c: LocalContact, labelId: string) => void;
  isTrash?: boolean;
}

export function ContactMobileCard({
  contact,
  labelMap,
  isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true,
  onOpen,
  onOpenEhr,
  onSchedule,
  onDelete,
  onRestore,
  onToggleFavorite,
  onToggleLabel,
  isTrash = false,
}: ContactMobileCardProps) {
  const name = fullName(contact);
  const phone = primaryPhone(contact);
  const email = primaryEmail(contact);
  const pendingContactIds = new Set<string>();

  return (
    <article
      role="button"
      tabIndex={0}
      aria-label={`Abrir contacto ${name}`}
      onClick={() => onOpen(contact)}
      onKeyDown={(e) => {
        if (e.key !== 'Enter') return
        // Nested controls (links, chips, buttons) activate themselves; only the
        // card itself opens the detail sheet, otherwise a single Enter both
        // activates the control and bubbles here.
        if (e.target !== e.currentTarget) return
        onOpen(contact);
      }}
      className={cn(
        'flex flex-col gap-3 border border-zinc-200/70 dark:border-zinc-800/40 rounded-xl p-4 transition-colors',
        'hover:bg-slate-100/60 dark:hover:bg-slate-800/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500',
      )}
    >
      <div className="flex items-start gap-3">
        {!isTrash && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite(contact);
            }}
            className="shrink-0 p-2 rounded-lg text-zinc-300 dark:text-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-amber-500 transition-colors"
            title={contact.is_favorite ? 'Quitar de favoritos' : 'Marcar como favorito'}
            aria-label={contact.is_favorite ? 'Quitar de favoritos' : 'Marcar como favorito'}
          >
            {contact.is_favorite ? <Star size={18} className="fill-amber-400" /> : <StarOff size={18} />}
          </button>
        )}
        <div className="flex items-center gap-2">
          <ContactAvatar name={name} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="font-medium text-zinc-900 dark:text-white text-sm truncate">{name || 'Sin nombre'}</p>
            {contact.is_archived && !isTrash && (
              <p className="text-[11px] text-zinc-400 dark:text-zinc-500">Archivado</p>
            )}
          </div>
        </div>
      </div>

      {/* Phone + quick actions */}
      {phone && (
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <a
            href={whatsappHref(phone.phone_number) || undefined}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => {
              // The card itself is clickable, so stop the click from also opening
              // the detail sheet: that re-render unmounts this anchor and React
              // cancels the queued wa.me navigation before WhatsApp opens.
              e.stopPropagation()
              if (!usesNativeWhatsAppIntent()) return
              e.preventDefault()
              openWhatsAppConversation(phone.phone_number)
            }}
            className="font-mono text-sm tracking-tight text-zinc-600 dark:text-zinc-300 hover:underline hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
            title={`Abrir conversación de WhatsApp con ${name || 'el paciente'}`}
          >
            {formatPhoneDisplay(phone.phone_number)}
          </a>
          <ContactQuickActions phone={phone.phone_number} patientName={name} size="sm" />
        </div>
      )}

      {/* Email */}
      {email && (
        <div className="flex items-center gap-2">
          <Mail size={14} className="shrink-0 text-zinc-400" />
          <span className="text-sm text-zinc-600 dark:text-zinc-300 truncate">{email.email}</span>
        </div>
      )}

      {/* Labels */}
      {contact.label_ids.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {contact.label_ids.map((id) => {
            const label = labelMap.get(id);
            if (!label) return null;
            return (
              <span
                key={id}
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium text-white"
                style={{ backgroundColor: label.color }}
              >
                {label.name}
              </span>
            );
          })}
        </div>
      )}

      {/* Expediente */}
      {contact.patient_id && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onOpenEhr(contact);
          }}
          className="self-start inline-flex items-center gap-1.5 rounded-full bg-emerald-50 dark:bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 transition-colors"
          title="Expediente EHR vinculado"
        >
          <FileText size={12} /> Vinculado
        </button>
      )}

      <div className="flex items-center justify-between gap-2 mt-2">
        <span className="text-xs text-zinc-500 dark:text-zinc-400">
          {formatDate(contact.updated_at)}
        </span>
        <div className="flex items-center gap-1">
          {contact.synced === 1 && !pendingContactIds.has(contact.id) ? (
            <CheckCircle2 size={14} className="text-emerald-500" aria-label="Sincronizado (dispositivo + nube)" />
          ) : isOnline ? (
            <Cloud size={14} className="text-amber-500" aria-label="Cambios guardados localmente (pendientes de sincronizar)" />
          ) : (
            <CloudOff size={14} className="text-zinc-400 dark:text-zinc-500" aria-label="Sin conexión — cambios guardados localmente" />
          )}
        </div>
      </div>

      {/* Actions */}
      <div
        className="flex flex-wrap gap-1.5 mt-2 pt-2 border-t border-zinc-100/60 dark:border-zinc-800/40 sm:flex-nowrap"
        onClick={(e) => e.stopPropagation()}
      >
        {!isTrash ? (
          <>
            <button
              onClick={() => onOpen(contact)}
              className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg p-2 text-zinc-400 hover:text-blue-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              title="Ver detalles"
              aria-label="Ver detalles"
            >
              <Eye size={16} />
            </button>
            <button
              onClick={() => onSchedule(contact)}
              className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg p-2 text-zinc-400 hover:text-teal-600 hover:bg-teal-50 dark:hover:bg-teal-500/10 transition-colors"
              title="Agendar cita"
              aria-label="Agendar cita"
            >
              <CalendarPlus size={16} />
            </button>
            {contact.patient_id && (
              <button
                onClick={() => onOpenEhr(contact)}
                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg p-2 text-zinc-400 hover:text-emerald-600 hover:bg-emerald-100 dark:hover:bg-emerald-500/10 transition-colors"
                title="Abrir Expediente EHR"
                aria-label="Abrir Expediente EHR"
              >
                <ExternalLink size={16} />
              </button>
            )}
            <button
              onClick={() => onDelete(contact)}
              className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg p-2 text-zinc-400 hover:text-rose-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              title="Mover a papelera"
              aria-label="Mover a papelera"
            >
              <Trash2 size={16} />
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => onRestore(contact)}
              className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg p-2 text-zinc-400 hover:text-emerald-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              title="Restaurar"
              aria-label="Restaurar"
            >
              <RotateCcw size={16} />
            </button>
            <button
              onClick={() => onDelete(contact)}
              className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg p-2 text-zinc-400 hover:text-rose-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              title="Eliminar definitivamente"
              aria-label="Eliminar definitivamente"
            >
              <Trash2 size={16} />
            </button>
          </>
        )}
      </div>
    </article>
  );
}


