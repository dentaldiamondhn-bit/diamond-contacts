import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';
import {
  CLINIC_NAME,
  davHeaders,
  isAuthorized,
  optionsResponse,
  unauthorized,
} from '@/lib/contacts/dav-auth';
import { escapeVCardText, foldVCardLines, formatToE164 } from '@/lib/contacts/vcard';

// Lightweight CardDAV endpoint for device address books (iOS / DAVx5 / similar).
//
//   GET            -> vCard 3.0 multi-card of the authenticated user's contacts
//   OPTIONS        -> advertises DAV: 1, addressbook and allowed methods
//   PROPFIND       -> answered in middleware.ts (Next.js only routes standard verbs)
//
// Authentication (per-user, never a global dump):
//   - Authorization: Bearer <Clerk session JWT>  -> scoped to that Clerk user
//   - Authorization: Basic base64(<user_id>:<token>)  -> scoped to user_id
//   - ?user_id=<id>&token=<DAV_SYNC_TOKEN>            (for clients that send
//     their CardDAV credentials only as query params)
// The anonymous-key fallback has been removed: random crawlers can no longer
// dump the clinic directory. Full RFC 6352 (multi-step PROPFIND/REPORT) is
// intentionally out of scope; iOS and DAVx5 accept this minimal discovery.

interface DavPhoneRow {
  phone_number?: string | null;
}
interface DavEmailRow {
  email?: string | null;
}
interface DavContactRow {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  company?: string | null;
  job_title?: string | null;
  updated_at?: string | null;
  deleted_at?: string | null;
  contact_phones?: DavPhoneRow[] | null;
  contact_emails?: DavEmailRow[] | null;
}

function toVCard(c: DavContactRow): string {
  const name = [c.first_name, c.last_name].filter(Boolean).join(' ').trim();
  const lines = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `UID:${c.id}`,
    'PRODID:-//Diamond Link//Contactos v1.0//ES',
  ];
  lines.push(`FN:${escapeVCardText(name || 'Sin nombre')}`);
  lines.push(`N:${escapeVCardText(c.last_name ?? '')};${escapeVCardText(c.first_name ?? '')};;;`);
  lines.push(`ORG:${escapeVCardText(c.company ?? CLINIC_NAME)}`);
  if (c.job_title) lines.push(`TITLE:${escapeVCardText(c.job_title)}`);
  const phones = c.contact_phones ?? [];
  for (const p of phones) {
    if (!p.phone_number) continue;
    const e164 = formatToE164(p.phone_number);
    lines.push(e164
      ? `TEL;TYPE=CELL,VOICE;VALUE=uri:tel:${e164}`
      : `TEL;TYPE=CELL,VOICE:${escapeVCardText(p.phone_number)}`);
    if (e164) lines.push(`X-SOCIALPROFILE;TYPE=whatsapp:https://wa.me/${e164.replace('+', '')}`);
  }
  const emails = c.contact_emails ?? [];
  for (const e of emails) {
    if (e.email) lines.push(`EMAIL;TYPE=WORK:${escapeVCardText(e.email)}`);
  }
  lines.push('END:VCARD');
  return foldVCardLines(lines.join('\r\n'));
}

export function OPTIONS(request: NextRequest): Promise<NextResponse> | NextResponse {
  return isAuthorized(request).then((auth) => (auth.ok ? optionsResponse() : unauthorized()));
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await isAuthorized(request);
  if (!auth.ok || !auth.userId) return unauthorized();

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Paginate through the full set (no hard 2,000-row cap).
  const PAGE = 500;
  const contacts: DavContactRow[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from('contacts')
      .select('id, first_name, last_name, company, job_title, updated_at, deleted_at, contact_phones(phone_number), contact_emails(email)')
      .eq('user_id', auth.userId)
      .is('deleted_at', null)
      .eq('is_archived', false)
      .order('updated_at', { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) {
      console.error('[dav] fetch fallida:', error.message);
      return new NextResponse('Internal Server Error', { status: 500, headers: davHeaders() });
    }
    const page = (Array.isArray(data) ? data : []) as DavContactRow[];
    contacts.push(...page);
    if (page.length < PAGE) break;
    from += PAGE;
  }

  const body = contacts.map(toVCard).join('\r\n');

  // ETag = MD5(scope | count | max updated_at | max deleted_at) for precision.
  const maxUpdated = contacts.reduce<string | null>(
    (max, c) => (c.updated_at && (!max || c.updated_at > max) ? c.updated_at : max),
    null,
  );
  const maxDeleted = contacts.reduce<string | null>(
    (max, c) => (c.deleted_at && (!max || c.deleted_at > max) ? c.deleted_at : max),
    null,
  );
  const etag = `"${createHash('md5')
    .update(`${auth.userId}|${contacts.length}|${maxUpdated ?? ''}|${maxDeleted ?? ''}`)
    .digest('hex')}"`;

  if (request.headers.get('if-none-match') === etag) {
    return new NextResponse(null, {
      status: 304,
      headers: davHeaders({ 'ETag': etag }),
    });
  }

  return new NextResponse(body, {
    status: 200,
    headers: davHeaders({
      'Content-Type': 'text/vcard; charset=utf-8',
      'Content-Disposition': 'inline; filename="contactos.vcf"',
      'ETag': etag,
      'Cache-Control': 'no-cache',
    }),
  });
}