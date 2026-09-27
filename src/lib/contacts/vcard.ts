import type { LocalContact, LocalContactEmail, LocalContactPhone } from './db'
import { fullName } from './db'

export interface ParsedContact {
  first_name?: string
  last_name?: string
  company?: string
  job_title?: string
  notes?: string
  phones: { type: string; phone_number: string; is_primary?: boolean }[]
  emails: { type: string; email: string; is_primary?: boolean }[]
}

/**
 * Escapes a text fragment for a vCard 3.0 property value (RFC 2426 §3.3).
 * Backslash, semicolon, comma and line feeds must be escaped so parsers
 * (iOS AddressBook, Android Contacts Provider, DAVx5) do not mis-split
 * structured values or truncate names.
 */
export function escapeVCardText(value: string | null | undefined): string {
  return (value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

/**
 * Inverse of escapeVCardText: decodes a vCard 3.0 property value back to the
 * raw text (RFC 2426 §3.3). Applied on import so names such as "Pérez, Jr."
 * round-trip without the escaping artifacts.
 */
export function unescapeVCardText(value: string): string {
  return value
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
    .replace(/\\n/g, '\n')
}

/**
 * Normalizes a phone number to international E.164 form (RFC 3966 style), e.g.
 * "8855-5983" -> "+50488555983". Local numbers (<= 8 digits) get the default
 * country code prepended; "00" international prefixes are converted to "+";
 * an explicit "+" or an already-international-length number is left intact.
 * Defaults to Honduras (+504) because that is the clinic's home country.
 */
export function formatToE164(phone: string | null | undefined, defaultCountryCode = '+504'): string {
  const cleaned = (phone ?? '').trim()
  if (!cleaned) return ''
  if (cleaned.startsWith('+')) return '+' + cleaned.slice(1).replace(/[^\d]/g, '')
  if (cleaned.startsWith('00')) return '+' + cleaned.slice(2).replace(/[^\d]/g, '')
  const digits = cleaned.replace(/[^\d]/g, '')
  if (!digits) return ''
  const cc = defaultCountryCode.replace(/[^\d]/g, '')
  // Very short local numbers (6-8 digits) are unambiguous local dialing in HN.
  if (digits.length <= 8) return `+${cc}${digits}`
  if (digits.startsWith(cc)) return `+${digits}`
  // Long number without a country code: treat as a full international E.164.
  return `+${digits}`
}

const VCARD_MAX_LINE = 75

/**
 * Folds a single vCard logical line so no line exceeds 75 octets, per RFC 2426
 * §2 (lines are folded after a CRLF with a single leading space which parsers
 * transparently unfold). Careful not to split a surrogate pair mid-character.
 */
function foldLine(line: string): string {
  if (line.length <= VCARD_MAX_LINE) return line
  const chunks: string[] = []
  let rest = line
  while (rest.length > VCARD_MAX_LINE) {
    let cut = VCARD_MAX_LINE
    const code = rest.charCodeAt(cut - 1)
    if (code >= 0xd800 && code <= 0xdbff) cut -= 1
    chunks.push(rest.slice(0, cut))
    rest = ' ' + rest.slice(cut)
  }
  chunks.push(rest)
  return chunks.join('\r\n')
}

/**
 * Folds every logical line of a multi-line vCard body (already separated by
 * CRLF) to the RFC 2426 75-octet limit. Older iOS/macOS address book parsers
 * may trim or skip unfold-hostile long fields, so NOTE/ADR/ORG with long
 * values get wrapped instead.
 */
export function foldVCardLines(body: string): string {
  return body
    .split('\r\n')
    .map(foldLine)
    .join('\r\n')
}

export function contactToVCard(c: LocalContact): string {
  const lines: string[] = ['BEGIN:VCARD', 'VERSION:3.0', `UID:${c.id}`]
  lines.push(`FN:${escapeVCardText(fullName(c))}`)
  lines.push(`N:${escapeVCardText(c.last_name ?? '')};${escapeVCardText(c.first_name ?? '')};;;`)
  for (const p of c.phones) {
    const e164 = formatToE164(p.phone_number)
    const typed = `TEL;TYPE=${p.type.toUpperCase()},VOICE;VALUE=uri:tel:${e164}`
    lines.push(e164 ? typed : `TEL;TYPE=${p.type.toUpperCase()}:${escapeVCardText(p.phone_number)}`)
    if (e164) lines.push(`X-SOCIALPROFILE;TYPE=whatsapp:https://wa.me/${e164.replace('+', '')}`)
  }
  for (const e of c.emails) lines.push(`EMAIL;TYPE=${e.type.toUpperCase()}:${escapeVCardText(e.email)}`)
  if (c.company) lines.push(`ORG:${escapeVCardText(c.company)}`)
  if (c.job_title) lines.push(`TITLE:${escapeVCardText(c.job_title)}`)
  if (c.address) lines.push(`ADR:;;${escapeVCardText(c.address.replace(/\r?\n/g, ' '))}`)
  if (c.dob) lines.push(`BDAY:${escapeVCardText(c.dob)}`)
  if (c.notes) lines.push(`NOTE:${escapeVCardText(c.notes.replace(/\r?\n/g, ' '))}`)
  lines.push('END:VCARD')
  return foldVCardLines(lines.join('\r\n'))
}

export function downloadTextFile(name: string, content: string, mime = 'text/vcard'): void {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export function buildMultiVcf(contacts: LocalContact[]): string {
  return contacts.map(contactToVCard).join('\r\n')
}

export function exportContact(c: LocalContact): void {
  downloadTextFile(`${fullName(c).replace(/\s+/g, '_') || 'contacto'}.vcf`, contactToVCard(c))
}

export function exportContacts(contacts: LocalContact[]): void {
  if (contacts.length === 1) {
    exportContact(contacts[0])
    return
  }
  downloadTextFile(`contactos_${new Date().toISOString().slice(0, 10)}.vcf`, buildMultiVcf(contacts))
}

function decodeQuotedPrintable(value: string): string | undefined {
  if (!value.includes('=')) return value
  try {
    let decoded = value.replace(/=\r?\n/g, '')
    decoded = decoded.replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    return decodeURIComponent(decoded)
  } catch {
    return value
  }
}

function cleanField(value: string | undefined): string | undefined {
  if (!value) return undefined
  if (value.includes('ENCODING=QUOTED-PRINTABLE') || value.includes('QUOTED-PRINTABLE')) {
    const middle = value.split(':').slice(1).join(':')
    return decodeQuotedPrintable(middle)?.trim()
  }
  const colon = value.indexOf(':')
  return value.slice(colon + 1).trim()
}

function parseCard(lines: string[]): ParsedContact {
  const result: ParsedContact = { phones: [], emails: [] }
  for (const raw of lines) {
    const line = raw.trim()
    const lower = line.toLowerCase()
    if (line.startsWith('FN')) {
      const v = cleanField(line)
      if (v) {
        const parts = unescapeVCardText(v.trim()).split(/\s+/)
        result.first_name = parts[0]
        result.last_name = parts.slice(1).join(' ')
      }
    } else if (lower.startsWith('n:')) {
      const v = cleanField(line)
      if (v) {
        const [last, first] = v.split(';')
        if (!result.first_name) result.first_name = unescapeVCardText(first?.trim() || '') || undefined
        if (!result.last_name) result.last_name = unescapeVCardText(last?.trim() || '') || undefined
      }
    } else if (lower.startsWith('tel')) {
      const valueUri = line.match(/VALUE=uri:tel:(\S+)/i)?.[1]
      const raw = valueUri ?? cleanField(line)
      if (raw) {
        const type = line.match(/TYPE=([^:;\s]+)/i)?.[1]?.split(',')[0]?.toLowerCase()
        result.phones.push({
          type: type ?? 'mobile',
          phone_number: valueUri ? `+${raw.replace(/[^\d]/g, '')}` : raw,
        })
      }
    } else if (lower.startsWith('email')) {
      const v = cleanField(line)
      if (v) {
        const type = line.match(/TYPE=([^:;\s]+)/i)?.[1]?.split(',')[0]?.toLowerCase()
        result.emails.push({ type: type ?? 'work', email: unescapeVCardText(v) })
      }
    } else if (lower.startsWith('org')) {
      result.company = unescapeVCardText(cleanField(line))
    } else if (lower.startsWith('title')) {
      result.job_title = unescapeVCardText(cleanField(line))
    } else if (lower.startsWith('note')) {
      result.notes = unescapeVCardText(cleanField(line))
    }
  }
  return result
}

export function parseVcfText(text: string): ParsedContact[] {
  const cards: ParsedContact[] = []
  // Unfold RFC 2426 continuations (CRLF + space/tab) back into single lines
  // before splitting logical lines, so imported folded vCards parse correctly.
  const unfolded = text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n[ \t]/g, '')
  const blocks = unfolded.split('BEGIN:VCARD')
  for (const block of blocks) {
    if (!block.includes('END:VCARD')) continue
    const lines = block.split('\n').filter((l) => l.trim())
    cards.push(parseCard(lines))
  }
  return cards
}

export function whitelistPhoneForWhatsApp(phone: string): string {
  return phone.replace(/[^\d]/g, '')
}

const CLINIC_GREETING = 'Clínica Dental Diamond'

export function whatsappDeepLink(phone: string, patientName?: string): string {
  const e164 = formatToE164(phone)
  const text = patientName ? `Hola ${patientName}, le saludamos de ${CLINIC_GREETING}.` : undefined
  if (!e164) {
    const base = `https://wa.me/${whitelistPhoneForWhatsApp(phone)}`
    return text ? `${base}?text=${encodeURIComponent(text)}` : base
  }
  const base = `https://wa.me/${e164.replace('+', '')}`
  return text ? `${base}?text=${encodeURIComponent(text)}` : base
}

export function smsDeepLink(phone: string, body?: string): string {
  const cleaned = phone.replace(/[^\d+]/g, '')
  return body ? `sms:${cleaned}?body=${encodeURIComponent(body)}` : `sms:${cleaned}`
}

/** Shares via the native Web Share API; falls back to copying to the clipboard. */
export async function sharePatientContact(
  name: string,
  phone: string,
  email?: string | null,
): Promise<'shared' | 'copied' | 'unsupported'> {
  const waLink = `https://wa.me/${formatToE164(phone).replace('+', '') || whitelistPhoneForWhatsApp(phone)}`
  const lines = [`Paciente: ${name}`, `Teléfono: ${phone}`]
  if (email) lines.push(`Correo: ${email}`)
  const text = lines.join('\n')

  if (typeof navigator === 'undefined') return 'unsupported'
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title: `Contacto: ${name}`, text, url: waLink })
      return 'shared'
    } catch {
      return 'unsupported'
    }
  }
  try {
    await navigator.clipboard.writeText(`${name} - ${phone}`)
    return 'copied'
  } catch {
    return 'unsupported'
  }
}

export function openPrintView(c: LocalContact): void {
  const win = window.open('', '_blank', 'width=640,height=800')
  if (!win) return
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const rows: LocalContactPhone[] = c.phones
  const mails: LocalContactEmail[] = c.emails
  const meta: Array<[string, string]> = (
    [
      ['Dirección', c.address ?? ''],
      ['Fecha de nacimiento', c.dob ?? ''],
      ['Contacto de emergencia', c.emergency_contact ?? ''],
    ] as Array<[string, string]>
  ).filter(([, v]) => v)

  win.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(fullName(c))}</title>
  <style>
    body{font-family:system-ui,Segoe UI,Roboto,sans-serif;color:#18181b;max-width:520px;margin:40px auto;padding:0 20px}
    h1{font-size:26px;margin-bottom:4px} .sub{color:#71717a;margin-bottom:24px}
    section{margin-bottom:24px} h2{font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:#a1a1aa;margin-bottom:8px;border-bottom:1px solid #e4e4e7;padding-bottom:6px}
    ul{list-style:none;padding:0;margin:0} li{padding:5px 0;color:#3f3f46} li b{color:#18181b;display:inline-block;min-width:80px}
  </style></head><body>
  <h1>${esc(fullName(c))}</h1>
  <div class="sub">${esc([c.job_title, c.company].filter(Boolean).join(' · ') || 'Contacto')}</div>
  ${rows.length ? `<section><h2>Teléfonos</h2><ul>${rows.map((p) => `<li>${esc(p.phone_number)}</li>`).join('')}</ul></section>` : ''}
  ${mails.length ? `<section><h2>Correos</h2><ul>${mails.map((e) => `<li>${esc(e.email)}</li>`).join('')}</ul></section>` : ''}
  ${c.notes ? `<section><h2>Notas</h2><p>${esc(c.notes)}</p></section>` : ''}
  ${meta.length ? `<section><h2>Información</h2><ul>${meta.map(([k, v]) => `<li><b>${esc(k)}</b>${esc(v)}</li>`).join('')}</ul></section>` : ''}
  <script>window.onload=function(){setTimeout(function(){window.print()},150)}</script>
  </body></html>`)
  win.document.close()
}