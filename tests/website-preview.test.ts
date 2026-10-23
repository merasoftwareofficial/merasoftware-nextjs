import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { SignJWT, importPKCS8 } from 'jose';
import { NextRequest } from 'next/server';
import { generateClientTokenFromReadWriteToken, getPayloadFromClientToken } from '@vercel/blob/client';
import { proxy } from '../src/proxy';
import { COOKIE, artifactKey, hashManifest, signSession, type PreviewClaims, type PreviewFile, type backend } from '../src/lib/website-preview/core';
import { createPreviewService } from '../src/lib/website-preview/service';
import type { PreviewStorage } from '../src/lib/website-preview/storage';

const host = 'deepinteriors-preview.merasoftware.com', origin = `https://${host}`, portal = 'https://portal.merasoftware.com';
const projectId = 'a'.repeat(24), versionId = '12345678-1234-4234-8234-123456789012';
const files: PreviewFile[] = [
  { path: 'index.html', key: `website-previews/${projectId}/${versionId}/index.html`, size: 5, contentType: 'text/html' },
  { path: 'services/index.html', key: `website-previews/${projectId}/${versionId}/services/index.html`, size: 5, contentType: 'text/html' },
  { path: 'assets/site.js', key: `website-previews/${projectId}/${versionId}/assets/site.js`, size: 5, contentType: 'application/javascript' },
];
let privateKey: string;
before(() => {
  const keys = generateKeyPairSync('ec', { namedCurve: 'prime256v1', privateKeyEncoding: { format: 'pem', type: 'pkcs8' }, publicKeyEncoding: { format: 'pem', type: 'spki' } });
  privateKey = keys.privateKey; process.env.WEBSITE_PREVIEW_PUBLIC_KEY = keys.publicKey;
  process.env.WEBSITE_PREVIEW_SESSION_SECRET = 'preview-isolated-session-test-secret-32-bytes'; process.env.PORTAL_URL = portal;
});
const claims = (): PreviewClaims => ({ kind: 'handoff', projectId, versionId, host, permissionUntil: Math.floor(Date.now() / 1000) + 60,
  iat: Math.floor(Date.now() / 1000), nonce: 'test-nonce-1234567890', manifestHash: hashManifest(files) });
async function grant(c = claims(), audience = 'website-preview-handoff') {
  return new SignJWT(c).setProtectedHeader({ alg: 'ES256' }).setIssuer('merasoftware-portal-preview').setAudience(audience).setIssuedAt().setExpirationTime('15s').sign(await importPKCS8(privateKey, 'ES256'));
}
function fixture() {
  const objects = new Map(files.map(f => [f.key, { body: 'hello', type: f.contentType }]));
  objects.set(artifactKey(projectId, versionId), { body: JSON.stringify(files), type: 'application/json' });
  const store: PreviewStorage = {
    async read(key) { const f = objects.get(key); return f ? { stream: new Blob([f.body]).stream(), size: Buffer.byteLength(f.body), contentType: f.type } : null; },
    async inventory(prefix) { return [...objects].filter(([key]) => key.startsWith(prefix)).map(([key, f]) => ({ key, size: Buffer.byteLength(f.body) })); },
    async metadata(key) { const f = objects.get(key); return f ? { size: Buffer.byteLength(f.body), contentType: f.type } : null; },
    async writeManifest(_p, _v, manifest) { objects.set(artifactKey(_p, _v), { body: JSON.stringify(manifest), type: 'application/json' }); },
    async token() { return 'scoped-upload-token'; }, async remove(prefix) { for (const key of objects.keys()) if (key.startsWith(prefix)) objects.delete(key); },
  };
  const calls: string[] = []; let redeemed = false;
  const call = (async (action: string) => {
    calls.push(action);
    if (action === 'redeem') { if (redeemed) throw new Error('replay'); redeemed = true; return { claims: claims() }; }
    if (action === 'freeze') return { projectId, versionId, leaseId: 'lease', manifest: files };
    return { ready: true };
  }) as typeof backend;
  return { objects, calls, service: createPreviewService(store, call) };
}
async function cookie() { return `${COOKIE}=${await signSession(claims())}`; }
function request(path: string, init: RequestInit = {}) { return new Request(`${origin}${path}`, { ...init, headers: { host, ...Object.fromEntries(new Headers(init.headers)) } }); }

test('preview hosts route before marketing and forged routing headers are cleared', () => {
  const response = proxy(new NextRequest(`${origin}/assets/site.js`, { headers: { host } }));
  assert.equal(new URL(response.headers.get('x-middleware-rewrite')!).pathname, '/api/website-preview-runtime');
  assert.equal(response.headers.get('x-middleware-request-x-website-preview-path'), '/assets/site.js');
  const normal = proxy(new NextRequest('https://www.merasoftware.com/api/website-preview-runtime', { headers: { host: 'www.merasoftware.com', 'x-website-preview-path': '/index.html' } }));
  assert.equal(normal.headers.get('x-middleware-request-x-website-preview-path'), null);
});
test('private reads require preview permission, ignore the portal token and make no Render request', async () => {
  const f = fixture();
  const denied = await f.service.runtime(request('/', { headers: { cookie: 'token=portal-login-token' } }), '/'); assert.equal(denied.status, 401);
  const allowed = await f.service.runtime(request('/', { headers: { cookie: await cookie() } }), '/');
  assert.equal(allowed.status, 200); assert.equal(await allowed.text(), 'hello'); assert.equal(allowed.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(f.calls, []);
  const js = await f.service.runtime(request('/assets/site.js', { headers: { cookie: await cookie() } }), '/assets/site.js');
  assert.equal(js.headers.get('content-type'), 'application/javascript'); assert.deepEqual(f.calls, []);
});
test('folder indexes preserve clean URLs and query strings; unknown/marketing routes never fall through', async () => {
  const f = fixture(), headers = { cookie: await cookie() };
  const redirect = await f.service.runtime(request('/services?x=1', { headers }), '/services');
  assert.equal(redirect.status, 307); assert.equal(redirect.headers.get('location'), '/services/?x=1');
  assert.equal((await f.service.runtime(request('/services/', { headers }), '/services/')).status, 200);
  for (const path of ['/missing.js', '/api/users', '/admin', '/_next/static/x.js', '/sw.js', '/assets/%2fsecret.js']) {
    const result = await f.service.runtime(request(path, { headers }), path); assert.ok([400, 404].includes(result.status), path);
  }
});
test('handoff binds the portal origin, hostname and absolute deadline', async () => {
  const f = fixture(), token = await grant();
  const make = (source = portal) => request('/__website-preview/bootstrap', { method: 'POST', headers: { origin: source }, body: new URLSearchParams({ token }) });
  assert.equal((await f.service.runtime(make('https://evil.example'), '/__website-preview/bootstrap')).status, 403);
  const response = await f.service.runtime(make(), '/__website-preview/bootstrap');
  assert.equal(response.status, 200);
  const c = response.headers.get('set-cookie')!;
  assert.match(c, /__Host-WebsitePreview=/); assert.match(c, /HttpOnly/); assert.match(c, /SameSite=Strict/); assert.doesNotMatch(c, /Domain=/);
  assert.match(await response.text(), /parent.postMessage/);
  assert.equal((await f.service.runtime(make(), '/__website-preview/bootstrap')).status, 503);
  await assert.rejects(signSession({ ...claims(), permissionUntil: Math.floor(Date.now() / 1000) + 61 }), /expired/);
});
test('manifest integrity, host binding and expired sessions fail closed', async () => {
  const f = fixture(), headers = { cookie: await cookie() };
  f.objects.set(artifactKey(projectId, versionId), { body: '[]', type: 'application/json' });
  assert.equal((await f.service.runtime(request('/', { headers }), '/')).status, 503);
  const otherHost = 'other-preview.merasoftware.com';
  assert.equal((await fixture().service.runtime(new Request(`https://${otherHost}/`, { headers: { host: otherHost, ...headers } }), '/')).status, 401);
});
test('verification rejects missing/incorrect objects and cannot activate on failure', async () => {
  const f = fixture(); f.objects.delete(files[1].key);
  const c = { ...claims(), kind: 'upload', validUntil: Date.now() + 600_000 };
  const capability = await grant(c, 'website-preview-upload');
  const result = await f.service.management(new Request('https://www.merasoftware.com/api/website-preview/complete', {
    method: 'POST', headers: { origin: portal }, body: JSON.stringify({ capability }),
  }), 'complete');
  assert.equal(result.status, 409); assert.deepEqual(f.calls, ['freeze', 'failed']);
});
test('verified inventory creates the immutable artifact before atomic activation', async () => {
  const f = fixture();
  const token = await grant({ ...claims(), kind: 'upload', validUntil: Date.now() + 600_000 }, 'website-preview-upload');
  const result = await f.service.management(new Request('https://www.merasoftware.com/api/website-preview/complete', { method: 'POST',
    headers: { origin: portal }, body: JSON.stringify({ capability: token }) }), 'complete');
  assert.equal(result.status, 200); assert.deepEqual(f.calls, ['freeze', 'finish']);
  assert.ok(f.objects.has(artifactKey(projectId, versionId)));
});
test('installed Blob SDK binds exact path, size, expiry and disabled overwrites without a network request', async () => {
  const until = Date.now() + 30_000;
  const token = await generateClientTokenFromReadWriteToken({ token: 'vercel_blob_rw_previewtest_testcredential', pathname: files[0].key,
    maximumSizeInBytes: 5, allowedContentTypes: ['text/html'], validUntil: until, allowOverwrite: false, addRandomSuffix: false });
  const payload = getPayloadFromClientToken(token);
  assert.equal(payload.pathname, files[0].key); assert.equal(payload.maximumSizeInBytes, 5); assert.equal(payload.validUntil, until);
  assert.equal(payload.allowOverwrite, false); assert.equal(payload.addRandomSuffix, false);
});
