import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { build } from 'esbuild';
import { chromium } from 'playwright';

// Same isolated setup as email-control.test.mjs: the real backend route on an in-memory database,
// the real website proxy route with a fake session, and the real panel in a browser.
const root = process.cwd();
const backend = createRequire(path.resolve(root, '../backend/package.json'));
const mongoose = backend('mongoose');
const { MongoMemoryServer } = backend('mongodb-memory-server');
const express = backend('express');
const jwt = backend('jsonwebtoken');
const userModel = backend('./models/userModel');
const { Queue, State } = backend('./whatsapp/src/models.js');
const { RECOMMENDED } = backend('./whatsapp/src/settings.js');
let database, backendServer, websiteServer, websiteBase, qa, admin, websiteOnlyAdmin;
const qaDir = path.join(root, '.next', 'whatsapp-qa');
const session = (user, websiteRole) => ({
  user: { _id: `website-${user._id}`, portalUserId: String(user._id), role: websiteRole, banned: false },
  portalRoles: user.roles, portalActiveRole: user.roles[0],
});
const context = (user = admin, role = 'admin') => ({ session: user ? session(user, role) : null, token: user ? jwt.sign({ _id: String(user._id), role: user.roles[0] }, process.env.TOKEN_SECRET_KEY) : undefined });
async function request(pathname, method = 'GET', user = admin, role = 'admin', body) {
  const url = new URL(pathname, 'http://website.test');
  const handler = qa.whatsappRoutes[method];
  if (!handler) return { status: 405 };
  const init = body === undefined ? { method } : { method, body, headers: { 'Content-Type': 'application/json' } };
  const response = await qa.context.run(context(user, role), () => handler(new Request(url, init), { params: Promise.resolve({ path: url.pathname.split('/').slice(3).filter(Boolean) }) }));
  return { status: response.status, ...await response.json() };
}
const minutesAgo = minutes => new Date(Date.now() - minutes * 60_000);

before(async () => {
  process.env.TOKEN_SECRET_KEY = 'whatsapp-website-isolated-test-secret';
  process.env.ENABLE_WHATSAPP = 'true';
  mkdirSync(qaDir, { recursive: true });
  const auth = path.join(qaDir, 'auth-fixture.ts');
  writeFileSync(auth, `import {AsyncLocalStorage} from 'node:async_hooks'; export const context=new AsyncLocalStorage<any>(); export class AuthError extends Error {constructor(message:string,public status:number){super(message)}} export const getSession=async()=>context.getStore()?.session||null;`);
  const headers = path.join(qaDir, 'headers-fixture.ts');
  writeFileSync(headers, `import {context} from './auth-fixture'; export const cookies=async()=>({get:(name:string)=>{const token=context.getStore()?.token;return name==='token'&&token?{value:token}:undefined}});`);
  await build({
    absWorkingDir: root, bundle: true, platform: 'node', format: 'cjs', packages: 'external', outfile: path.join(qaDir, 'server.cjs'), tsconfig: path.join(root, 'tsconfig.json'),
    stdin: { contents: `import * as whatsappRoutes from './src/app/api/whatsapp/[[...path]]/route'; export {whatsappRoutes}; export {context} from ${JSON.stringify(auth)};`, resolveDir: root, loader: 'ts' },
    plugins: [{ name: 'request-context-fixtures', setup(b) { b.onResolve({ filter: /^@\/lib\/auth$/ }, () => ({ path: auth })); b.onResolve({ filter: /^next\/headers$/ }, () => ({ path: headers })); b.onResolve({ filter: /^server-only$/ }, () => ({ path: 'empty', namespace: 'fixture' })); b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export {}', loader: 'js' })); } }],
  });
  await build({ absWorkingDir: root, bundle: true, outfile: path.join(qaDir, 'panel.js'), jsx: 'automatic', tsconfig: path.join(root, 'tsconfig.json'), loader: { '.module.css': 'local-css' }, define: { 'process.env.NODE_ENV': '"production"', 'process.env': '{}' },
    stdin: { contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {WhatsappPanel} from './src/app/admin/whatsapp/whatsapp-panel';createRoot(document.getElementById('root')!).render(<WhatsappPanel view={(new URLSearchParams(location.search).get('view') as any) || undefined}/>);`, loader: 'tsx', resolveDir: root } });
  database = await MongoMemoryServer.create();
  process.env.MONGODB_URI = database.getUri(); // the worker config requires it
  await mongoose.connect(database.getUri(), { dbName: 'website-whatsapp-isolated' });
  await Queue.init();
  [admin, websiteOnlyAdmin] = await userModel.create([
    { name: 'Portal Admin', email: 'admin@example.test', roles: ['admin'] },
    { name: 'Website Admin', email: 'website-admin@example.test', roles: ['member'] },
  ]);
  const app = express(); app.use(express.json()); app.use(backend('cookie-parser')()); app.use('/api/whatsapp-control', backend('./routes/whatsappControl'));
  await new Promise(resolve => { backendServer = app.listen(0, '127.0.0.1', resolve); });
  process.env.PORTAL_API_URL = `http://127.0.0.1:${backendServer.address().port}`;
  qa = createRequire(import.meta.url)(path.join(qaDir, 'server.cjs'));
  websiteServer = http.createServer(async (req, res) => {
    try {
      if (req.url === '/panel.js' || req.url === '/panel.css') { res.setHeader('Content-Type', req.url.endsWith('.js') ? 'application/javascript' : 'text/css'); return res.end(readFileSync(path.join(qaDir, req.url.slice(1)))); }
      if (req.url.startsWith('/api/whatsapp')) {
        let body = '';
        for await (const chunk of req) body += chunk;
        const result = await request(req.url, req.method, admin, 'admin', body || undefined);
        res.statusCode = result.status; res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify(result));
      }
      res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><html><head><link rel="stylesheet" href="/panel.css"></head><body><div id="root"></div><script src="/panel.js"></script></body></html>');
    } catch (error) { res.statusCode = 500; res.end(error.message); }
  });
  await new Promise(resolve => websiteServer.listen(0, '127.0.0.1', resolve));
  websiteBase = `http://127.0.0.1:${websiteServer.address().port}`;
});
beforeEach(async () => { await Promise.all([Queue.deleteMany({}), State.deleteMany({})]); });
after(async () => {
  if (websiteServer) await new Promise(resolve => websiteServer.close(resolve));
  if (backendServer) await new Promise(resolve => backendServer.close(resolve));
  await mongoose.disconnect(); await database?.stop();
});

test('only an admin of both the website and the portal gets in', async () => {
  assert.equal((await request('/api/whatsapp/status')).status, 200);
  assert.equal((await request('/api/whatsapp/status', 'GET', websiteOnlyAdmin)).status, 403, 'website admin without portal admin');
  assert.equal((await request('/api/whatsapp/status', 'GET', admin, 'editor')).status, 403, 'portal admin who is only a website editor');
  assert.equal((await request('/api/whatsapp/status', 'GET', null)).status, 401);
});

test('only the listed actions pass the proxy', async () => {
  for (const [pathname, method] of [['/api/whatsapp', 'GET'], ['/api/whatsapp/queue/abc/retry', 'POST'], ['/api/whatsapp/status', 'POST'], ['/api/whatsapp/../email-control', 'GET'], ['/api/whatsapp/unlink', 'GET'], ['/api/whatsapp/settings/reset', 'GET'], ['/api/whatsapp/settings/other', 'POST']]) {
    assert.equal((await request(pathname, method)).status, 404, `${method} ${pathname}`);
  }
  await request('/api/whatsapp/pause', 'POST');
  assert.equal((await State.findById('main').lean()).paused, true);
  assert.equal((await request('/api/whatsapp/queue?status=failed&page=1&evil=1')).status, 200);
});

test('browser: QR to scan, totals, pause and resume, filters, and Send again for a failed message', async () => {
  await State.create({ _id: 'main', connection: 'qr', qr: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', heartbeatAt: new Date() });
  await Queue.create([
    { to: '919876543210', email: 'ravi@example.test', text: '*Your Project Has Started*\n\nHello Ravi', status: 'sent', sentAt: minutesAgo(5), createdAt: minutesAgo(6) },
    { email: 'subscriber@example.test', text: '*Confirm*\n\nHi', status: 'skipped', lastError: 'No phone number is saved for this email address.', createdAt: minutesAgo(4) },
    { to: '919876543211', email: 'neha@example.test', text: '*Payment reminder*\n\nHello Neha', status: 'failed', lastError: 'socket closed', createdAt: minutesAgo(3) },
  ]);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(websiteBase);
    await page.getByRole('heading', { name: 'Link your WhatsApp number' }).waitFor();
    assert.ok(await page.getByAltText('QR code to link the WhatsApp number').isVisible());
    assert.equal(await page.locator('dt:has-text("Connection") + dd').textContent(), 'Waiting for QR scan');
    assert.equal(await page.locator('dt:has-text("Skipped") + dd').textContent(), '1');

    await page.getByRole('button', { name: 'Pause sending' }).click();
    await page.getByText('Sending is paused.').waitFor();
    assert.equal((await State.findById('main').lean()).paused, true);
    await page.getByRole('button', { name: 'Resume sending' }).click();
    await page.getByText('Sending resumed.').waitFor();

    assert.ok(await page.getByText('No phone number is saved for this email address.').isVisible());
    assert.ok(await page.getByText('+91 98765 43210').isVisible());
    await page.getByRole('combobox', { name: /^Show/ }).selectOption('failed');
    await page.getByText('neha@example.test').waitFor();
    assert.equal(await page.getByText('ravi@example.test').count(), 0);

    await page.getByRole('button', { name: 'Send again' }).click();
    await page.getByText('Back in the queue.').waitFor();
    assert.equal((await Queue.findOne({ email: 'neha@example.test' }).lean()).status, 'pending');

    await State.updateOne({ _id: 'main' }, { connection: 'connected', phone: '919876543210', qr: null });
    await page.getByRole('button', { name: 'Unlink number' }).waitFor({ timeout: 8000 });
    assert.equal(await page.getByAltText('QR code to link the WhatsApp number').count(), 0);
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: 'Unlink number' }).click();
    await page.getByText('Unlink requested.').waitFor();
    assert.equal((await State.findById('main').lean()).logoutRequested, true);
  } finally { await browser.close(); }
});

test('browser: Communication shows each WhatsApp part on its own page, with bold text instead of asterisks', async () => {
  await State.create({ _id: 'main', connection: 'connected', phone: '919876543210', paused: true, heartbeatAt: new Date() });
  await Queue.create({ to: '919876543210', email: 'ravi@example.test', text: '*Your Project Has Started*\n\nHello Ravi', status: 'sent', sentAt: minutesAgo(5), createdAt: minutesAgo(6) });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(`${websiteBase}/?view=messages`);
    await page.getByText('ravi@example.test').waitFor();
    assert.equal(await page.getByRole('button', { name: /Pause sending|Resume sending/ }).count(), 0, 'no connection controls on the message list');
    assert.equal(await page.getByRole('heading', { name: 'Sending rules' }).count(), 0);
    assert.ok(await page.getByText('Resume it under WhatsApp number.').isVisible(), 'a paused queue is still explained');
    await page.getByText('Your Project Has Started').first().click();
    const body = page.locator('details p');
    assert.equal(await body.locator('strong').textContent(), 'Your Project Has Started');
    assert.doesNotMatch(await body.textContent(), /\*/);

    await page.goto(`${websiteBase}/?view=connection`);
    await page.getByRole('button', { name: 'Resume sending' }).waitFor();
    assert.equal(await page.getByRole('heading', { name: 'Messages' }).count(), 0);
    assert.equal(await page.getByRole('heading', { name: 'Sending rules' }).count(), 0);

    await page.goto(`${websiteBase}/?view=rules`);
    await page.getByRole('heading', { name: 'Sending rules' }).waitFor();
    assert.equal(await page.getByRole('heading', { name: 'Messages' }).count(), 0);
    assert.equal(await page.getByRole('button', { name: /Pause sending|Resume sending/ }).count(), 0);
  } finally { await browser.close(); }
});

test('browser: says plainly when WhatsApp is off on the server or the service is not running', async () => {
  await State.create({ _id: 'main', connection: 'connected', heartbeatAt: minutesAgo(5) });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(websiteBase);
    await page.getByText('The WhatsApp service is not running right now.').waitFor();
    delete process.env.ENABLE_WHATSAPP;
    await page.reload();
    await page.getByText('WhatsApp sending is turned off on the server.').waitFor();
  } finally { process.env.ENABLE_WHATSAPP = 'true'; await browser.close(); }
});

test('sending rules pass the proxy with their values; a bad value comes back as the backend\'s plain message', async () => {
  const saved = await request('/api/whatsapp/settings', 'POST', admin, 'admin', JSON.stringify({ ...RECOMMENDED, dailyLimit: 70 }));
  assert.equal(saved.status, 200);
  assert.equal((await State.findById('main').lean()).settings.dailyLimit, 70);
  const refused = await request('/api/whatsapp/settings', 'POST', admin, 'admin', JSON.stringify({ ...RECOMMENDED, dailyLimit: 999 }));
  assert.equal(refused.status, 400);
  assert.match(refused.error, /Messages per day must be a whole number from 1 to 300/);
  assert.equal((await request('/api/whatsapp/settings', 'POST', admin, 'admin', 'not json')).status, 400);
  assert.equal((await request('/api/whatsapp/settings', 'POST', websiteOnlyAdmin, 'admin', JSON.stringify(RECOMMENDED))).status, 403);
});

test('browser: change the sending rules, see a warning, refuse a bad value, reset to recommended', async () => {
  await State.create({ _id: 'main', connection: 'connected', phone: '919876543210', heartbeatAt: new Date() });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(websiteBase);
    await page.getByRole('heading', { name: 'Sending rules' }).waitFor();
    const daily = page.getByLabel('Messages per day');
    assert.equal(await daily.inputValue(), String(RECOMMENDED.dailyLimit));
    assert.ok(await page.getByText(`Recommended: ${RECOMMENDED.dailyLimit} messages (allowed 1–300)`).isVisible());

    await daily.fill('90');
    await page.getByLabel('Gap between messages').fill('60');
    await page.getByLabel('Stop at').selectOption('20');
    await page.getByLabel('Start again at').selectOption('12');
    await page.getByLabel('Drop a message after').fill('12');
    await page.getByRole('button', { name: 'Save rules' }).click();
    await page.getByText('Sending rules saved.').waitFor();
    assert.ok(await page.getByText(/messages made at night will expire/).isVisible());
    const stored = (await State.findById('main').lean()).settings;
    assert.deepEqual([stored.dailyLimit, stored.minGapSec, stored.quietFrom, stored.quietTo, stored.maxAgeHours], [90, 60, 20, 12, 12]);
    await page.getByText('at least 60 seconds apart, up to 90 a day').waitFor({ timeout: 8000 });

    await page.getByLabel('Show \u201ctyping\u2026\u201d before each message').uncheck();
    assert.equal(await page.getByLabel('Longest typing time').isDisabled(), true);
    await page.getByRole('button', { name: 'Save rules' }).click();
    await page.getByText('Sending rules saved.').waitFor();
    assert.equal((await State.findById('main').lean()).settings.typing, false);

    await page.getByLabel('Shortest typing time').evaluate(input => { input.closest('fieldset').querySelector('input[type=checkbox]').click(); });
    await page.getByLabel('Shortest typing time').fill('9');
    await page.getByRole('button', { name: 'Save rules' }).click();
    await page.getByText('Shortest typing time cannot be more than the longest typing time.').waitFor();
    assert.equal((await State.findById('main').lean()).settings.typing, false, 'a refused save changes nothing');

    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: 'Reset to recommended' }).click();
    await page.getByText('Recommended rules restored.').waitFor();
    assert.equal(await daily.inputValue(), String(RECOMMENDED.dailyLimit));
    assert.deepEqual((await State.findById('main').lean()).settings, RECOMMENDED);
    assert.equal(await page.getByText(/will expire/).count(), 0);
  } finally { await browser.close(); }
});
