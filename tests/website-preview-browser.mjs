// Isolated cross-repository pilot. Every browser request is intercepted; no live API, DNS or Blob write.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { readFile, readdir, mkdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { getPayloadFromClientToken } from '@vercel/blob/client';
import { createPreviewService } from '../src/lib/website-preview/service.ts';
import { storage as providerStorage } from '../src/lib/website-preview/storage.ts';

const backendRequire = createRequire(new URL('../../backend/package.json', import.meta.url));
const frontend = fileURLToPath(new URL('../../frontend/', import.meta.url));
const frontRequire = createRequire(path.join(frontend, 'package.json'));
const express = backendRequire('express'), cookieParser = backendRequire('cookie-parser'), mongoose = backendRequire('mongoose');
const { MongoMemoryReplSet } = backendRequire('mongodb-memory-server');
const jwt = backendRequire('jsonwebtoken');
const Users = backendRequire('./models/userModel'), Orders = backendRequire('./models/orderProductModel');
const { Preview, Version, Receipt } = backendRequire('./models/websitePreviewModel');
const controller = backendRequire('./controller/order/websitePreview');
const auth = backendRequire('./middleware/authToken');
const { zipSync } = frontRequire('fflate');
const portal = 'https://portal.merasoftware.com', website = 'https://www.merasoftware.com', api = 'https://api.merasoftware.com';
const previewHost = 'deepinteriors-preview.merasoftware.com';
const blobOrigin = 'https://blob-api.preview.test';
const site = path.resolve(process.argv[2] || 'E:/Deepinteriors');
let database, browser, server;
const objects = new Map(), requests = { api: 0, apiBytes: 0, blobPuts: 0, blobBytes: 0, preview: 0 };
const artifacts = path.join(os.tmpdir(), `website-preview-pilot-${randomUUID()}`);
const errors = [], blocked = [], debugPages = [], responses = [];
try {
  const keys = generateKeyPairSync('ec', { namedCurve: 'prime256v1', privateKeyEncoding: { format: 'pem', type: 'pkcs8' }, publicKeyEncoding: { format: 'pem', type: 'spki' } });
  Object.assign(process.env, { WEBSITE_PREVIEW_PRIVATE_KEY: keys.privateKey, WEBSITE_PREVIEW_PUBLIC_KEY: keys.publicKey,
    WEBSITE_PREVIEW_SERVICE_SECRET: 'isolated-browser-service-secret-at-least-32', WEBSITE_PREVIEW_SESSION_SECRET: 'isolated-browser-session-secret-at-least-32',
    TOKEN_SECRET_KEY: 'isolated-browser-portal-secret', WEBSITE_PREVIEW_SERVICE_URL: website, PORTAL_URL: portal,
    BLOB_READ_WRITE_TOKEN: 'vercel_blob_rw_pilotstore_test-only-credential' });
  database = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(database.getUri('website-preview-browser'));
  await Promise.all([Preview.init(), Version.init(), Receipt.init(), Users.init(), Orders.init()]);
  const adminId = new mongoose.Types.ObjectId(), clientId = new mongoose.Types.ObjectId(), projectId = new mongoose.Types.ObjectId();
  await Users.collection.insertMany([{ _id: adminId, email: 'admin@example.test', roles: ['admin'], isActive: true }, { _id: clientId, email: 'client@example.test', roles: ['customer'], isActive: true }]);
  await Orders.collection.insertOne({ _id: projectId, userId: clientId, isWebsiteProject: true, projectSnapshot: { displayName: 'Deep Interiors pilot', category: 'standard_websites' }, projectProgress: 25, orderVisibility: 'approved' });
  const app = express(); app.use(cookieParser()); app.use(express.json({ limit: '1mb' }));
  app.use((req, res, next) => { if (req.path.startsWith('/api/')) { requests.api++; requests.apiBytes += Buffer.byteLength(JSON.stringify(req.body || {})); }
    if (req.headers.origin === portal) { res.set('Access-Control-Allow-Origin', portal); res.set('Access-Control-Allow-Credentials', 'true'); res.set('Access-Control-Allow-Headers', 'Content-Type'); res.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS'); }
    if (req.method === 'OPTIONS') return res.sendStatus(204); next(); });
  app.get('/api/projects/:projectId/website-preview', auth, controller.state);
  app.patch('/api/projects/:projectId/website-preview', auth, controller.settings);
  app.post('/api/projects/:projectId/website-preview/uploads', auth, controller.begin);
  app.post('/api/projects/:projectId/website-preview/uploads/:versionId/tokens', auth, controller.batch);
  app.post('/api/projects/:projectId/website-preview/grant', auth, controller.grant);
  app.post('/api/projects/:projectId/website-preview/cleanup', auth, controller.cleanup);
  app.post('/api/website-preview-service/:action', controller.integration);
  server = createServer(app); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  process.env.PORTAL_API_URL = `http://127.0.0.1:${server.address().port}`;
  const store = {
    async read(key) { const value = objects.get(key); return value ? { stream: new Blob([value.bytes]).stream(), size: value.bytes.length, contentType: value.type } : null; },
    async metadata(key) { const value = objects.get(key); return value ? { size: value.bytes.length, contentType: value.type } : null; },
    async inventory(prefix) { return [...objects].filter(([key]) => key.startsWith(prefix)).map(([key, value]) => ({ key, size: value.bytes.length })); },
    async writeManifest(p, v, files) { const key = `website-preview-manifests/${p}/${v}.json`; assert.ok(!objects.has(key)); objects.set(key, { bytes: Buffer.from(JSON.stringify(files)), type: 'application/json' }); },
    token: providerStorage.token,
    async remove(prefix) { for (const key of objects.keys()) if (key.startsWith(prefix)) objects.delete(key); },
  };
  const service = createPreviewService(store);
  const define = { 'process.env.NODE_ENV': '"production"', 'process.env.REACT_APP_BACKEND_URL': JSON.stringify(api),
    'process.env.NEXT_PUBLIC_VERCEL_BLOB_API_URL': JSON.stringify(blobOrigin), 'process.env.VERCEL_BLOB_API_URL': 'undefined' };
  const ui = await build({ stdin: { contents: `import React from 'react';import{createRoot}from'react-dom/client';import Panel from './src/components/WebsitePreviewPanel';createRoot(document.getElementById('root')).render(<Panel projectId="${projectId}" admin={new URLSearchParams(location.search).has('admin')}/>);`, loader: 'jsx', resolveDir: frontend }, bundle: true, write: false, platform: 'browser', format: 'esm', loader: { '.js': 'jsx' }, define });
  const worker = await build({ entryPoints: [path.join(frontend, 'src/workers/websitePreview.worker.js')], bundle: true, write: false, platform: 'browser', format: 'iife' });
  const zipFiles = {};
  async function add(relative) {
    const target = path.join(site, relative), stat = await readdir(target, { withFileTypes: true }).catch(() => null);
    if (stat) { for (const entry of stat) await add(path.join(relative, entry.name)); }
    else zipFiles[relative.replaceAll('\\', '/')] = new Uint8Array(await readFile(target));
  }
  for (const item of ['index.html', 'assets', 'Images', 'services/index.html', 'gallery/index.html', 'our-approach/index.html', 'contact/index.html']) await add(item);
  const zip = Buffer.from(zipSync(zipFiles));
  const html = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{margin:24px;font:16px/1.6 Arial;color:#102c48}button,input{font:inherit;padding:8px;margin:6px}section{padding:16px;border:1px solid #dce2e6;margin:16px 0}iframe{max-width:100%}input[type=file]{display:block}p{font-size:16px}</style></head><body><div id="root"></div><script type="module" src="/assets/harness.js"></script></body></html>';
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  async function context(role, userId) {
    const ctx = await browser.newContext({ viewport: { width: 1365, height: 1000 }, serviceWorkers: 'block' });
    const token = jwt.sign({ _id: String(userId), role }, process.env.TOKEN_SECRET_KEY, { algorithm: 'HS256', expiresIn: '1h' });
    await ctx.addCookies([{ name: 'token', value: token, domain: '.merasoftware.com', path: '/', httpOnly: true, secure: true, sameSite: 'None' }]);
    await ctx.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url()), headers = await request.allHeaders();
      if (url.origin === api) {
        const response = await fetch(`${process.env.PORTAL_API_URL}${url.pathname}${url.search}`, { method: request.method(), headers: { 'Content-Type': 'application/json', cookie: headers.cookie || '', origin: headers.origin || '' }, body: ['GET', 'HEAD'].includes(request.method()) ? undefined : request.postDataBuffer() });
        return route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: Buffer.from(await response.arrayBuffer()) });
      }
      if (url.origin === portal) {
        if (url.pathname === '/assets/harness.js') return route.fulfill({ contentType: 'application/javascript', body: ui.outputFiles[0].text });
        if (url.pathname === '/workers/websitePreview.worker.js') return route.fulfill({ contentType: 'application/javascript', body: worker.outputFiles[0].text });
        return route.fulfill({ contentType: 'text/html', body: html });
      }
      if (url.origin === blobOrigin) {
        const cors = { 'access-control-allow-origin': portal, 'access-control-allow-methods': 'PUT,OPTIONS', 'access-control-allow-headers': '*' };
        if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
        assert.equal(request.method(), 'PUT'); const key = url.searchParams.get('pathname'), bytes = request.postDataBuffer();
        const scope = getPayloadFromClientToken((headers.authorization || '').replace(/^Bearer /, ''));
        assert.equal(scope.pathname, key); assert.equal(scope.allowOverwrite, false); assert.ok(scope.validUntil > Date.now()); assert.ok(bytes.length <= scope.maximumSizeInBytes); assert.ok(!objects.has(key));
        const type = headers['x-content-type']; assert.ok(scope.allowedContentTypes.includes(type)); assert.equal(headers['x-vercel-blob-access'], 'private');
        objects.set(key, { bytes, type }); requests.blobPuts++; requests.blobBytes += bytes.length;
        return route.fulfill({ headers: cors, json: { url: `https://pilotstore.private.blob.vercel-storage.com/${key}`, downloadUrl: `https://pilotstore.private.blob.vercel-storage.com/${key}`, pathname: key, contentType: type, contentDisposition: 'inline', etag: 'pilot' } });
      }
      let response;
      const req = new Request(request.url(), { method: request.method(), headers: { ...headers, host: url.host }, body: ['GET', 'HEAD'].includes(request.method()) ? undefined : request.postDataBuffer() });
      if (url.origin === website && url.pathname.startsWith('/api/website-preview/')) response = await service.management(req, url.pathname.split('/').pop());
      else if (url.hostname === previewHost) { requests.preview++; response = await service.runtime(req, url.pathname); }
      else if (url.hostname === 'wa.me') return route.fulfill({ contentType: 'text/html', body: '<p>Test enquiry prepared; no external message sent.</p>' });
      else if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ contentType: 'text/css', body: '' });
      else { blocked.push(request.url()); return route.abort(); }
      return route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: Buffer.from(await response.arrayBuffer()) });
    });
    const page = await ctx.newPage(); debugPages.push(page); page.on('response', r=>responses.push({url:new URL(r.url()).pathname,status:r.status()})); page.on('pageerror', error => errors.push(error.message)); return { ctx, page };
  }
  const admin = await context('admin', adminId);
  await admin.page.goto(`${portal}/?admin=1`);
  await admin.page.getByLabel('Project preview hostname').fill(previewHost);
  await admin.page.getByRole('button', { name: 'Save hostname' }).click();
  await admin.page.locator('input[type=file]:enabled').waitFor();
  await admin.page.locator('input[type=file]').setInputFiles({ name: 'deep-interiors.zip', mimeType: 'application/zip', buffer: zip });
  await admin.page.getByText('Website uploaded and verified. Client visibility is unchanged.').waitFor({ timeout: 90_000 });
  assert.equal(requests.blobPuts, Object.keys(zipFiles).length);
  await admin.page.getByRole('button', { name: 'Show to Client' }).click();
  await admin.page.getByRole('button', { name: 'Hide from Client' }).waitFor();
  const client = await context('customer', clientId);
  await client.page.goto(portal);
  await client.page.getByRole('button', { name: 'View Website Preview' }).click();
  const frame = client.page.frameLocator('iframe[title="Your website"]');
  await frame.locator('h1').filter({ hasText: 'Good spaces.' }).waitFor();
  await frame.locator('header').getByRole('link', { name: 'Gallery', exact: true }).click();
  await frame.locator('.gallery-item').nth(29).waitFor(); assert.equal(await frame.locator('.gallery-item').count(), 30);
  const imagesLoaded=await frame.locator('.gallery-item img').evaluateAll(async imgs=>{imgs.forEach(i=>i.loading='eager');await Promise.all(imgs.map(i=>new Promise(resolve=>{const probe=new Image();probe.onload=resolve;probe.onerror=resolve;probe.src=i.src})));return imgs.every(i=>i.naturalWidth>0)});assert.equal(imagesLoaded,true);
  await frame.getByRole('button', { name: 'Doors', exact: true }).click(); assert.ok(await frame.locator('.gallery-item').count() < 30);
  await frame.locator('.gallery-item').first().click(); await frame.locator('dialog[open]').waitFor();
  await client.page.keyboard.press('Escape');
  // A grant replay or wrong portal must never create another authorized session.
  const current = await Preview.findById(projectId).lean(); assert.equal(current.visible, true); assert.ok(current.currentVersion);
  const version = await Version.findById(current.currentVersion).lean(); assert.equal(version.state, 'ready');
  await client.page.getByRole('button', { name: 'Mobile view', exact: true }).click();
  await frame.locator('header').getByRole('button', { name: 'Open navigation' }).click();
  await frame.locator('header').getByRole('link', { name: 'Contact', exact: true }).click();
  await frame.locator('#enquiry-form').waitFor();
  await frame.getByLabel('Your name').fill('Pilot Client'); await frame.getByLabel('What are you planning?').selectOption({ label: 'Modern kitchen' });
  await frame.getByLabel('A little about your project').fill('Kitchen planning');
  const popupPromise = client.page.waitForEvent('popup');
  await frame.getByRole('button', { name: 'Continue on WhatsApp' }).click();
  const popup = await popupPromise; await popup.waitForLoadState('domcontentloaded'); assert.ok(popup.url().startsWith('https://wa.me/')); await popup.close();
  await client.page.getByRole('button', { name: 'Desktop view', exact: true }).click();
  // A normal renewal must not reload the visible website or lose the form input.
  await client.page.waitForTimeout(42_000);
  assert.equal(await frame.getByLabel('Your name').inputValue(), 'Pilot Client');
  await admin.page.getByRole('button', { name: 'Hide from Client' }).click();
  await client.page.getByRole('alert').waitFor({ timeout: 50_000 });
  assert.equal(await client.page.locator('iframe[title="Your website"]').count(), 0);
  await mkdir(artifacts, { recursive: true }); await admin.page.screenshot({ path: path.join(artifacts, 'admin-preview.png'), fullPage: true });
  assert.deepEqual(errors, []);
  assert.ok(requests.apiBytes < requests.blobBytes / 4, 'Render must see metadata, not website file bytes');
  console.log(JSON.stringify({ passed: true, site, uploadedFiles: requests.blobPuts, galleryImages: 30, mobileNavigation: true, whatsappForm: true,
    renewalPreservedInput: true, hideStoppedViewer: true, requests, storage: 'isolated in-memory adapter; installed Blob upload SDK', browserErrors: errors, artifacts }, null, 2));
} catch(error) {
  console.error(JSON.stringify({errors,blocked,responses:responses.slice(-15),requests,pages:await Promise.all(debugPages.map(async p=>({url:p.url(),body:(await p.locator('body').innerText()).slice(0,2200),frames:p.frames().map(f=>f.url())})))},null,2));
  throw error;
} finally {
  if (browser) await browser.close();
  if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  await mongoose.disconnect(); if (database) await database.stop();
}
