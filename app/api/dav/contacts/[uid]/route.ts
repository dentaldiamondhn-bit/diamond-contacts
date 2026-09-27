import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';
import {
  CLINIC_NAME,
  davHeaders,
  isAuthorized,
  unauthorized,
} from '@/lib/contacts/dav-auth';
import { escapeVCardText, foldVCardLines, formatToE164 } from '@/lib/contacts/vcard';

// Single-address GET for CardDAV clients that request a specific card UID,
// e.g. GET /api/dav/contacts/<uid>.vcf.
//
// Tombstone semantics: a contact soft-deleted in the web app (deleted_at NOT
// NULL) must NOT be served. We answer 410 Gone so strict iOS/DAVx5 clients
// immediately drop the contact from the phone's directory instead of keeping
// a stale copy because a simple 200 removal was missed.

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

function notFound(): NextResponse {
  return new NextResponse('Not Found', {
    status: 404,
    headers: davHeaders(),
  });
}

function gone(): NextResponse {
  return new NextResponse('Gone', {
    status: 410,
    headers: davHeaders(),
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ uid: string }> },
): Promise<NextResponse> {
  const auth = await isAuthorized(request);
  if (!auth.ok || !auth.userId) return unauthorized();

  const { uid: rawUid } = await params;
  // Clients may request the card with or without the .vcf extension.
  const uid = rawUid.replace(/\.vcf$/i, '').replace(/[^\w-]/g, '');
  if (!uid) return notFound();

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data, error } = await supabase
    .from('contacts')
    .select('id, first_name, last_name, company, job_title, updated_at, deleted_at, contact_phones(phone_number), contact_emails(email)')
    .eq('user_id', auth.userId)
    .eq('id', uid)
    .maybeSingle();

  if (error) {
    console.error('[dav] single fetch fallida:', error.message);
    return new NextResponse('Internal Server Error', { status: 500, headers: davHeaders() });
  }

  // Unknown UID -> 404 (stays out of the client directory).
  if (!data) return notFound();

  const row = data as DavContactRow;

  // Soft-deleted / archived tombstone -> 410 so the client deletes it.
  if (row.deleted_at != null) return gone();

  const body = toVCard(row);
  const etag = `"${createHash('md5').update(`${auth.userId}|${row.id}|${row.updated_at ?? ''}`).digest('hex')}"`;

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
      'Content-Disposition': 'inline; filename="contacto.vcf"',
      'ETag': etag,
      'Cache-Control': 'no-cache',
    }),
  });
}

export function OPTIONS(request: NextRequest): Promise<NextResponse> | NextResponse {
  return isAuthorized(request).then((auth) => {
    if (!auth.ok) return unauthorized();
    return new NextResponse(null, {
      status: 204,
      headers: davHeaders({
        Allow: 'GET, OPTIONS',
        'Content-Type': 'text/plain; charset=utf-8',
      }),
    });
  });
}