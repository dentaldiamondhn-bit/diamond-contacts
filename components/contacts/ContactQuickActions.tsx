'use client';

import { Send, Phone, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import { smsDeepLink, whatsappDeepLink } from '@/lib/contacts/vcard';

interface ContactQuickActionsProps {
  /** Raw phone number, e.g. "+50499999999" (kept as the native tel: URI). */
  phone: string;
  /** Used to preamble the WhatsApp / SMS greeting. */
  patientName: string;
  size?: 'sm' | 'md';
  className?: string;
}

export function ContactQuickActions({ phone, patientName, size = 'md', className }: ContactQuickActionsProps) {
  const btn = cn(
    'rounded-full transition-colors',
    size === 'sm' ? 'p-1' : 'p-2',
  );

  return (
    <div className={cn('flex items-center gap-1', className)}>
      <a
        href={whatsappDeepLink(phone, patientName)}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(btn, 'text-emerald-500 hover:bg-emerald-500/10')}
        title={`Abrir WhatsApp con ${patientName || 'el paciente'}`}
        aria-label="Abrir WhatsApp"
      >
        <Send size={size === 'sm' ? 13 : 16} />
      </a>
      <a
        href={`tel:${phone}`}
        className={cn(btn, 'text-blue-500 hover:bg-blue-500/10')}
        title="Llamar al paciente"
        aria-label="Llamar"
      >
        <Phone size={size === 'sm' ? 13 : 16} />
      </a>
      <a
        href={smsDeepLink(phone)}
        className={cn(btn, 'text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800')}
        title="Enviar SMS"
        aria-label="Enviar SMS"
      >
        <MessageSquare size={size === 'sm' ? 13 : 16} />
      </a>
    </div>
  );
}