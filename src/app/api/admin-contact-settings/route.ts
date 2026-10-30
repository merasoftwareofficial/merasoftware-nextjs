import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { AuthError, getSession } from '@/lib/auth';
import { PortalApiError, portalApiRequest } from '@/lib/portal-api';

async function handle(request: Request) {
  try {
    const session = await getSession();
    if (!session) throw new AuthError('Sign in to continue.', 401);
    if (session.user.role !== 'admin' || !session.portalRoles.includes('admin')) throw new AuthError('Portal admin access required.', 403);
    const token = (await cookies()).get('token')?.value;
    if (!token) throw new AuthError('Sign in again.', 401);
    if (request.method === 'PATCH' && request.headers.get('origin') !== new URL(request.url).origin) throw new AuthError('Invalid request origin.', 403);
    const data = await portalApiRequest('Admin settings', '/api/admin/my-settings', request.method,
      { Cookie: `token=${token}` }, request.method === 'PATCH' ? await request.json() : undefined);
    return NextResponse.json({ success: true, data }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const status = error instanceof AuthError || error instanceof PortalApiError ? error.status : 400;
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : 'Settings request failed.' }, { status });
  }
}
export const GET = handle;
export const PATCH = handle;
