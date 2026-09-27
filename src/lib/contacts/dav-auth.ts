import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@clerk/backend';

// Shared CardDAV handshake pieces used by both the route handler
// (app/api/dav/contacts/route.ts) and the middleware PROPFIND interceptor.
// Next.js only routes the standard HTTP verbs, so PROPFIND is answered here.

export const CLINIC_NAME = 'Clínica Dental Diamond';

export const ADDRESSBOOK_XML = `<?xml version="1.0" encoding="utf-8" ?>
<D:multistatus xmlns:C="urn:ietf:params:xml:ns:carddav" xmlns:D="DAV:">
  <D:response>
    <D:href>/api/dav/contacts</D:href>
    <D:propstat>
      <D:prop>
        <D:resourcetype><D:collection/><C:addressbook/></D:resourcetype>
        <D:current-user-principal><D:href>/api/dav/</D:href></D:current-user-principal>
        <D:displayname>Contactos Diamond Link</D:displayname>
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>
</D:multistatus>`;

export interface DAVAuth {
  ok: boolean;
  userId?: string;
}

export function davHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return { 'DAV': '1, addressbook', 'Access-Control-Allow-Origin': '*', ...extra };
}

export function unauthorized(): NextResponse {
  return new NextResponse('Unauthorized', {
    status: 401,
    headers: davHeaders({ 'WWW-Authenticate': 'Basic realm="CardDAV"' }),
  });
}

// Edge-safe base64 decode of ASCII Basic credentials (user ids / tokens are ASCII).
function decodeBase64(input: string): string {
  if (typeof atob === 'function') {
    try {
      return decodeURIComponent(Array.from(atob(input), (c) =>
        '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2),
      ).join(''));
    } catch {
      return atob(input);
    }
  }
  return Buffer.from(input, 'base64').toString('utf-8');
}

export async function isAuthorized(
  request: NextRequest,
): Promise<DAVAuth> {
  const shared = process.env.DAV_SYNC_TOKEN;
  const bearer = request.headers.get('authorization')?.trim() ?? '';
  const tokenParam = request.nextUrl.searchParams.get('token') ?? '';
  const userParam = request.nextUrl.searchParams.get('user_id') ?? '';

  // Clerk session JWT -> resolve to the authenticated user.
  if (bearer.toLowerCase().startsWith('bearer ')) {
    const token = bearer.slice(7).trim();
    if (!token) return { ok: false };
    try {
      const claims = await verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY });
      const userId = claims?.sub;
      return userId ? { ok: true, userId } : { ok: false };
    } catch (err) {
      console.error('[dav] verificación de sesión Clerk fallida:', err);
      return { ok: false };
    }
  }

  // Basic auth: base64(username:password)
  if (bearer.toLowerCase().startsWith('basic ')) {
    const decoded = decodeBase64(bearer.slice(6).trim());
    const sep = decoded.indexOf(':');
    if (sep === -1) return { ok: false };
    const user = decoded.slice(0, sep).trim();
    const password = decoded.slice(sep + 1).trim();
    if (!shared) return { ok: false };
    if (password !== shared) return { ok: false };
    if (!user) return { ok: false };
    return { ok: true, userId: user };
  }

  // Query-param credentials: ?user_id=<id>&token=<DAV_SYNC_TOKEN>
  if (userParam) {
    if (!shared) return { ok: false };
    if (tokenParam !== shared) return { ok: false };
    return { ok: true, userId: userParam };
  }

  return { ok: false };
}

export function propfindResponse(): NextResponse {
  return new NextResponse(ADDRESSBOOK_XML, {
    status: 207,
    headers: davHeaders({ 'Content-Type': 'application/xml; charset=utf-8' }),
  });
}

export function optionsResponse(): NextResponse {
  return new NextResponse(null, {
    status: 204,
    headers: davHeaders({
      Allow: 'GET, OPTIONS, PROPFIND',
      'Content-Type': 'text/plain; charset=utf-8',
    }),
  });
}