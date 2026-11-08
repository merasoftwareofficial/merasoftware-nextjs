import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { build } from 'esbuild';
import { chromium } from 'playwright';

// Real proxy + backend routes + MongoDB + visual editor. No external messages are sent.
const root = process.cwd();
const libraryAsset = { _id: '507f1f77bcf86cd799439011', url: 'https://res.cloudinary.com/test/video/upload/v1/clip.mp4', publicId: 'clip', assetId: 'immutable-video', assetFolder: 'test', width: 640, height: 360, format: 'mp4', bytes: 1000, altText: 'Demo video', kind: 'video' };
const unusedAsset = { ...libraryAsset, _id: '507f1f77bcf86cd799439012', publicId: 'unused-clip', assetId: 'unused-video' };
const backend = createRequire(path.resolve(root, '../backend/package.json'));
const mongoose = backend('mongoose'), express = backend('express'), jwt = backend('jsonwebtoken');
const { MongoMemoryReplSet } = backend('mongodb-memory-server');
const User = backend('./models/userModel'), Lead = backend('./models/leadModel'), Template = backend('./models/messageTemplateModel');
const { Broadcast } = backend('./models/broadcastModel');
let db, backendServer, websiteServer, websiteBase, qa, admin, member;
const qaDir = path.join(root, '.next', 'broadcast-qa');
async function request(pathname, method = 'GET', user = admin, websiteRole = 'admin', body) {
  const url = new URL(pathname, 'http://website.test');
  const response = await qa.context.run({ session: user ? { user: { role: websiteRole }, portalRoles: user.roles } : null, token: user ? jwt.sign({ _id: String(user._id), role: user.roles[0] }, process.env.TOKEN_SECRET_KEY) : undefined },
    () => qa.routes[method](new Request(url, { method, ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }) }), { params: Promise.resolve({ path: url.pathname.split('/').slice(3).filter(Boolean) }) }));
  return { status: response.status, ...await response.json() };
}
before(async () => {
  process.env.TOKEN_SECRET_KEY = 'website-broadcast-isolated-secret';
  process.env.ENABLE_WHATSAPP = 'true'; process.env.BROADCAST_JOBS_ENABLED = 'true';
  mkdirSync(qaDir, { recursive: true });
  const auth = path.join(qaDir, 'auth.ts'), headers = path.join(qaDir, 'headers.ts');
  writeFileSync(auth, `import {AsyncLocalStorage} from 'node:async_hooks';export const context=new AsyncLocalStorage<any>();export class AuthError extends Error{constructor(message:string,public status:number){super(message)}}export const getSession=async()=>context.getStore()?.session||null;export const requireRole=async()=>{if(context.getStore()?.session?.user.role!=='admin')throw new AuthError('Admin required',403)};`);
  writeFileSync(headers, `import {context} from './auth';export const cookies=async()=>({get:()=>context.getStore()?.token?{value:context.getStore().token}:undefined});`);
  const mediaFixture = path.join(qaDir, 'media.ts');
  writeFileSync(mediaFixture, `export const fixture={removed:[] as string[],deleted:[] as string[],failRemove:false};const assets=${JSON.stringify([libraryAsset, unusedAsset])};export const mediaRepo={findById:async(id:string)=>assets.find(row=>row._id===id&&!fixture.removed.includes(id))||null,remove:async(id:string)=>{if(fixture.failRemove){fixture.failRemove=false;throw new Error('Library write unavailable')}fixture.removed.push(id);return true}};export const findMediaUsage=async()=>new Map();export const deleteCloudinaryImage=async(id:string)=>{fixture.deleted.push(id)};`);
  await build({ absWorkingDir: root, bundle: true, platform: 'node', format: 'cjs', packages: 'external', outfile: path.join(qaDir, 'server.cjs'), tsconfig: path.join(root, 'tsconfig.json'),
    stdin: { contents: `import * as routes from './src/app/api/broadcast/[[...path]]/route';import * as mediaRoutes from './src/app/api/media/[id]/route';export {routes,mediaRoutes};export {fixture} from ${JSON.stringify(mediaFixture)};export {context} from ${JSON.stringify(auth)};`, resolveDir: root, loader: 'ts' },
    plugins: [{ name: 'fixtures', setup(b) { b.onResolve({ filter: /^@\/lib\/(repo|media-usage|cloudinary)$/ }, () => ({ path: mediaFixture })); b.onResolve({ filter: /^@\/lib\/auth$/ }, () => ({ path: auth })); b.onResolve({ filter: /^next\/headers$/ }, () => ({ path: headers })); b.onResolve({ filter: /^server-only$/ }, () => ({ path: 'empty', namespace: 'fixture' })); b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export {}' })); } }] });
  await build({ absWorkingDir: root, bundle: true, outfile: path.join(qaDir, 'panel.js'), jsx: 'automatic', tsconfig: path.join(root, 'tsconfig.json'), loader: { '.module.css': 'local-css' }, define: { 'process.env.NODE_ENV': '"production"', 'process.env': '{}' },
    stdin: { contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {CommunicationLiveProvider} from './src/lib/communication-live';import {CommunicationHub} from './src/app/admin/communication/communication-hub';createRoot(document.getElementById('root')!).render(<CommunicationLiveProvider url={location.search.includes('live=1')?'/api/live':null}><CommunicationHub portalAdmin={true} initial={{panel:null,tab:null,app:null}}/></CommunicationLiveProvider>);`, resolveDir: root, loader: 'tsx' } });
  db = await MongoMemoryReplSet.create({ replSet: { count: 1 } }); process.env.MONGODB_URI = db.getUri();
  await mongoose.connect(db.getUri(), { dbName: 'website-broadcast-isolated' });
  await Promise.all([Template.init(), Broadcast.init()]);
  [admin, member] = await User.create([{ name: 'Admin', email: 'admin@example.test', roles: ['admin'] }, { name: 'Member', email: 'member@example.test', roles: ['member'] }]);
  await Lead.create({ name: 'Sandeep Singh', phone: '9876543210' });
  const app = express(); app.use(express.json()); app.use(backend('cookie-parser')()); app.use('/api/broadcast', backend('./routes/broadcast'));
  app.get('/api/portal-updates', backend('./middleware/authToken'), backend('./routes/leadUpdates').portal);
  await new Promise(resolve => { backendServer = app.listen(0, '127.0.0.1', resolve); });
  process.env.PORTAL_API_URL = `http://127.0.0.1:${backendServer.address().port}`;
  qa = createRequire(import.meta.url)(path.join(qaDir, 'server.cjs'));
  websiteServer = http.createServer(async (req, res) => {
    try {
      if (req.url === '/api/live') {
        const upstream = http.get(`${process.env.PORTAL_API_URL}/api/portal-updates`, { headers: { Cookie: `token=${jwt.sign({ _id: String(admin._id), role: 'admin' }, process.env.TOKEN_SECRET_KEY)}` } }, response => {
          res.writeHead(response.statusCode, response.headers); response.pipe(res);
        });
        upstream.on('error', () => { if (!res.headersSent) res.writeHead(503); res.end(); });
        res.on('close', () => upstream.destroy());
        return;
      }
      if (req.url === '/globals.css') { res.setHeader('Content-Type', 'text/css'); return res.end(readFileSync(path.join(root, 'src/app/globals.css'))); }
      if (['/panel.js', '/panel.css'].includes(req.url)) { res.setHeader('Content-Type', req.url.endsWith('.js') ? 'application/javascript' : 'text/css'); return res.end(readFileSync(path.join(qaDir, req.url.slice(1)))); }
      if (req.url === '/api/media') { res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify([libraryAsset])); }
      if (req.url.startsWith('/api/')) {
        if (!req.url.startsWith('/api/broadcast/')) { res.statusCode = 503; res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify({ error: 'Other services unavailable in this fixture.' })); }
        let body = ''; for await (const chunk of req) body += chunk;
        const result = await request(req.url, req.method, admin, 'admin', body || undefined);
        res.statusCode = result.status; res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify(result));
      }
      res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><html><head><link rel="stylesheet" href="/globals.css"><link rel="stylesheet" href="/panel.css"></head><body><div id="root"></div><script src="/panel.js"></script></body></html>');
    } catch (error) { res.statusCode = 500; res.end(error.message); }
  });
  await new Promise(resolve => websiteServer.listen(0, '127.0.0.1', resolve));
  websiteBase = `http://127.0.0.1:${websiteServer.address().port}`;
});
after(async () => { if (websiteServer) await new Promise(resolve => websiteServer.close(resolve)); if (backendServer) await new Promise(resolve => backendServer.close(resolve)); await mongoose.disconnect(); await db?.stop(); });

test('proxy enforces both admin roles and its allow-list', async () => {
  assert.equal((await request('/api/broadcast/audiences')).status, 200);
  assert.equal((await request('/api/broadcast/audiences', 'GET', null)).status, 401);
  assert.equal((await request('/api/broadcast/audiences', 'GET', member)).status, 403);
  assert.equal((await request('/api/broadcast/audiences', 'GET', admin, 'editor')).status, 403);
  assert.equal((await request('/api/broadcast/unknown')).status, 404);
  assert.equal((await request('/api/broadcast/audiences', 'DELETE')).status, 404);
  assert.equal((await request('/api/broadcast/templates/invalid', 'PUT', admin, 'admin', {})).status, 404);
});
test('browser: Communication → Broadcast → new message auto-save → reuse, update and delete without changing send history', { timeout: 90000 }, async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 850 } });
    page.setDefaultTimeout(10000);
    await page.goto(websiteBase);
    await page.getByRole('button', { name: /^Broadcast Lead\/client groups/ }).click();
    await page.getByRole('dialog').getByRole('heading', { name: 'Broadcast', exact: true }).waitFor();
    await page.getByRole('combobox', { name: 'Lead group' }).selectOption('leads:Contacted');
    const editor = page.getByRole('textbox', { name: 'Message', exact: true });
    await editor.click();
    await editor.pressSequentially('Dear ');
    await page.getByRole('combobox', { name: 'Insert detail into Message' }).selectOption('emailVariable:name');
    await page.getByRole('button', { name: 'Preview', exact: true }).click();
    await page.waitForTimeout(300);
    assert.deepEqual(await page.getByRole('alert').allTextContents(), [], 'preview error');
    await page.getByText('Sample recipient preview', { exact: true }).waitFor();
    assert.match(await page.getByLabel('Message preview').textContent(), /Dear\s*Sandeep Singh/);
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'Broadcast accepted' }).waitFor();
    assert.equal(await Broadcast.countDocuments(), 1);
    assert.equal(await Template.countDocuments({ purpose: 'broadcast' }), 1);
    const saved = await Template.findOne({ purpose: 'broadcast' });
    await page.getByRole('combobox', { name: 'Recent / saved messages' }).selectOption(String(saved._id));
    assert.ok(await editor.getByText('Recipient name').isVisible());
    await editor.fill('This send only');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'Broadcast accepted' }).waitFor();
    assert.equal(await Broadcast.countDocuments(), 2);
    assert.equal(await Template.countDocuments({ purpose: 'broadcast' }), 1);
    assert.equal((await Template.findById(saved._id)).message, saved.message);
    await page.getByRole('combobox', { name: 'Recent / saved messages' }).selectOption(String(saved._id));
    await editor.fill('Updated reusable message');
    await page.getByRole('textbox', { name: 'Message label' }).fill('My offer');
    await page.getByRole('button', { name: 'Update saved message' }).click();
    await page.getByRole('status').filter({ hasText: 'Saved message updated' }).waitFor();
    assert.equal((await Template.findById(saved._id)).name, 'My offer');
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'Saved message deleted' }).waitFor();
    assert.equal(await Template.countDocuments({ purpose: 'broadcast' }), 0);
    assert.equal(await Broadcast.countDocuments(), 2);
    await page.getByRole('combobox', { name: 'Lead group' }).selectOption('leads:Positive');
    await editor.fill('New draft');
    assert.ok(await page.getByRole('button', { name: 'Send', exact: true }).isDisabled());
    await page.getByRole('button', { name: 'Save Draft', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'Saved message updated' }).waitFor();
    assert.equal(await Template.countDocuments({ purpose: 'broadcast' }), 1);
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await editor.isVisible());
    await page.screenshot({ path: path.join(qaDir, 'broadcast-mobile.png'), fullPage: true });
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    assert.equal(await page.getByRole('dialog').count(), 0);
  } finally { await browser.close(); }
});


test('browser: client behaviour, Both with caption and separate text, signed media, channel persistence and media-only', { timeout: 90000 }, async () => {
  const client = await User.create({ name: 'Client', email: 'client@example.test', roles: ['customer'] });
  await Lead.create({ name: 'Client', email: 'client@example.test', phone: '9876543211', status: 'Won', convertedToUserId: client._id });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
    page.setDefaultTimeout(10000);
    await page.route('https://res.cloudinary.com/**', route => route.fulfill({ status: 200, body: '' }));
    await page.goto(websiteBase);
    await page.getByRole('button', { name: /^Broadcast Lead\/client/ }).click();
    assert.equal(await page.getByLabel('Send via', { exact: true }).inputValue(), 'whatsapp');
    await page.getByLabel('Audience', { exact: true }).selectOption('clients');
    await page.getByLabel('Client behaviour', { exact: true }).selectOption('clients:Dead');
    assert.ok(await page.getByRole('button', { name: 'Send', exact: true }).isDisabled());
    await page.getByLabel('Client behaviour', { exact: true }).selectOption('clients:Contacted');
    await page.getByLabel('Send via', { exact: true }).selectOption('both');
    await page.getByLabel('Email subject', { exact: true }).fill('Client news');
    await page.getByRole('button', { name: 'Add media', exact: true }).click();
    await page.keyboard.press('Escape');
    await page.getByRole('dialog').getByRole('heading', { name: 'Broadcast', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Add media', exact: true }).click();
    await page.getByRole('button', { name: /^Demo video/ }).click();
    await page.getByRole('textbox', { name: 'Caption (optional)', exact: true }).fill('Video caption');
    await page.getByRole('textbox', { name: 'Message', exact: true }).fill('Introduction');
    await page.getByLabel('Separate text position', { exact: true }).selectOption('before');
    await page.getByRole('button', { name: 'Preview', exact: true }).click();
    await page.getByLabel('WhatsApp preview', { exact: true }).waitFor();
    assert.match(await page.getByLabel('Email preview', { exact: true }).textContent(), /Client news/);
    const before = await Broadcast.countDocuments();
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'Broadcast accepted' }).waitFor();
    assert.equal(await Broadcast.countDocuments(), before + 1);
    const sent = await Broadcast.findOne({ audience: 'clients:Contacted' });
    assert.equal(sent.channel, 'both');
    assert.equal(JSON.parse(sent.message).media.assetId, libraryAsset.assetId);
    await page.reload();
    await page.getByRole('button', { name: /^Broadcast Lead\/client/ }).click();
    await page.waitForFunction(() => document.querySelector('[aria-label="Send via"]')?.value === 'both');
    await page.getByLabel('Send via', { exact: true }).selectOption('whatsapp');
    await page.getByRole('button', { name: 'Add media', exact: true }).click();
    await page.getByRole('button', { name: /^Demo video/ }).click();
    await page.getByRole('button', { name: 'Save Draft', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'Saved message updated' }).waitFor();
    const saved = await Template.findOne({ name: 'Media message' });
    assert.equal(JSON.parse(saved.message).media.id, libraryAsset._id);
    assert.deepEqual(await page.getByRole('alert').allTextContents(), []);
  } finally { await browser.close(); }
});

test('browser: committed lead and client changes update counts over the real SSE feed without replacing an unsaved draft', { timeout: 45000 }, async () => {
  const lead = await Lead.create({ name: 'Live lead', phone: '9876543212' });
  const client = await Lead.findOne({ status: 'Won' });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const live = page.waitForResponse(response => response.url().endsWith('/api/live') && response.status() === 200);
    await page.goto(`${websiteBase}/?live=1`);
    await page.getByRole('button', { name: /^Broadcast Lead\/client/ }).click();
    await live;
    await page.getByRole('textbox', { name: 'Message', exact: true }).fill('Keep my unsaved message');
    await page.getByLabel('Lead group', { exact: true }).selectOption('leads:Positive');
    const positive = page.locator('option[value="leads:Positive"]');
    const before = Number((await positive.textContent()).match(/\((\d+) people/)[1]);
    await Lead.updateOne({ _id: lead._id }, { status: 'Positive' });
    await page.waitForFunction(expected => document.querySelector('option[value="leads:Positive"]')?.textContent.includes(`(${expected} people)`), before + 1, { timeout: 3000 });
    assert.equal(await page.getByRole('textbox', { name: 'Message', exact: true }).textContent(), 'Keep my unsaved message');
    await page.getByLabel('Audience', { exact: true }).selectOption('clients');
    await page.getByLabel('Client behaviour', { exact: true }).selectOption('clients:Contacted');
    const neutral = page.locator('option[value="clients:Contacted"]');
    const clientBefore = Number((await neutral.textContent()).match(/\((\d+) people/)[1]);
    await Lead.updateOne({ _id: client._id }, { clientBehaviour: 'NotNow' });
    await page.waitForFunction(expected => document.querySelector('option[value="clients:Contacted"]')?.textContent.includes(`(${expected} people)`), clientBefore - 1, { timeout: 3000 });
    assert.equal(await page.getByRole('textbox', { name: 'Message', exact: true }).textContent(), 'Keep my unsaved message');
    assert.deepEqual(await page.getByRole('alert').allTextContents(), []);
  } finally { await browser.close(); }
});

test('website deletion reuses signed backend retirement, blocks referenced media, and recovers an interrupted library delete', async () => {
  const remove = async id => {
    const response = await qa.context.run({ session: { user: { role: 'admin' } } }, () => qa.mediaRoutes.DELETE(new Request(`http://website.test/api/media/${id}`, { method: 'DELETE' }), { params: Promise.resolve({ id }) }));
    return { status: response.status, ...await response.json() };
  };
  const used = await remove(libraryAsset._id);
  assert.equal(used.status, 400); assert.match(used.error, /used by a Broadcast/);
  assert.deepEqual(qa.fixture.removed, []); assert.deepEqual(qa.fixture.deleted, []);
  qa.fixture.failRemove = true;
  assert.equal((await remove(unusedAsset._id)).status, 400);
  assert.deepEqual(qa.fixture.deleted, []);
  const recovered = await remove(unusedAsset._id);
  assert.equal(recovered.status, 200); assert.equal(recovered.deleted, true);
  assert.deepEqual(qa.fixture.removed, [unusedAsset._id]);
  assert.deepEqual(qa.fixture.deleted, [unusedAsset.publicId]);
});
