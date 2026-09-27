import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse, NextRequest } from 'next/server';
import { isAuthorized, optionsResponse, propfindResponse, unauthorized } from '@/lib/contacts/dav-auth';

// Standalone Contacts app: everything is behind sign-in. Only the Clerk
// callback / sign-in page and the auth-free /api surface skip the redirect.
const isPublicRoute = createRouteMatcher([
  '/sign-in(.*)',
  '/api/(.*)',
]);

// RFC 6764 discovery endpoints; redirect clients (DAVx5, iOS) straight to the
// address book resource.
const DAV_DISCOVERY_PATHS = new Set(['/.well-known/carddav', '/.well-known/caldav']);

function addCloudflareHeaders(response: NextResponse, req: NextRequest) {
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(self), geolocation=(), payment=(), usb=()');
  response.headers.set('Vary', 'Accept-Encoding');

  if (req.nextUrl.pathname.startsWith('/api/')) {
    response.headers.set('Cache-Control', 'public, max-age=7200, s-maxage=7200');
    response.headers.set('X-RateLimit-Limit', '100');
    response.headers.set('X-RateLimit-Remaining', '99');
    response.headers.set('X-RateLimit-Reset', new Date(Date.now() + 60000).toISOString());
  }

  if (req.nextUrl.pathname.match(/\.(css|js|png|jpg|jpeg|gif|ico|svg|woff|woff2)$/)) {
    response.headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  }
}

export default clerkMiddleware(async (auth, req) => {
  if (req.method === 'PROPFIND' && DAV_DISCOVERY_PATHS.has(req.nextUrl.pathname)) {
    return NextResponse.redirect(new URL('/api/dav/contacts', req.url), 301);
  }

  if (req.method === 'PROPFIND' && req.nextUrl.pathname === '/api/dav/contacts') {
    const authResult = await isAuthorized(req);
    if (!authResult.ok) return unauthorized();
    return propfindResponse();
  }

  if (req.method === 'OPTIONS' && DAV_DISCOVERY_PATHS.has(req.nextUrl.pathname)) {
    return optionsResponse();
  }

  if (isPublicRoute(req)) {
    const response = NextResponse.next();
    addCloudflareHeaders(response, req);
    return response;
  }

  const { userId } = await auth();
  if (!userId) {
    const signInUrl = new URL('/sign-in', req.url);
    signInUrl.searchParams.set('redirect_url', req.nextUrl.pathname + req.nextUrl.search);
    return NextResponse.redirect(signInUrl);
  }

  const response = NextResponse.next();
  addCloudflareHeaders(response, req);
  return response;
});

export const config = {
  matcher: [
    '/((?!_next|.*\\..*).*)',
    '/(api|trpc)(.*)',
    '/.well-known/(.*)',
  ],
};