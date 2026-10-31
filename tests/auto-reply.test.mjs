import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { build } from 'esbuild';
import { chromium } from 'playwright';

// Real proxy + backend routes + MongoDB + the Communication page. No WhatsApp connection; nothing is sent.
const root = process.cwd();
const backend = createRequire(path.resolve(root, '../backend/package.json'));
const mongoose = backend('mongoose'), express = backend('express'), jwt = backend('jsonwebtoken');
const { MongoMemoryServer } = backend('mongodb-memory-server');
const User = backend('./models/userModel');
const { FinalMessage, Inbox, Rule, State, STATE_ID } = backend('./whatsapp/src/models.js');
let db, backendServer, websiteServer, websiteBase, qa, admin, member;
const qaDir = path.join(root, '.next', 'auto-reply-qa');
async function request(pathname, method = 'GET', user = admin, websiteRole = 'admin', body) {
  const url = new URL(pathname, 'http://website.test');
  const response = await qa.context.run({ session: user ? { user: { role: websiteRole }, portalRoles: user.roles } : null, token: user ? jwt.sign({ _id: String(user._id), role: user.roles[0] }, process.env.TOKEN_SECRET_KEY) : undefined },
    () => qa.routes[method](new Request(url, { method, ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }) }), { params: Promise.resolve({ path: url.pathname.split('/').slice(3).filter(Boolean) }) }));
  return { status: response.status, ...await response.json() };
}
before(async () => {
  process.env.TOKEN_SECRET_KEY = 'website-auto-reply-isolated-secret';
  process.env.ENABLE_WHATSAPP = 'true';
  mkdirSync(qaDir, { recursive: true });
  const auth = path.join(qaDir, 'auth.ts'), headers = path.join(qaDir, 'headers.ts');
  writeFileSync(auth, `import {AsyncLocalStorage} from 'node:async_hooks';export const context=new AsyncLocalStorage<any>();export class AuthError extends Error{constructor(message:string,public status:number){super(message)}}export const getSession=async()=>context.getStore()?.session||null;`);
  writeFileSync(headers, `import {context} from './auth';export const cookies=async()=>({get:()=>context.getStore()?.token?{value:context.getStore().token}:undefined});`);
  await build({ absWorkingDir: root, bundle: true, platform: 'node', format: 'cjs', packages: 'external', outfile: path.join(qaDir, 'server.cjs'), tsconfig: path.join(root, 'tsconfig.json'),
    stdin: { contents: `import * as routes from './src/app/api/auto-reply/[[...path]]/route';export {routes};export {context} from ${JSON.stringify(auth)};`, resolveDir: root, loader: 'ts' },
    plugins: [{ name: 'fixtures', setup(b) { b.onResolve({ filter: /^@\/lib\/auth$/ }, () => ({ path: auth })); b.onResolve({ filter: /^next\/headers$/ }, () => ({ path: headers })); b.onResolve({ filter: /^server-only$/ }, () => ({ path: 'empty', namespace: 'fixture' })); b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export {}' })); } }] });
  await build({ absWorkingDir: root, bundle: true, outfile: path.join(qaDir, 'panel.js'), jsx: 'automatic', tsconfig: path.join(root, 'tsconfig.json'), loader: { '.module.css': 'local-css' }, define: { 'process.env.NODE_ENV': '"production"', 'process.env': '{}' },
    stdin: { contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {CommunicationHub} from './src/app/admin/communication/communication-hub';createRoot(document.getElementById('root')!).render(<CommunicationHub portalAdmin={true} initial={{panel:null,tab:null,app:null}}/>);`, resolveDir: root, loader: 'tsx' } });
  db = await MongoMemoryServer.create(); process.env.MONGODB_URI = db.getUri();
  await mongoose.connect(db.getUri(), { dbName: 'website-auto-reply-isolated' });
  await Promise.all([Inbox.init(), Rule.init()]);
  [admin, member] = await User.create([{ name: 'Admin', email: 'admin@example.test', roles: ['admin'] }, { name: 'Member', email: 'member@example.test', roles: ['member'] }]);
  const app = express(); app.use(express.json()); app.use(backend('cookie-parser')()); app.use('/api/auto-reply', backend('./routes/autoReply'));
  await new Promise(resolve => { backendServer = app.listen(0, '127.0.0.1', resolve); });
  process.env.PORTAL_API_URL = `http://127.0.0.1:${backendServer.address().port}`;
  qa = createRequire(import.meta.url)(path.join(qaDir, 'server.cjs'));
  websiteServer = http.createServer(async (req, res) => {
    try {
      if (['/panel.js', '/panel.css'].includes(req.url)) { res.setHeader('Content-Type', req.url.endsWith('.js') ? 'application/javascript' : 'text/css'); return res.end(readFileSync(path.join(qaDir, req.url.slice(1)))); }
      if (req.url.startsWith('/api/')) {
        if (!req.url.startsWith('/api/auto-reply/')) { res.statusCode = 503; res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify({ error: 'Other services unavailable in this fixture.' })); }
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
  assert.equal((await request('/api/auto-reply/status')).status, 200);
  assert.equal((await request('/api/auto-reply/status', 'GET', null)).status, 401);
  assert.equal((await request('/api/auto-reply/status', 'GET', member)).status, 403);
  assert.equal((await request('/api/auto-reply/status', 'GET', admin, 'editor')).status, 403);
  assert.equal((await request('/api/auto-reply/unknown')).status, 404);
  assert.equal((await request('/api/auto-reply/switches')).status, 404, 'POST only');
  assert.equal((await request('/api/auto-reply/status', 'POST', admin, 'admin', {})).status, 404);
});
test('browser: Communication → Final Message → time limit and replies', { timeout: 60000 }, async () => {
  const leadId = new mongoose.Types.ObjectId();
  await mongoose.connection.db.collection('leads').insertOne({ _id: leadId, name: 'Ravi', status: 'Negative' });
  await FinalMessage.create({ leadId, phone: '919876543210', status: 'replied', lastReplyAt: new Date(), lastReplyText: 'Voice message', replySeenAt: new Date() });
  assert.equal((await request('/api/auto-reply/final-message')).status, 200);
  assert.equal((await request('/api/auto-reply/final-message', 'GET', member)).status, 403);
  assert.equal((await request('/api/auto-reply/final-message/time')).status, 404, 'POST only');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 850 } });
    page.setDefaultTimeout(10000);
    await page.goto(websiteBase);
    await page.getByRole('button', { name: /^Final Message Time limit/ }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('heading', { name: 'Final Message', exact: true }).waitFor();
    const time = dialog.getByRole('spinbutton', { name: 'Time limit, in hours' });
    await dialog.getByText('Voice message', { exact: true }).waitFor();
    await dialog.getByRole('heading', { name: 'Needs decision (1)' }).waitFor();
    await dialog.getByRole('button', { name: 'Interested', exact: true }).waitFor();
    assert.equal(await time.inputValue(), '24');
    const save = dialog.getByRole('button', { name: 'Save time limit' });
    assert.ok(await save.isDisabled(), 'opening the box changes nothing');
    await time.fill('0');
    await save.click();
    await dialog.getByRole('alert').filter({ hasText: 'whole number of hours' }).waitFor();
    await time.fill('72');
    await save.click();
    await dialog.getByRole('status').filter({ hasText: 'New final messages say 72 hours' }).waitFor();
    assert.equal((await State.findById(STATE_ID).lean()).finalMessage.hours, 72);
    const words = dialog.getByRole('textbox', { name: "Messages that don't count as a reply" });
    assert.equal(await words.inputValue(), ['ok', 'thik a', 'thik hai', 'thik hai ji', 'kardo ji', 'krdo', 'karde', 'kardo'].join('\n'));
    await words.fill('ok\nokay');
    await dialog.getByRole('button', { name: 'Save list' }).click();
    await dialog.getByRole('status').filter({ hasText: 'List saved' }).waitFor();
    assert.deepEqual([...(await State.findById(STATE_ID).lean()).finalMessage.ignoredReplies], ['ok', 'okay']);
    await dialog.getByRole('button', { name: 'Mark Dead', exact: true }).click();
    await dialog.getByRole('status').filter({ hasText: 'Ravi: Moved to Dead.' }).waitFor();
    await dialog.getByRole('heading', { name: 'Needs decision (0)' }).waitFor();
    assert.equal((await mongoose.connection.db.collection('leads').findOne({ _id: leadId })).status, 'Dead');
    await page.setViewportSize({ width: 390, height: 844 });
    const overflow = await page.evaluate(() => { const panel = document.querySelector('[aria-label="Final Message"]'); return panel.scrollWidth - panel.clientWidth; });
    assert.ok(overflow <= 0, `no sideways scroll at phone width (${overflow}px)`);
    await page.screenshot({ path: path.join(qaDir, 'final-message-mobile.png') });
  } finally {
    await browser.close();
    await FinalMessage.deleteMany({});
    await State.deleteMany({});
  }
});
test('browser: Communication → Auto Reply → switch, ad message and recognised messages', { timeout: 90000 }, async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 850 } });
    page.setDefaultTimeout(10000);
    await page.goto(websiteBase);
    await page.getByRole('button', { name: /^Auto Reply Ad message/ }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('heading', { name: 'Auto Reply', exact: true }).waitFor();
    const recognise = dialog.getByRole('checkbox', { name: /^Recognise messages/ });
    await dialog.getByText('No messages recognised yet.').waitFor();
    assert.equal(await recognise.isChecked(), false);
    const sendReplies = dialog.getByRole('checkbox', { name: /^Send replies/ }), addLeads = dialog.getByRole('checkbox', { name: /^Add to leads/ });
    assert.ok(await sendReplies.isDisabled(), 'needs Recognise messages first');
    assert.ok(await addLeads.isDisabled(), 'needs Recognise messages first');
    assert.equal(await dialog.getByRole('textbox', { name: 'Ad message' }).inputValue(), 'Hello! Can I get more info on this?');
    const replyBox = dialog.getByRole('textbox', { name: 'Reply', exact: true });
    await replyBox.getByText('Thanks for reaching out.').waitFor();
    assert.match(await replyBox.textContent(), /ਧੰਨਵਾਦ/);
    assert.ok(await dialog.getByRole('button', { name: 'Save reply' }).isDisabled(), 'opening the box changes nothing');
    assert.equal(await dialog.getByRole('combobox', { name: 'Insert detail into Reply' }).count(), 0, 'a reply has no name field');

    await recognise.click();
    await dialog.getByRole('status').filter({ hasText: 'Recognise messages is On' }).waitFor();
    assert.equal((await State.findById(STATE_ID).lean()).autoReply.recognise, true);
    await dialog.getByText('WhatsApp is not connected').waitFor();
    await sendReplies.click();
    await dialog.getByRole('status').filter({ hasText: 'Send replies is On' }).waitFor();
    await addLeads.click();
    await dialog.getByRole('status').filter({ hasText: 'Add to leads is On' }).waitFor();
    assert.deepEqual({ ...(await State.findById(STATE_ID).lean()).autoReply }, { recognise: true, sendReplies: true, addLeads: true });

    await replyBox.click();
    await page.keyboard.press('Control+End');
    await page.keyboard.type(' Thank you');
    await page.waitForTimeout(5500); // a refresh of the page's data must not wipe what is being typed
    assert.match(await replyBox.textContent(), /Thank you/);
    await dialog.getByRole('button', { name: 'Save reply' }).click();
    await dialog.getByRole('status').filter({ hasText: 'Reply saved' }).waitFor();
    assert.match((await Rule.findOne().lean()).reply, /Thank you/);
    await dialog.getByRole('status').filter({ hasText: 'Reply saved' }).waitFor();
    assert.ok(await dialog.getByRole('button', { name: 'Save reply' }).isDisabled());

    const box = dialog.getByRole('textbox', { name: 'Ad message' });
    const save = dialog.getByRole('button', { name: 'Save ad message' });
    assert.ok(await save.isDisabled(), 'nothing to save yet');
    await box.fill('Hello');
    await save.click();
    await dialog.getByRole('alert').filter({ hasText: 'at least 20 letters' }).waitFor();
    assert.equal((await Rule.findOne().lean()).message, 'Hello! Can I get more info on this?');
    await box.fill('I saw your website design advert today');
    await save.click();
    await dialog.getByRole('status').filter({ hasText: 'Ad message saved' }).waitFor();
    assert.equal((await Rule.findOne().lean()).message, 'I saw your website design advert today');

    await Inbox.create([
      { messageId: 'a', phone: '919876543210', text: 'Hello! Can I get more info on this?', profileName: 'Ravi', deliveredAs: 'append', sentAt: new Date(), adMarker: { externalAdReply: true }, status: 'closed', outcome: 'lead-and-reply', replyStatus: 'sent', leadId: new mongoose.Types.ObjectId() },
      { messageId: 'b', phone: null, text: 'Hello! Can I get more info on this?', deliveredAs: 'notify', sentAt: new Date(), status: 'needs-attention' },
    ]);
    await dialog.getByRole('heading', { name: 'Recognised messages (2)' }).waitFor({ timeout: 8000 });
    await dialog.getByText('Number not found').waitFor();
    await dialog.getByText('Needs attention', { exact: true }).waitFor();
    await dialog.getByText('From an ad', { exact: true }).waitFor();
    await dialog.getByText('Arrived while the service was restarting').waitFor();
    await dialog.getByText('Ravi', { exact: true }).waitFor();
    await dialog.getByText('Added to leads', { exact: true }).waitFor();
    await dialog.getByText('Reply sent', { exact: true }).waitFor();
    await dialog.getByText('1 added to leads · 1 reply sent · 0 waiting').waitFor();
    await page.screenshot({ path: path.join(qaDir, 'auto-reply-desktop.png') });

    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await box.isVisible());
    const overflow = await page.evaluate(() => { const panel = document.querySelector('[aria-label="Auto Reply"]'); return panel.scrollWidth - panel.clientWidth; });
    assert.ok(overflow <= 0, `no sideways scroll at phone width (${overflow}px)`);
    await page.screenshot({ path: path.join(qaDir, 'auto-reply-mobile.png') });

    await recognise.click();
    await dialog.getByRole('status').filter({ hasText: 'Recognise messages is Off' }).waitFor();
    assert.equal((await State.findById(STATE_ID).lean()).autoReply.recognise, false);
    assert.ok(await sendReplies.isDisabled(), 'the other two show as inactive');
    assert.equal(await sendReplies.isChecked(), false);
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    assert.equal(await page.getByRole('dialog').count(), 0);
  } finally { await browser.close(); }
});
