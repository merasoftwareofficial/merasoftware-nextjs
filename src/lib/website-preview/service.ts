import 'server-only';
import { backend, capability, canonicalManifest, hashManifest, PreviewError, portalOrigin, previewHost, requestHost,
  privateHeaders, errorResponse, signSession, verifySession, logicalPath, COOKIE, artifactKey, type PreviewClaims, type PreviewFile } from './core';
import { storage, loadManifest, type PreviewStorage } from './storage';

type CallBackend = typeof backend;
export function createPreviewService(store: PreviewStorage = storage, call: CallBackend = backend) {
  async function management(request: Request, action: string) {
    const headers = new Headers({ 'Cache-Control': 'private, no-store', 'Vary': 'Origin' });
    const origin = request.headers.get('origin');
    if (origin === portalOrigin()) { headers.set('Access-Control-Allow-Origin', origin); headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS'); headers.set('Access-Control-Allow-Headers', 'Content-Type'); }
    if (origin !== portalOrigin() || previewHost(requestHost(request))) return errorResponse(new PreviewError('Portal origin required', 403), headers);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    try {
      if (request.headers.get('content-length') && Number(request.headers.get('content-length')) > 512_000) throw new PreviewError('Preview request too large', 413);
      const raw = await request.text(); if (raw.length > 512_000) throw new PreviewError('Preview request too large', 413);
      const body = JSON.parse(raw);
      if (action === 'tokens') {
        const claims = await capability(body.capability, 'website-preview-upload');
        const files = body.manifest as PreviewFile[];
        const policy = claims.policy as { fileCount: number };
        if (claims.kind !== 'upload' || !policy || !Array.isArray(files) || files.length > policy.fileCount || hashManifest(files) !== claims.manifestHash || !claims.validUntil || claims.validUntil <= Date.now()) throw new PreviewError('Invalid upload manifest', 403);
        const prefix = `website-previews/${claims.projectId}/${claims.versionId}/`;
        const tokens = [];
        for (const file of canonicalManifest(files)) {
          if (file.key !== `${prefix}${file.path}`) throw new PreviewError('Upload path mismatch', 403);
          tokens.push({ path: file.path, key: file.key, contentType: file.contentType, token: await store.token(file, claims.validUntil) });
        }
        return Response.json({ success: true, data: { tokens, validUntil: claims.validUntil } }, { headers });
      }
      if (action === 'complete') {
        await capability(body.capability, 'website-preview-upload');
        const frozen = await call<{ ready?: boolean; projectId: string; versionId: string; leaseId: string; manifest: PreviewFile[] }>('freeze', { capability: body.capability });
        if (frozen.ready) return Response.json({ success: true, data: { ready: true } }, { headers });
        const { projectId, versionId, leaseId, manifest } = frozen;
        try {
          const inventory = await store.inventory(`website-previews/${projectId}/${versionId}/`);
          if (inventory.length !== manifest.length || inventory.some(f => !manifest.some(m => m.key === f.key && m.size === f.size))) throw new PreviewError('Uploaded files do not match the authorized manifest', 409);
          for (let i = 0; i < manifest.length; i += 8) await Promise.all(manifest.slice(i, i + 8).map(async file => {
            const m = await store.metadata(file.key);
            if (!m || m.size !== file.size || m.contentType.split(';')[0] !== file.contentType) throw new PreviewError('A website file failed verification', 409);
          }));
          await store.writeManifest(projectId, versionId, manifest);
          const result = await call('finish', { versionId, leaseId });
          return Response.json({ success: true, data: result }, { headers });
        } catch (error) { await call('failed', { versionId, leaseId }).catch(() => {}); throw error; }
      }
      if (action === 'cleanup') {
        if (!Array.isArray(body.claims) || body.claims.length > 20) throw new PreviewError('Invalid cleanup batch');
        for (const token of body.claims) {
          const c = await capability(token, 'website-preview-cleanup');
          if (c.kind !== 'cleanup') throw new PreviewError('Invalid cleanup capability', 403);
          await store.remove(`website-previews/${c.projectId}/${c.versionId}/`);
          await store.remove(artifactKey(c.projectId, c.versionId));
          await call('cleanup-done', { capability: token });
        }
        return Response.json({ success: true, data: { cleaned: body.claims.length } }, { headers });
      }
      throw new PreviewError('Not found', 404);
    } catch (error) { return errorResponse(error, headers); }
  }
  async function runtime(request: Request, pathname: string) {
    let headers: Headers;
    try { headers = privateHeaders(); } catch (error) { return errorResponse(error); }
    try {
      const host = requestHost(request);
      if (!previewHost(host)) throw new PreviewError('Not found', 404);
      if (pathname === '/__website-preview/bootstrap') {
        if (request.method !== 'POST' || request.headers.get('origin') !== portalOrigin()) throw new PreviewError('Portal handoff required', 403);
        const raw = await request.text(); if (raw.length > 12_000) throw new PreviewError('Handoff too large', 413);
        const form = new URLSearchParams(raw), token = form.get('token');
        const c = await capability(token, 'website-preview-handoff');
        if (c.kind !== 'handoff' || c.host !== host) throw new PreviewError('Preview host mismatch', 403);
        await call<{ claims: PreviewClaims }>('redeem', { token });
        const manifestHash = String(c.manifestHash);
        // The immutable artifact was written before activation. Do not copy mutable ownership state here.
        await loadManifest(store, c.projectId, c.versionId, manifestHash);
        const session = await signSession({ ...c, manifestHash });
        headers.set('Set-Cookie', `${COOKIE}=${session}; Path=/; Secure; HttpOnly; SameSite=Strict; Expires=${new Date(c.permissionUntil * 1000).toUTCString()}`);
        headers.set('Content-Type', 'text/html; charset=utf-8');
        const message = JSON.stringify({ type: 'website-preview-ready', nonce: c.nonce, versionId: c.versionId }).replace(/</g, '\\u003c');
        const target = JSON.stringify(portalOrigin()).replace(/</g, '\\u003c');
        return new Response(`<!doctype html><html><head><meta charset="utf-8"><title>Preview ready</title></head><body><script>parent.postMessage(${message},${target})</script></body></html>`, { headers });
      }
      if (!['GET', 'HEAD'].includes(request.method)) throw new PreviewError('Method not allowed', 405);
      const path = logicalPath(pathname);
      const c = await verifySession(request);
      const files = await loadManifest(store, c.projectId, c.versionId, String(c.manifestHash));
      const direct = path || 'index.html';
      const file = files.find(f => f.path === direct) || files.find(f => f.path === `${path.replace(/\/$/, '')}/index.html`);
      if (!file) throw new PreviewError('Not found', 404);
      // Preserve directory-relative URLs; query strings survive the canonical folder redirect.
      if (path && !path.endsWith('/') && file.path.endsWith('/index.html') && file.path !== path) {
        const url = new URL(request.url); url.pathname = `${pathname}/`;
        headers.set('Location', `${url.pathname}${url.search}`); return new Response(null, { status: 307, headers });
      }
      if (file.key !== `website-previews/${c.projectId}/${c.versionId}/${file.path}`) throw new PreviewError('Invalid preview manifest', 503);
      if (request.method === 'HEAD') { headers.set('Content-Type', file.contentType); headers.set('Content-Length', String(file.size)); return new Response(null, { headers }); }
      const data = await store.read(file.key); if (!data || data.size !== file.size) throw new PreviewError('Preview file unavailable', 404);
      headers.set('Content-Type', file.contentType); headers.set('Content-Length', String(file.size));
      return new Response(data.stream, { headers });
    } catch (error) { return errorResponse(error, headers); }
  }
  return { management, runtime };
}
