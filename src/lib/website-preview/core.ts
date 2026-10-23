import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import { importSPKI, jwtVerify, SignJWT, type JWTPayload } from 'jose';

export type PreviewFile = { path: string; key: string; size: number; contentType: string };
export interface PreviewClaims extends JWTPayload {
  kind: string; projectId: string; versionId: string; host: string; permissionUntil: number;
  manifestHash?: string; validUntil?: number; nonce?: string;
}
export class PreviewError extends Error { constructor(message: string, public status = 400) { super(message); } }
export function required(name: string) { const value = process.env[name]; if (!value) throw new PreviewError('Website preview service is not configured', 503); return value.replace(/\\n/g, '\n'); }
export const canonicalManifest = (files: PreviewFile[]) => files.map(({ path, key, size, contentType }) => ({ path, key, size, contentType }));
export const hashManifest = (files: PreviewFile[]) => createHash('sha256').update(JSON.stringify(canonicalManifest(files))).digest('hex');
export const artifactKey = (projectId: string, versionId: string) => `website-preview-manifests/${projectId}/${versionId}.json`;
export function previewHost(host: string) { return /^[a-z0-9](?:[a-z0-9-]{0,50}[a-z0-9])?-preview\.merasoftware\.com$/.test(host); }
export function requestHost(request: Request) { return (request.headers.get('host') || new URL(request.url).host).toLowerCase().split(':')[0]; }
export function portalOrigin() { return new URL(required('PORTAL_URL')).origin; }
export async function capability(token: unknown, audience: string): Promise<PreviewClaims> {
  if (typeof token !== 'string' || token.length > 120_000) throw new PreviewError('Invalid preview capability', 401);
  const key = await importSPKI(required('WEBSITE_PREVIEW_PUBLIC_KEY'), 'ES256');
  try {
    const { payload } = await jwtVerify(token, key, { algorithms: ['ES256'], issuer: 'merasoftware-portal-preview', audience });
    if (!/^[a-f0-9]{24}$/.test(String(payload.projectId)) || !/^[0-9a-f-]{36}$/.test(String(payload.versionId))) throw new Error();
    return payload as PreviewClaims;
  } catch { throw new PreviewError('Preview permission is invalid or expired', 401); }
}
export async function backend<T>(action: string, body: unknown): Promise<T> {
  const secret = required('WEBSITE_PREVIEW_SERVICE_SECRET');
  if (secret.length < 32) throw new PreviewError('Preview service credential is not configured', 503);
  const hash = createHash('sha256').update(JSON.stringify(body)).digest('hex');
  const assertion = await new SignJWT({ action, hash }).setProtectedHeader({ alg: 'HS256' }).setIssuer('merasoftware-next-preview')
    .setAudience('merasoftware-preview-service').setJti(randomUUID()).setIssuedAt().setExpirationTime('30s').sign(new TextEncoder().encode(secret));
  const response = await fetch(`${required('PORTAL_API_URL').replace(/\/$/, '')}/api/website-preview-service/${action}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${assertion}` },
    body: JSON.stringify(body), cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(25_000),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.success) throw new PreviewError(result?.message || 'Preview backend unavailable', response.status >= 400 ? response.status : 502);
  return result.data;
}
function sessionKey() { const secret = required('WEBSITE_PREVIEW_SESSION_SECRET'); if (secret.length < 32) throw new PreviewError('Preview session is not configured', 503); return new TextEncoder().encode(secret); }
export async function signSession(claims: PreviewClaims) {
  if (!Number.isSafeInteger(claims.permissionUntil) || claims.permissionUntil <= Date.now() / 1000 || claims.permissionUntil > Number(claims.iat) + 60) throw new PreviewError('Preview permission expired', 401);
  return new SignJWT({ kind: 'session', projectId: claims.projectId, versionId: claims.versionId, host: claims.host, manifestHash: claims.manifestHash })
    .setProtectedHeader({ alg: 'HS256' }).setIssuer('merasoftware-preview').setAudience(claims.host).setIssuedAt().setExpirationTime(claims.permissionUntil).sign(sessionKey());
}
export const COOKIE = '__Host-WebsitePreview';
export async function verifySession(request: Request) {
  const host = requestHost(request);
  const token = request.headers.get('cookie')?.split(';').map(s => s.trim()).find(s => s.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  if (!token || !previewHost(host)) throw new PreviewError('Open this preview from your project portal', 401);
  try {
    const { payload } = await jwtVerify(token, sessionKey(), { algorithms: ['HS256'], issuer: 'merasoftware-preview', audience: host });
    if (payload.kind !== 'session' || payload.host !== host || !/^[a-f0-9]{24}$/.test(String(payload.projectId)) || !/^[0-9a-f-]{36}$/.test(String(payload.versionId))) throw new Error();
    return payload as PreviewClaims;
  } catch { throw new PreviewError('Preview access expired. Reopen it from your portal.', 401); }
}
export function privateHeaders(type = 'text/plain; charset=utf-8') {
  return new Headers({ 'Content-Type': type, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data:; connect-src 'self'; frame-src 'none'; form-action 'none'; base-uri 'self'; frame-ancestors ${portalOrigin()}; worker-src 'none'; object-src 'none'` });
}
export function errorResponse(error: unknown, headers?: Headers) {
  const e = error instanceof PreviewError ? error : new PreviewError('Website preview service unavailable', 503);
  const h = headers || new Headers({ 'Cache-Control': 'private, no-store' });
  return Response.json({ success: false, message: e.message }, { status: e.status, headers: h });
}
export function logicalPath(pathname: string) {
  let path: string;
  try { path = decodeURIComponent(pathname); } catch { throw new PreviewError('Invalid preview path', 400); }
  if (/[\\\x00-\x1f\x7f%?#:]/.test(path) || path.split('/').some(s => s === '.' || s === '..')) throw new PreviewError('Invalid preview path', 400);
  path = path.replace(/^\//, '').normalize('NFC');
  const top = path.split('/')[0].toLowerCase();
  if (['api', 'admin', '_next', '__website-preview', 'sw.js', 'service-worker.js'].includes(top)) throw new PreviewError('Not found', 404);
  return path;
}
