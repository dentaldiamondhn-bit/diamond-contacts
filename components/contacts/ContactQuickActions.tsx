'use client';

import { Phone, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import AnimatedWhatsApp from '@/components/AnimatedWhatsApp';
import {
  formatToE164,
  smsDeepLink,
  openWhatsAppConversation,
  whatsappGreeting,
  whatsappHref,
  isNativeShell,
} from '@/lib/contacts/vcard';

interface ContactQuickActionsProps {
  /** Raw phone number, e.g. "+50499999999" (kept as the native tel: URI). */
  phone: string;
  /** Used to preamble the WhatsApp / SMS greeting. */
  patientName: string;
  /** Accepted for call-site compatibility; sizing is uniform. */
  size?: 'sm' | 'md';
  className?: string;
}

export function ContactQuickActions({ phone, patientName, className }: ContactQuickActionsProps) {
  // One size for every variant: p-2 + a 16px glyph clears the 24x24 CSS px
  // minimum in both the table and the card.
  const btn = cn('rounded-full transition-colors p-2');

  // WhatsApp is the clinic's main channel, so it is a real anchor (middle-click,
  // long-press → open/copy link works) and only falls back to the native
  // `whatsapp://` intent inside the Capacitor shell, where a plain https link
  // would just render a web page in the WebView.
  const greeting = whatsappGreeting(patientName);
  const waHref = whatsappHref(phone, greeting);

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <a
        href={waHref || undefined}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => {
          // Never bubble to a clickable row/card: the parent re-render would
          // unmount this anchor and cancel the navigation.
          e.stopPropagation()
          // On web the anchor's own wa.me href is correct (and keeps
          // middle-click / "copy link address" working), so only the shell
          // takes over — a default jump to wa.me inside the WebView follows
          // wa.me's redirect to whatsapp:// and dies with ERR_UNKNOWN_URL_SCHEME.
          if (!isNativeShell()) return
          e.preventDefault()
          void openWhatsAppConversation(phone, greeting)
        }}
        className={cn(btn, 'hover:bg-emerald-500/10')}
        title={`Abrir WhatsApp con ${patientName || 'el paciente'}`}
        aria-label="Abrir WhatsApp"
      >
        <AnimatedWhatsApp size={16} />
      </a>
      <a
        href={`tel:${formatToE164(phone, '+504')}`}
        className={cn(btn, 'text-blue-500 hover:bg-blue-500/10')}
        title="Llamar al paciente"
        aria-label="Llamar"
      >
        <Phone size={16} />
      </a>
      <a
        href={smsDeepLink(phone)}
        className={cn(btn, 'text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800')}
        title="Enviar SMS"
        aria-label="Enviar SMS"
      >
        <MessageSquare size={16} />
      </a>
    </div>
  );
}