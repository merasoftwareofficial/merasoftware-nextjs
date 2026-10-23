import { NextResponse, type NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  const host = (request.headers.get('host') || '').toLowerCase().split(':')[0];
  const headers = new Headers(request.headers);
  // Never accept a browser-supplied internal routing header.
  headers.delete('x-website-preview-path');
  if (/^[a-z0-9](?:[a-z0-9-]{0,50}[a-z0-9])?-preview\.merasoftware\.com$/.test(host)) {
    headers.set('x-website-preview-path', request.nextUrl.pathname);
    const url = request.nextUrl.clone(); url.pathname = '/api/website-preview-runtime';
    return NextResponse.rewrite(url, { request: { headers } });
  }
  // Preserve the marketing site's previous no-trailing-slash convention.
  if (request.nextUrl.pathname.length > 1 && request.nextUrl.pathname.endsWith('/')) {
    const url = request.nextUrl.clone(); url.pathname = url.pathname.replace(/\/+$/, ''); return NextResponse.redirect(url, 308);
  }
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: [
    { source: '/:path*', has: [{ type: 'host', value: '.*-preview\\.merasoftware\\.com' }] },
    // Marketing static assets keep their CDN path; preview assets match the host rule above.
    '/((?!_next/static|_next/image|favicon.ico|.*\\.[a-zA-Z0-9]+$).*)',
  ],
};
