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
const backend = createRequire(path.resolve(root, '../backend/package.json'));
const mongoose = backend('mongoose'), express = backend('express'), jwt = backend('jsonwebtoken');
const { MongoMemoryServer } = backend('mongodb-memory-server');
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
  writeFileSync(auth, `import {AsyncLocalStorage} from 'node:async_hooks';export const context=new AsyncLocalStorage<any>();export class AuthError extends Error{constructor(message:string,public status:number){super(message)}}export const getSession=async()=>context.getStore()?.session||null;`);
  writeFileSync(headers, `import {context} from './auth';export const cookies=async()=>({get:()=>context.getStore()?.token?{value:context.getStore().token}:undefined});`);
  await build({ absWorkingDir: root, bundle: true, platform: 'node', format: 'cjs', packages: 'external', outfile: path.join(qaDir, 'server.cjs'), tsconfig: path.join(root, 'tsconfig.json'),
    stdin: { contents: `import * as routes from './src/app/api/broadcast/[[...path]]/route';export {routes};export {context} from ${JSON.stringify(auth)};`, resolveDir: root, loader: 'ts' },
    plugins: [{ name: 'fixtures', setup(b) { b.onResolve({ filter: /^@\/lib\/auth$/ }, () => ({ path: auth })); b.onResolve({ filter: /^next\/headers$/ }, () => ({ path: headers })); b.onResolve({ filter: /^server-only$/ }, () => ({ path: 'empty', namespace: 'fixture' })); b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export {}' })); } }] });
  await build({ absWorkingDir: root, bundle: true, outfile: path.join(qaDir, 'panel.js'), jsx: 'automatic', tsconfig: path.join(root, 'tsconfig.json'), loader: { '.module.css': 'local-css' }, define: { 'process.env.NODE_ENV': '"production"', 'process.env': '{}' },
    stdin: { contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {CommunicationHub} from './src/app/admin/communication/communication-hub';createRoot(document.getElementById('root')!).render(<CommunicationHub portalAdmin={true} initial={{panel:null,tab:null,app:null}}/>);`, resolveDir: root, loader: 'tsx' } });
  db = await MongoMemoryServer.create(); process.env.MONGODB_URI = db.getUri();
  await mongoose.connect(db.getUri(), { dbName: 'website-broadcast-isolated' });
  await Promise.all([Template.init(), Broadcast.init()]);
  [admin, member] = await User.create([{ name: 'Admin', email: 'admin@example.test', roles: ['admin'] }, { name: 'Member', email: 'member@example.test', roles: ['member'] }]);
  await Lead.create({ name: 'Sandeep Singh', phone: '9876543210' });
  const app = express(); app.use(express.json()); app.use(backend('cookie-parser')()); app.use('/api/broadcast', backend('./routes/broadcast'));
  await new Promise(resolve => { backendServer = app.listen(0, '127.0.0.1', resolve); });
  process.env.PORTAL_API_URL = `http://127.0.0.1:${backendServer.address().port}`;
  qa = createRequire(import.meta.url)(path.join(qaDir, 'server.cjs'));
  websiteServer = http.createServer(async (req, res) => {
    try {
      if (['/panel.js', '/panel.css'].includes(req.url)) { res.setHeader('Content-Type', req.url.endsWith('.js') ? 'application/javascript' : 'text/css'); return res.end(readFileSync(path.join(qaDir, req.url.slice(1)))); }
      if (req.url.startsWith('/api/')) {
        if (!req.url.startsWith('/api/broadcast/')) { res.statusCode = 503; res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify({ error: 'Other services unavailable in this fixture.' })); }
        let body = ''; for await (const chunk of req) body += chunk;
        const result = await request(req.url, req.method, admin, 'admin', body || undefined);
        res.statusCode = result.status; res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify(result));
      }
      res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><html><head><link rel="stylesheet" href="/panel.css"></head><body><div id="root"></div><script src="/panel.js"></script></body></html>');
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
    await page.getByRole('button', { name: /^Broadcast Lead groups/ }).click();
    await page.getByRole('dialog').getByRole('heading', { name: 'Broadcast', exact: true }).waitFor();
    await page.getByRole('combobox', { name: 'Lead group' }).selectOption('Contacted');
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
    await page.getByRole('combobox', { name: 'Lead group' }).selectOption('Positive');
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
