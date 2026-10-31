import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const root = process.cwd();
const backend = createRequire(path.resolve(root, '../backend/package.json'));
const mongoose = backend('mongoose');
const { MongoMemoryServer } = backend('mongodb-memory-server');
const express = backend('express');
const jwt = backend('jsonwebtoken');
const userModel = backend('./models/userModel');
const { EmailDraft, EmailPolicy, EmailTemplate, EmailHistory } = backend('./models/emailControlModel');
const { requestMiddleware } = backend('./helpers/emailController');
const nativeFetch = global.fetch;
let database, backendServer, websiteServer, websiteBase, qa, temporary, admin, websiteAdmin, providerCalls;
let providerFails = false;
const qaDir = path.join(root, '.next', 'email-control-qa');
const session = (user, websiteRole = 'admin') => ({
  user: { _id: `website-${user._id}`, portalUserId: String(user._id), role: websiteRole, banned: false },
  portalRoles: user.roles, portalActiveRole: user.roles[0],
});
function context(user = admin, role = 'admin') {
  return { session: user ? session(user, role) : null, token: user ? jwt.sign({ _id: String(user._id), role: user.roles[0] }, process.env.TOKEN_SECRET_KEY) : undefined };
}
async function request(pathname, method = 'GET', body, user = admin, role = 'admin') {
  const url = new URL(pathname, 'http://website.test');
  const request = new Request(url, { method, headers: { 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const handler = qa.emailRoutes[method];
  const response = await qa.context.run(context(user, role), () => handler(request, { params: Promise.resolve({ path: url.pathname.split('/').slice(3) }) }));
  return { status: response.status, ...await response.json() };
}
async function subscribe(email) {
  const response = await qa.context.run(context(null), () => qa.subscriptionRoute.POST(new Request('http://website.test/api/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, categories: [], offers: true }) })));
  return { status: response.status, ...await response.json() };
}
// Communication shows each job as a closed box; open them all, as an admin would one by one.
async function openJobs(page) {
  await page.locator('summary').filter({ hasText: /\d+ mails? · / }).first().waitFor();
  await page.locator('details').evaluateAll(nodes => nodes.forEach(node => { node.open = true; }));
}
async function pending(email) {
  assert.equal((await subscribe(email)).result, 'review');
  return EmailDraft.findOne({ to: email, status: 'pending' }).lean();
}
before(async () => {
  process.env.TOKEN_SECRET_KEY = 'email-website-isolated-test-secret';
  process.env.RESEND_API_KEY = 'not-a-real-key'; process.env.FROM_EMAIL = 'sender@example.test';
  process.env.DATA_DRIVER = 'json';
  temporary = mkdtempSync(path.join(os.tmpdir(), 'email-control-website-'));
  mkdirSync(qaDir, { recursive: true });
  const auth = path.join(qaDir, 'auth-fixture.ts');
  writeFileSync(auth, `import {AsyncLocalStorage} from 'node:async_hooks'; export const context=new AsyncLocalStorage<any>(); export class AuthError extends Error {constructor(message:string,public status:number){super(message)}} export const getSession=async()=>context.getStore()?.session||null; export const getSessionUser=async()=>(await getSession())?.user||null; export const requireUser=async()=>{const u=await getSessionUser();if(!u)throw new AuthError('Sign in',401);return u}; export const requireRole=async()=>{const u=await requireUser();if(u.role!=='admin')throw new AuthError('Forbidden',403);return u}; export const atLeast=(role:string,min:string)=>['visitor','member','moderator','editor','admin'].indexOf(role)>=['visitor','member','moderator','editor','admin'].indexOf(min); export const canModerate=(u:any)=>u&&atLeast(u.role,'moderator'); export const canPublishOfficial=(u:any)=>u&&atLeast(u.role,'editor');`);
  const headers = path.join(qaDir, 'headers-fixture.ts');
  writeFileSync(headers, `import {context} from './auth-fixture'; export const cookies=async()=>({get:(name:string)=>{const token=context.getStore()?.token;return name==='token'&&token?{value:token}:undefined}});`);
  await build({
    absWorkingDir: root, bundle: true, platform: 'node', format: 'cjs', packages: 'external', outfile: path.join(qaDir, 'server.cjs'), tsconfig: path.join(root, 'tsconfig.json'),
    stdin: { contents: `import * as emailRoutes from './src/app/api/email-control/[[...path]]/route'; import * as subscriptionRoute from './src/app/api/subscribe/route'; export {emailRoutes,subscriptionRoute}; export * as contactRoutes from './src/app/api/admin-contact-settings/route'; export {context} from ${JSON.stringify(auth)}; export {subscriberRepo} from './src/lib/repo'; export {confirmSubscription,unsubscribe} from './src/lib/subscription-actions'; export {emailControlRequest} from './src/lib/email-control-server';`, resolveDir: root, loader: 'ts' },
    plugins: [{ name: 'request-context-fixtures', setup(b) { b.onResolve({ filter: /^@\/lib\/auth$/ }, () => ({ path: auth })); b.onResolve({ filter: /^next\/headers$/ }, () => ({ path: headers })); b.onResolve({ filter: /^server-only$/ }, () => ({ path: 'empty', namespace: 'fixture' })); b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export {}', loader: 'js' })); } }],
  });
  await build({ absWorkingDir: root, bundle: true, outfile: path.join(qaDir, 'panel.js'), jsx: 'automatic', tsconfig: path.join(root, 'tsconfig.json'), loader: { '.module.css': 'local-css' }, define: { 'process.env.NODE_ENV': '"production"', 'process.env': '{}' },
    stdin: { contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {EmailControlPanel} from './src/app/admin/email-control/email-control-panel';const q=new URLSearchParams(location.search);createRoot(document.getElementById('root')!).render(<EmailControlPanel initialApplication="website" canManagePortal={true} view={(q.get('view') as any)||undefined} showTabs={q.get('tabs')!=='off'} query={q.get('query')||undefined}/>);`, loader: 'tsx', resolveDir: root } });
  // Communication's hub, as the page renders it (no WhatsApp backend here: its boxes show Unavailable).
  await build({ absWorkingDir: root, bundle: true, outfile: path.join(qaDir, 'hub.js'), jsx: 'automatic', tsconfig: path.join(root, 'tsconfig.json'), loader: { '.module.css': 'local-css' }, define: { 'process.env.NODE_ENV': '"production"', 'process.env': '{}' },
    stdin: { contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {CommunicationHub} from './src/app/admin/communication/communication-hub';const q=new URLSearchParams(location.search);createRoot(document.getElementById('root')!).render(<CommunicationHub portalAdmin={true} initial={{panel:q.get('panel'),tab:q.get('tab'),app:q.get('app')}}/>);`, loader: 'tsx', resolveDir: root } });
  database = await MongoMemoryServer.create({ instance: { launchTimeout: Number(process.env.EMAIL_TEST_MONGO_TIMEOUT || 60000) } });
  await mongoose.connect(database.getUri(), { dbName: 'website-email-isolated' });
  [admin, websiteAdmin] = await userModel.create([{ name: 'Portal Admin', email: 'admin@example.test', roles: ['admin'] }, { name: 'Website Admin', email: 'website-admin@example.test', roles: ['member'] }]);
  const app = express(); app.use(express.json()); app.use(backend('cookie-parser')()); app.use(requestMiddleware); app.use('/api/email-control', backend('./routes/emailControl')); app.all('/api/admin/my-settings', backend('./middleware/authToken'), backend('./controller/admin/mySettings'));
  await new Promise(resolve => { backendServer = app.listen(0, '127.0.0.1', resolve); });
  process.env.PORTAL_API_URL = `http://127.0.0.1:${backendServer.address().port}`;
  process.chdir(temporary);
  qa = createRequire(import.meta.url)(path.join(qaDir, 'server.cjs'));
  providerCalls = [];
  global.fetch = async (url, options) => {
    if (String(url) !== 'https://api.resend.com/emails') return nativeFetch(url, options);
    providerCalls.push({ body: JSON.parse(options.body), key: options.headers['Idempotency-Key'] });
    return new Response(JSON.stringify(providerFails ? { message: 'unavailable' } : { id: 'provider-id' }), { status: providerFails ? 503 : 200 });
  };
  websiteServer = http.createServer(async (req, res) => {
    try {
      if (['/panel.js', '/panel.css', '/hub.js', '/hub.css'].includes(req.url)) { res.setHeader('Content-Type', req.url.endsWith('.js') ? 'application/javascript' : 'text/css'); return res.end(readFileSync(path.join(qaDir, req.url.slice(1)))); }
      // No WhatsApp backend in this suite: it answers as the proxy does when the portal is unreachable.
      if (req.url.startsWith('/api/whatsapp/')) { res.statusCode = 503; res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify({ error: 'WhatsApp unavailable in this test.' })); }
      if (req.url.startsWith('/admin/communication')) { res.setHeader('Content-Type', 'text/html'); return res.end('<!doctype html><html><head><link rel="stylesheet" href="/hub.css"></head><body><div id="root"></div><script src="/hub.js"></script></body></html>'); }
      if (req.url === '/api/time') { res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store'); return res.end(JSON.stringify({ now: Date.now() })); }
      if (req.url.startsWith('/api/email-control')) {
        const chunks = []; for await (const chunk of req) chunks.push(chunk);
        const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : undefined;
        const result = await request(req.url, req.method, body);
        res.statusCode = result.status; res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify(result));
      }
      res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><html><head><link rel="stylesheet" href="/panel.css"></head><body><div id="root"></div><script src="/panel.js"></script></body></html>');
    } catch (error) { res.statusCode = 500; res.end(error.message); }
  });
  await new Promise(resolve => websiteServer.listen(0, '127.0.0.1', resolve));
  websiteBase = `http://127.0.0.1:${websiteServer.address().port}`;
});
after(async () => {
  global.fetch = nativeFetch;
  if (websiteServer) await new Promise(resolve => websiteServer.close(resolve));
  if (backendServer) await new Promise(resolve => backendServer.close(resolve));
  await mongoose.disconnect(); await database?.stop(); process.chdir(root);
  if (temporary && path.resolve(temporary).startsWith(path.join(os.tmpdir(), 'email-control-website-'))) rmSync(temporary, { recursive: true, force: true });
});

test('website admin sees only website settings; portal tab needs a portal role', async () => {
  const website = await request('/api/email-control?application=website', 'GET', undefined, websiteAdmin);
  assert.equal(website.status, 200); assert.ok(website.data.events.every(event => event.application === 'website'));
  assert.equal((await request('/api/email-control?application=portal', 'GET', undefined, websiteAdmin)).status, 403);
  assert.equal((await request('/api/email-control?application=website', 'GET', undefined, websiteAdmin, 'member')).status, 403);
  assert.equal((await request('/api/email-control?application=website', 'GET', undefined, null)).status, 401);
});
test('central scope rejects forged action and template edits across tabs', async () => {
  const denied = await request('/api/email-control/policies/invoice.project?application=website', 'PUT', { mode: 'off' }, websiteAdmin);
  assert.equal(denied.status, 400);
  const template = await EmailTemplate.create({ event: 'invoice.project', name: 'Portal only', subject: 'Invoice', text: 'Portal invoice' });
  assert.equal((await request(`/api/email-control/templates/${template._id}?application=website`, 'PUT', { name: 'Forged', subject: 'X', text: 'X' }, websiteAdmin)).status, 400);
});
test('ordinary login tokens and public intake assertions cannot manage settings', async () => {
  const token = context(admin).token;
  const forged = await nativeFetch(`${process.env.PORTAL_API_URL}/api/email-control/?application=website`, { headers: { 'x-website-email-assertion': token } });
  assert.equal(forged.status, 401);
  await assert.rejects(qa.emailControlRequest('/?application=website', 'GET', undefined, { access: 'intake' }), /Submission access/);
  await assert.rejects(qa.emailControlRequest('/?application=portal', 'GET', undefined, { access: 'admin', actorId: String(websiteAdmin._id) }), /cannot manage portal/);
});
test('public subscription saves pending and queues exactly one review without sending', async () => {
  const first = await subscribe('public@example.test'); assert.equal(first.result, 'review');
  const subscriber = await qa.subscriberRepo.findByEmail('public@example.test');
  assert.equal(subscriber.emailStatus, 'pending'); assert.equal(subscriber.confirmSentAt, undefined);
  const draft = await EmailDraft.findOne({ to: 'public@example.test' }).lean();
  assert.equal(draft.application, 'website'); assert.equal(draft.actor, null); assert.equal(draft.status, 'pending');
  assert.match(draft.requiredLinks[0], /subscribe\/confirm\?token=/);
  await subscribe('public@example.test'); assert.equal(await EmailDraft.countDocuments({ to: 'public@example.test' }), 1);
  assert.equal(providerCalls.length, 0);
});
test('website admin can review public drafts; Off prevents queueing', async () => {
  const data = await request('/api/email-control?application=website', 'GET', undefined, websiteAdmin);
  assert.ok(data.data.drafts.some(draft => draft.to.includes('public@example.test')));
  await request('/api/email-control/policies/website.subscription.confirm?application=website', 'PUT', { mode: 'off' }, websiteAdmin);
  const blocked = await subscribe('paused@example.test'); assert.equal(blocked.status, 400); assert.match(blocked.error, /paused/);
  assert.equal(await EmailDraft.countDocuments({ to: 'paused@example.test' }), 0);
  await request('/api/email-control/policies/website.subscription.confirm?application=website', 'PUT', { mode: 'review' }, websiteAdmin);
});
test('default and selected templates preserve the protected confirmation link', async () => {
  const template = (await request('/api/email-control/templates?application=website', 'POST', { event: 'website.subscription.confirm', name: 'Friendly', subject: 'Friendly subject', text: 'Hello, please confirm.' }, websiteAdmin)).data;
  await request('/api/email-control/policies/website.subscription.confirm?application=website', 'PUT', { mode: 'review', defaultTemplate: template._id }, websiteAdmin);
  const draft = await pending('template@example.test'); assert.equal(draft.subject, 'Friendly subject'); assert.ok(draft.text.includes(draft.requiredLinks[0]));
  const preview = await request(`/api/email-control/drafts/${draft._id}/preview?application=website`, 'POST', { templateId: template._id }, websiteAdmin);
  assert.ok(preview.data.text.includes(draft.requiredLinks[0]));
  // The Standard template fills the reader's topics and the link from the website's request.
  const standard = await request(`/api/email-control/drafts/${draft._id}/preview?application=website`, 'POST', { templateId: '' }, websiteAdmin);
  assert.equal(standard.data.subject, 'Confirm your Mera Software updates'); assert.match(standard.data.text, /\*\*Topics:\*\* \S/);
  assert.ok(standard.data.text.includes(`**Yes, send me updates:** ${draft.requiredLinks[0]}`));
});
test('Send delivers reviewed text, stamps delivery and still requires opt-in confirmation', async () => {
  const draft = await pending('approved@example.test');
  const result = await request(`/api/email-control/drafts/${draft._id}/decision?application=website`, 'POST', { choice: 'send', subject: 'Approved subject', text: 'Edited without the link' }, websiteAdmin);
  assert.equal(result.data.status, 'sent'); assert.ok(providerCalls.at(-1).body.text.includes(draft.requiredLinks[0]));
  let subscriber = await qa.subscriberRepo.findByEmail('approved@example.test'); assert.ok(subscriber.confirmSentAt); assert.equal(subscriber.emailStatus, 'pending');
  assert.equal(subscriber.confirmSentAt, result.data.sentAt);
  subscriber = await qa.confirmSubscription(subscriber.token); assert.equal(subscriber.emailStatus, 'active');
  assert.equal((await EmailHistory.findOne({ draftId: draft._id })).status, 'sent');
});
test('Skip does not send or activate a subscriber, and history survives draft deletion', async () => {
  const draft = await pending('skip@example.test'); const count = providerCalls.length;
  assert.equal((await request(`/api/email-control/drafts/${draft._id}/decision?application=website`, 'POST', { choice: 'skip' }, websiteAdmin)).data.status, 'skipped');
  assert.equal(providerCalls.length, count); assert.equal((await qa.subscriberRepo.findByEmail('skip@example.test')).emailStatus, 'pending');
  await EmailDraft.deleteOne({ _id: draft._id }); assert.equal((await EmailHistory.findOne({ draftId: draft._id })).status, 'skipped');
});
test('changed or unsubscribed requests cannot send stale confirmation emails', async () => {
  const draft = await pending('stale@example.test'); const count = providerCalls.length;
  const subscriber = await qa.subscriberRepo.findByEmail('stale@example.test'); await qa.unsubscribe(subscriber);
  const result = await request(`/api/email-control/drafts/${draft._id}/decision?application=website`, 'POST', { choice: 'send', subject: 'X', text: 'X' }, websiteAdmin);
  assert.equal(result.status, 409); assert.equal(providerCalls.length, count);
  assert.equal((await qa.confirmSubscription(subscriber.token)).emailStatus, 'unsubscribed');
});
test('failed delivery retries keep original content and never repeat subscription creation', async () => {
  const draft = await pending('retry@example.test'); providerFails = true;
  const first = await request(`/api/email-control/drafts/${draft._id}/decision?application=website`, 'POST', { choice: 'send', subject: 'Original approval', text: 'Original text' }, websiteAdmin);
  assert.equal(first.status, 400); providerFails = false;
  await request(`/api/email-control/drafts/${draft._id}/decision?application=website`, 'POST', { choice: 'send', subject: 'Changed', text: 'Changed' }, websiteAdmin);
  assert.equal(providerCalls.at(-1).key, providerCalls.at(-2).key); assert.deepEqual(providerCalls.at(-1).body, providerCalls.at(-2).body);
  assert.equal((await EmailDraft.findById(draft._id)).status, 'sent');
});
test('manage-link request never changes an already-active subscriber', async () => {
  const before = await qa.subscriberRepo.findByEmail('approved@example.test');
  await qa.subscriberRepo.update(before._id, { confirmSentAt: undefined });
  assert.equal((await subscribe('approved@example.test')).result, 'review');
  const after = await qa.subscriberRepo.findByEmail('approved@example.test'); assert.equal(after.emailStatus, 'active');
  assert.ok(await EmailDraft.findOne({ event: 'website.subscription.manage', to: 'approved@example.test' }));
});
test('browser: tabs, sample preview, default selection, editable review, Send and Skip', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ timezoneId: 'America/New_York' });
    await page.addInitScript(() => { const original = Date.now; Date.now = () => original() + 2 * 86400000; });
    const errors = []; page.on('pageerror', error => { errors.push(error.message); console.error('Email panel browser error:', error.message); });
    await page.goto(websiteBase); await page.getByRole('heading', { name: 'Website email rules' }).waitFor(); await openJobs(page);
    const row = page.getByRole('row').filter({ hasText: 'Subscription confirmation' });
    await row.getByRole('button', { name: 'Add template' }).click();
    await page.getByLabel('Template name', { exact: true }).fill('Browser template');
    await page.getByLabel('Subject', { exact: true }).fill('Browser approval');
    await page.getByLabel('Message', { exact: true }).fill('Browser message');
    await page.getByRole('button', { name: 'Preview sample' }).click();
    await page.getByRole('region', { name: 'Sample email' }).getByText('Browser approval', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Save template', exact: true }).click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    const template = await EmailTemplate.findOne({ name: 'Browser template' }).lean();
    await row.getByLabel('Subscription confirmation default template').selectOption(String(template._id));
    await page.getByText('Email rule saved.', { exact: true }).waitFor();
    const draft = await pending('browser@example.test');
    await page.getByRole('button', { name: 'Refresh', exact: true }).click();
    const card = page.locator('article').filter({ hasText: 'browser@example.test' }).filter({ has: page.getByRole('button', { name: 'Review email', exact: true }) });
    await card.getByRole('button', { name: 'Review email', exact: true }).click();
    await page.getByLabel('Template', { exact: true }).selectOption(String(template._id));
    await page.getByLabel('Message', { exact: true }).fill('Browser one-off edit');
    await page.getByRole('button', { name: 'Send Mail', exact: true }).click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' }); await page.getByText('Email sent.', { exact: true }).waitFor();
    assert.ok(providerCalls.at(-1).body.text.includes('Browser one-off edit')); assert.ok(providerCalls.at(-1).body.text.includes(draft.requiredLinks[0]));
    const outbox = page.getByRole('region', { name: 'Outbox', exact: true });
    await outbox.getByRole('row').filter({ hasText: 'browser@example.test' }).waitFor();
    const sentRecord = await EmailHistory.findOne({ draftId: draft._id }).lean();
    const expectedTime = `${new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }).format(sentRecord.sentAt)} IST`;
    assert.ok((await outbox.getByRole('row').filter({ hasText: 'browser@example.test' }).innerText()).includes(expectedTime));
    await outbox.getByLabel('Search recipient or subject').fill('browser@example.test');
    await outbox.getByRole('button', { name: 'Apply filters' }).click();
    await outbox.getByText('1 matching mail', { exact: true }).waitFor();
    await outbox.getByText('Mail details', { exact: true }).click();
    await outbox.getByText('Template: Browser template', { exact: true }).waitFor();
    await outbox.getByRole('button', { name: 'Clear filters' }).click();
    const retry = await pending('browser-retry@example.test'); await page.getByRole('button', { name: 'Refresh', exact: true }).click();
    await page.locator('article').filter({ hasText: 'browser-retry@example.test' }).filter({ has: page.getByRole('button', { name: 'Review email', exact: true }) }).getByRole('button', { name: 'Review email', exact: true }).click();
    await page.getByLabel('Subject', { exact: true }).fill('Browser retry approval');
    await page.getByLabel('Message', { exact: true }).fill('Reviewed retry text');
    providerFails = true; await page.getByRole('button', { name: 'Send Mail', exact: true }).click();
    await page.getByRole('dialog').getByText('A retry uses the originally reviewed content and the same delivery key to prevent duplicates.', { exact: true }).waitFor();
    assert.equal(await page.getByLabel('Message', { exact: true }).getAttribute('contenteditable'), 'false');
    providerFails = false; await page.getByRole('button', { name: 'Send Mail', exact: true }).click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    assert.equal((await EmailDraft.findById(retry._id)).status, 'sent');
    assert.deepEqual(providerCalls.at(-1), providerCalls.at(-2));
    const skip = await pending('browser-skip@example.test'); await page.getByRole('button', { name: 'Refresh', exact: true }).click();
    await page.locator('article').filter({ hasText: 'browser-skip@example.test' }).filter({ has: page.getByRole('button', { name: 'Review email', exact: true }) }).getByRole('button', { name: 'Review email', exact: true }).click();
    await page.getByRole('button', { name: 'Don’t Send Mail', exact: true }).click(); await page.getByRole('dialog').waitFor({ state: 'hidden' });
    assert.equal((await EmailDraft.findById(skip._id)).status, 'skipped');
    await page.getByRole('tab', { name: 'Portal', exact: true }).click(); await page.getByRole('heading', { name: 'Portal email rules' }).waitFor(); await openJobs(page);
    await page.getByRole('row').filter({ hasText: 'New lead welcome' }).waitFor(); assert.equal(await page.getByRole('row').filter({ hasText: 'Subscription confirmation' }).count(), 0);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('browser: built-in template edit, variable insert, preview, reset and section-aware review', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', dialog => dialog.accept());
    await page.goto(websiteBase); await page.getByRole('heading', { name: 'Website email rules' }).waitFor(); await openJobs(page);
    await page.getByRole('tab', { name: 'Portal', exact: true }).click(); await page.getByRole('heading', { name: 'Portal email rules' }).waitFor(); await openJobs(page);
    const row = page.getByRole('row').filter({ hasText: 'Project created' });
    const system = await EmailTemplate.findOne({ event: 'sendProjectCreatedEmail', system: true }).lean();
    assert.equal(await row.getByLabel('Project created default template').inputValue(), String(system._id));
    await row.getByRole('button', { name: 'Edit Standard (built-in)', exact: true }).click();
    const message = page.getByLabel('Message', { exact: true });
    await message.waitFor();
    // Details show as named chips; no markup or {{ }} is visible to the user.
    assert.equal(await message.locator('[data-email-variable="name"]').first().innerText(), 'Customer name');
    assert.doesNotMatch(await message.innerText(), /\{\{|\*\*|## /);
    assert.equal(await message.locator('strong').first().innerText(), 'Project:');
    await message.fill('Hello ');
    await page.getByLabel('Insert detail into Message').selectOption({ label: 'Customer name' });
    assert.match(await message.innerText(), /^Hello Customer name\s*$/);
    await page.getByRole('button', { name: 'Preview sample' }).click();
    await page.getByRole('region', { name: 'Sample email' }).getByText('Your Project Has Started', { exact: true }).waitFor();
    assert.match(await page.locator('iframe[title="Email preview"]').getAttribute('srcdoc'), /Hello Ravi Kumar/);
    await page.getByRole('button', { name: 'Save template', exact: true }).click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    assert.equal((await EmailTemplate.findById(system._id).lean()).text, 'Hello {{name}}');
    await row.getByRole('button', { name: 'Edit Standard (built-in)', exact: true }).click();
    await page.getByRole('button', { name: 'Reset to original', exact: true }).click();
    await page.getByText('Built-in template restored to its original wording.', { exact: true }).waitFor();
    assert.match(await message.innerText(), /^Hello Customer name,/);
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();

    const refund = { html: '<h2>Refund Details</h2><table><tr><td>UPI</td></tr></table>', text: 'Refund Details\nUPI' };
    const draft = await EmailDraft.create({
      event: 'sendProjectCancellationEmail', actor: admin._id, application: 'portal', status: 'pending', to: ['client@example.test'],
      subject: 'Project Cancelled', text: 'Hello Ravi,\n\n{{refundTable}}', plain: 'Hello Ravi,\n\nRefund Details\nUPI', html: '<p>prepared</p>',
      values: { name: 'Ravi', project: 'Shop', cancelledOn: 'Today', reason: '' }, blocks: { refundTable: refund }, templateName: 'Standard',
      expiresAt: new Date(Date.now() + 3600000),
    });
    await page.getByRole('button', { name: 'Refresh', exact: true }).click();
    await page.locator('article').filter({ hasText: 'client@example.test' }).getByRole('button', { name: 'Review email', exact: true }).click();
    await page.getByRole('heading', { name: 'Review message' }).waitFor();
    const options = await page.getByLabel('Template', { exact: true }).locator('option').allTextContents();
    assert.deepEqual(options, ['Current draft', 'Standard (built-in)']);
    assert.match(await page.locator('iframe[title="Email preview"]').getAttribute('srcdoc'), /prepared/);
    assert.equal(await message.locator('[data-email-section="refundTable"]').count(), 1);
    // Rewrite the greeting with detail chips; the refund section chip stays.
    await message.locator('p').first().click();
    await page.keyboard.press('Home'); await page.keyboard.press('Shift+End'); await page.keyboard.type('Dear ');
    await page.getByLabel('Insert detail into Message').selectOption({ label: 'Customer name' });
    await page.keyboard.type(', sorry for ');
    await page.getByLabel('Insert detail into Message').selectOption({ label: 'Project name' });
    await page.keyboard.type('.');
    await page.getByRole('button', { name: 'Update preview', exact: true }).click();
    await page.waitForFunction(() => /Dear Ravi, sorry for Shop\./.test(document.querySelector('iframe[title="Email preview"]')?.getAttribute('srcdoc') || ''));
    assert.match(await page.locator('iframe[title="Email preview"]').getAttribute('srcdoc'), /Refund Details/);
    await page.getByRole('button', { name: 'Send Mail', exact: true }).click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    const sent = providerCalls.at(-1).body;
    assert.match(sent.html, /Dear Ravi, sorry for Shop\./); assert.match(sent.html, /Refund Details/);
    assert.equal(sent.text, 'Dear Ravi, sorry for Shop.\n\nRefund Details\nUPI');
    assert.equal((await EmailDraft.findById(draft._id)).status, 'sent');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('browser: every action offers its Standard template, and the details guide inserts and explains details', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(websiteBase); await page.getByRole('heading', { name: 'Website email rules' }).waitFor(); await openJobs(page);
    for (const tab of ['Website', 'Portal']) {
      await page.getByRole('tab', { name: tab, exact: true }).click(); await page.getByRole('heading', { name: `${tab} email rules` }).waitFor(); await openJobs(page);
      // Only the job boxes' rows (the Outbox below has its own table).
      const rows = page.locator('details').filter({ has: page.locator('summary').filter({ hasText: /\d+ mails? · / }) }).locator('tbody tr');
      assert.ok(await rows.count() > 0, `${tab} has actions`);
      for (let index = 0; index < await rows.count(); index += 1) {
        const label = await rows.nth(index).locator('strong').innerText();
        assert.equal(await rows.nth(index).getByRole('button', { name: 'Edit Standard (built-in)', exact: true }).count(), 1, label);
        assert.equal(await rows.nth(index).getByRole('option', { name: 'Built-in action template' }).count(), 0, label);
      }
    }
    const row = page.getByRole('row').filter({ hasText: 'Client account created' });
    await row.getByRole('button', { name: 'Edit Standard (built-in)', exact: true }).click();
    const message = page.getByLabel('Message', { exact: true });
    await message.waitFor();
    assert.match(await message.innerText(), /You have been added as a client/);
    const guide = page.getByRole('region', { name: 'Available details for Message' });
    const nameDetail = guide.getByRole('listitem').filter({ hasText: 'Customer name' });
    await nameDetail.getByText('e.g. Ravi Kumar', { exact: true }).waitFor();
    await nameDetail.getByText(/Filled with the customer’s name/).waitFor();
    await message.fill('Dear ');
    await nameDetail.getByRole('button', { name: 'Customer name', exact: true }).click();
    assert.match(await message.innerText(), /^Dear Customer name\s*$/);
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();

    // A review shows each detail's value in this very email.
    await EmailDraft.create({
      event: 'sendClientAccountCreatedEmail', actor: admin._id, application: 'portal', status: 'pending', to: ['neha@example.test'],
      subject: 'Welcome', text: 'Hello Neha,', plain: 'Hello Neha,', html: '<p>prepared</p>',
      values: { name: 'Neha', email: 'neha@example.test', loginLink: '' }, templateName: 'Standard', expiresAt: new Date(Date.now() + 3600000),
    });
    await page.getByRole('button', { name: 'Refresh', exact: true }).click();
    await page.locator('article').filter({ hasText: 'neha@example.test' }).getByRole('button', { name: 'Review email', exact: true }).click();
    await page.locator('summary').filter({ hasText: /^Available details$/ }).click();
    const reviewGuide = page.getByRole('region', { name: 'Available details for Message' });
    await reviewGuide.getByRole('listitem').filter({ hasText: 'Customer name' }).getByText('In this email: Neha', { exact: true }).waitFor();
    await reviewGuide.getByRole('listitem').filter({ hasText: 'Login link' }).getByText('Empty in this email', { exact: true }).waitFor();
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('browser: panel still renders when the backend predates the template catalog', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    // A backend deployed after the website answers without `catalog` until it updates.
    await page.route(/\/api\/email-control\?application=/, async route => {
      const response = await route.fetch(); const body = await response.json();
      delete body.data.catalog; body.data.templates = body.data.templates.filter(row => !row.system);
      body.data.events.forEach(event => { delete event.group; }); // older backend: each action is its own box
      await route.fulfill({ response, json: body });
    });
    await page.goto(websiteBase); await page.getByRole('heading', { name: 'Website email rules' }).waitFor(); await openJobs(page);
    await page.getByRole('tab', { name: 'Portal', exact: true }).click(); await page.getByRole('heading', { name: 'Portal email rules' }).waitFor(); await openJobs(page);
    const row = page.getByRole('row').filter({ hasText: 'Project created' });
    await row.getByLabel('Project created default template').locator('option').first().waitFor({ state: 'attached' });
    assert.deepEqual(await row.getByLabel('Project created default template').locator('option').allTextContents(), ['Built-in action template']);
    await row.getByRole('button', { name: 'Add template', exact: true }).click();
    await page.getByRole('heading', { name: 'New email template' }).waitFor();
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('browser: Communication shows rules and history on separate pages, and the sample shows the WhatsApp message', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${websiteBase}/?view=actions&tabs=off`); await page.getByRole('heading', { name: 'Website email rules' }).waitFor(); await openJobs(page);
    assert.equal(await page.getByRole('tab').count(), 0, 'the left menu picks Website or Portal, not tabs');
    assert.equal(await page.getByRole('heading', { name: 'Pending email review' }).count(), 0);
    assert.equal(await page.getByRole('region', { name: 'Outbox', exact: true }).count(), 0);
    const row = page.getByRole('row').filter({ hasText: 'Subscription confirmation' });
    await row.getByRole('button', { name: 'Add template' }).click();
    await page.getByLabel('Subject', { exact: true }).fill('Shared subject');
    await page.getByLabel('Message', { exact: true }).fill('Shared message');
    await page.getByRole('button', { name: 'Preview sample' }).click();
    const whatsapp = page.getByRole('region', { name: 'Sample WhatsApp message' });
    await whatsapp.waitFor();
    assert.equal(await whatsapp.locator('p strong').textContent(), 'Shared subject');
    assert.match(await whatsapp.textContent(), /Shared message/);
    assert.doesNotMatch(await whatsapp.textContent(), /\*/);

    await page.goto(`${websiteBase}/?view=activity&tabs=off`); await page.getByRole('heading', { name: 'Website email review and history' }).waitFor();
    await page.getByRole('heading', { name: 'Pending email review' }).waitFor();
    await page.getByRole('region', { name: 'Outbox', exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Add template' }).count(), 0);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('browser: one box per job holds its customer and admin mails; customer mail is On/Off, Off by default', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(websiteBase); await page.getByRole('heading', { name: 'Website email rules' }).waitFor(); await openJobs(page);
    // Website: the customer copy and the admin copy of the contact form share one box.
    const contact = page.locator('details').filter({ has: page.locator('summary').filter({ hasText: /^Contact form/ }) });
    assert.deepEqual(await contact.locator('tbody strong').allTextContents(), ['Contact form received', 'Contact request (admin)']);
    await page.getByRole('tab', { name: 'Portal', exact: true }).click(); await page.getByRole('heading', { name: 'Portal email rules' }).waitFor();
    const job = page.locator('details').filter({ has: page.locator('summary').filter({ hasText: /^Update request/ }) });
    const summary = job.locator('summary');
    await summary.waitFor();
    assert.equal(await job.evaluate(node => node.open), false, 'boxes start closed');
    assert.match(await summary.innerText(), /2 mails · Off/); assert.match(await summary.innerText(), /Nothing sent/);
    await summary.click();
    assert.deepEqual(await job.locator('tbody strong').allTextContents(), ['New update request (admin)', 'Update request received']);
    const row = job.getByRole('row').filter({ hasText: 'Update request received' });
    await row.getByText('Automatic', { exact: true }).waitFor();
    const mail = row.getByLabel('Update request received mail');
    assert.equal(await mail.inputValue(), 'off');
    assert.deepEqual(await mail.locator('option').allTextContents(), ['On — send automatically', 'Off']);
    await openJobs(page);
    assert.deepEqual(await page.getByLabel('Project created sending rule').locator('option').allTextContents(), ['Ask before sending', 'Off']);
    await mail.selectOption('auto');
    await page.getByText('Email rule saved.', { exact: true }).waitFor();
    assert.equal((await EmailPolicy.findOne({ event: 'sendUserConfirmation' }).lean()).mode, 'auto');
    assert.equal(await mail.inputValue(), 'auto');
    assert.match(await summary.innerText(), /2 mails · Mixed rules/); assert.match(await summary.innerText(), /Email \+ WhatsApp/);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('browser: Email Review tabs show review, Outbox and history one at a time, drawn before the data', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    // Hold the panel's data back: the headings are already drawn, with a loader where the data goes.
    let release; const held = new Promise(resolve => { release = resolve; });
    await page.route(/\/api\/email-control\?application=/, async route => { await held; await route.continue(); });
    await page.goto(`${websiteBase}/?view=review&tabs=off`);
    await page.getByRole('heading', { name: 'Pending email review' }).waitFor();
    await page.getByRole('status', { name: 'Loading mails to review…' }).waitFor();
    release();
    await page.getByText(/No emails awaiting review\.|Review email/).first().waitFor();
    assert.equal(await page.getByRole('region', { name: 'Outbox', exact: true }).count(), 0);
    assert.equal(await page.getByRole('heading', { name: 'Email history' }).count(), 0);
    await page.goto(`${websiteBase}/?view=outbox&tabs=off`); await page.getByRole('region', { name: 'Outbox', exact: true }).waitFor();
    assert.equal(await page.getByRole('heading', { name: 'Pending email review' }).count(), 0);
    await page.goto(`${websiteBase}/?view=history&tabs=off`); await page.getByRole('heading', { name: 'Email history' }).waitFor();
    assert.equal(await page.getByRole('region', { name: 'Outbox', exact: true }).count(), 0);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('browser: Communication boxes open their panel at once, follow the URL, and close with Esc and Back', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${websiteBase}/admin/communication`);
    for (const name of ['WhatsApp Connection', 'WhatsApp Queue', 'Email Templates', 'Email Review']) await page.getByRole('button', { name: new RegExp(`^${name}`) }).waitFor();
    // Email counts come from /summary alone (the full lists are not loaded for the boxes).
    const listings = []; page.on('request', request => { if (/\/api\/email-control\?application=/.test(request.url())) listings.push(request.url()); });
    await page.getByRole('button', { name: /^Email Review/ }).getByText(/\d+ waiting/).waitFor();
    await page.getByRole('button', { name: /^Email Templates/ }).getByText(/\d+ messages/).waitFor();
    assert.deepEqual(listings, []);

    await page.getByRole('button', { name: /^Email Templates/ }).click();
    const panel = page.getByRole('dialog', { name: 'Email Templates' });
    await panel.getByRole('tab', { name: 'Website' }).waitFor();
    assert.equal(new URL(page.url()).search, '?panel=email-templates');
    await panel.getByRole('heading', { name: 'Website email rules' }).waitFor();
    await panel.getByRole('tab', { name: 'Portal' }).click();
    assert.equal(new URL(page.url()).search, '?panel=email-templates&tab=portal');
    await panel.getByRole('heading', { name: 'Portal email rules' }).waitFor();
    await panel.getByLabel('Find a message').fill('Project created');
    await panel.getByRole('row').filter({ hasText: 'Project created' }).waitFor();

    await page.keyboard.press('Escape');
    await panel.waitFor({ state: 'hidden' });
    assert.equal(new URL(page.url()).search, '');
    await page.goBack();
    await panel.waitFor();
    assert.equal(await panel.getByRole('tab', { name: 'Portal' }).getAttribute('aria-selected'), 'true');

    await page.goto(`${websiteBase}/admin/communication?panel=email-review&tab=outbox`);
    const review = page.getByRole('dialog', { name: 'Email Review' });
    await review.getByRole('region', { name: 'Outbox', exact: true }).waitFor();
    await review.getByRole('tab', { name: 'History' }).click();
    await review.getByRole('heading', { name: 'Email history' }).waitFor();
    await review.getByRole('button', { name: 'Close' }).click();
    await review.waitFor({ state: 'hidden' });
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('browser: Communication shows what needs attention and the recent emails, each opening its panel', async () => {
  const draft = await pending('activity@example.test');
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${websiteBase}/admin/communication`);
    const attention = page.getByRole('region', { name: 'Needs attention' });
    const line = attention.getByRole('listitem').filter({ hasText: /website emails? waiting for review/ });
    await line.waitFor();
    const activity = page.getByRole('region', { name: 'Recent activity' });
    const row = activity.getByRole('button').filter({ hasText: '→ activity@example.test' });
    await row.waitFor();
    assert.match(await row.innerText(), /Waiting for review/);
    assert.match(await row.innerText(), new RegExp(draft.subject.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

    await row.click();
    const review = page.getByRole('dialog', { name: 'Email Review' });
    await review.getByRole('tab', { name: 'Review', selected: true }).waitFor();
    await review.locator('article').filter({ hasText: 'activity@example.test' }).waitFor();
    await review.getByRole('button', { name: 'Close' }).click();

    await line.getByRole('button', { name: 'Review →' }).click();
    await review.getByRole('tab', { name: 'Review', selected: true }).waitFor();
    await page.keyboard.press('Escape');
    await activity.getByRole('button', { name: 'Email history →' }).click();
    await review.getByRole('tab', { name: 'History', selected: true }).waitFor();
    await review.getByRole('heading', { name: 'Email history' }).waitFor();
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('browser: compact review creates a new template, keeps name chips and sends WhatsApp-only', async () => {
  const { Queue } = backend('./whatsapp/src/models.js');
  const { composeTemplate } = backend('./helpers/emailTemplates');
  await Queue.init();
  const oldEnabled = process.env.ENABLE_WHATSAPP;
  process.env.ENABLE_WHATSAPP = 'true';
  const recipient = await userModel.create({ name: 'Compact Customer', email: 'compact-review@example.test', phone: '9876543291', roles: ['customer'] });
  const template = await EmailTemplate.create({ event: 'lead.proposal', name: 'Compact custom', subject: 'Proposal for {{name}}', text: 'Hello {{name}}, please check your proposal.' });
  const values = { name: recipient.name, amount: '₹500', link: 'https://example.test/proposal' };
  const composed = composeTemplate(template, values, {});
  const row = await EmailDraft.create({ event: template.event, actor: admin._id, application: 'portal', status: 'pending', to: [recipient.email], ...composed, values, sourceTemplateId: template._id, expiresAt: new Date(Date.now() + 3600000) });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage(); page.setDefaultTimeout(10000);
    await page.goto(websiteBase);
    await page.getByRole('tab', { name: 'Portal', exact: true }).click();
    await page.getByRole('heading', { name: 'Portal email rules' }).waitFor();
    await page.locator('article').filter({ hasText: recipient.email }).getByRole('button', { name: 'Review email', exact: true }).click();
    await page.getByRole('heading', { name: 'Review message', exact: true }).waitFor();
    assert.equal(await page.getByLabel('Template', { exact: true }).inputValue(), String(template._id));
    assert.equal(await page.getByLabel('Send via').inputValue(), 'both');
    const editor = page.getByLabel('Message', { exact: true });
    assert.equal(await editor.locator('[data-email-variable="name"]').innerText(), 'Lead name');
    assert.doesNotMatch(await editor.innerText(), /Compact Customer|\{\{/);
    await editor.fill('Please check, ');
    await page.getByLabel('Insert detail into Message').selectOption({ label: 'Lead name' });
    const beforeCount = await EmailTemplate.countDocuments();
    await page.getByRole('button', { name: 'Save template', exact: true }).click();
    await page.getByText('New template saved. Original unchanged.', { exact: true }).waitFor();
    assert.equal(await EmailTemplate.countDocuments(), beforeCount + 1);
    assert.equal((await EmailTemplate.findById(template._id)).text, template.text);
    const savedId = await page.getByLabel('Template', { exact: true }).inputValue();
    assert.notEqual(savedId, String(template._id));
    assert.match((await EmailTemplate.findById(savedId)).text, /Please check, \{\{name\}\}/);
    assert.ok(await page.getByRole('dialog').isVisible(), 'saving does not dismiss or repeat the business action');
    await page.getByRole('button', { name: 'Update preview', exact: true }).click();
    await page.waitForFunction(() => /Please check, Compact Customer/.test(document.querySelector('iframe[title="Email preview"]')?.getAttribute('srcdoc') || ''));
    await page.getByLabel('Send via').selectOption('whatsapp');
    const emailsBefore = providerCalls.length;
    await page.getByRole('button', { name: 'Send WhatsApp', exact: true }).click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    await page.getByText('WhatsApp queued.', { exact: true }).waitFor();
    assert.equal(providerCalls.length, emailsBefore);
    assert.equal((await EmailDraft.findById(row._id)).status, 'queued');
    assert.match((await Queue.findOne({ emailDraftId: row._id })).text, /Compact Customer/);
    assert.equal((await EmailHistory.findOne({ draftId: row._id })).status, 'queued');
  } finally { await browser.close(); if (oldEnabled === undefined) delete process.env.ENABLE_WHATSAPP; else process.env.ENABLE_WHATSAPP = oldEnabled; }
});

test('browser: search shows only the matching jobs, already open', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${websiteBase}/?view=actions&tabs=off&query=Callback`); await page.getByRole('heading', { name: 'Website email rules' }).waitFor();
    const summaries = page.locator('summary').filter({ hasText: /\d+ mails? · / });
    await summaries.first().waitFor();
    assert.equal(await summaries.count(), 1);
    assert.match(await summaries.first().innerText(), /^Callback request/);
    await page.getByRole('row').filter({ hasText: 'Callback request (admin)' }).waitFor();
    assert.equal(await page.getByRole('row').filter({ hasText: 'Subscription confirmation' }).count(), 0);
    await page.goto(`${websiteBase}/?view=actions&tabs=off&query=nothing-like-this`);
    await page.getByText('No website mail matches “nothing-like-this”.', { exact: true }).waitFor();
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});


test('admin contact proxy shares backend settings and rejects website-only admins and foreign origins', async () => {
  async function contact(user, method = 'GET', origin = 'http://website.test') {
    const body = { name: 'Portal Admin', contactEmail: 'contact@example.test', whatsappNumbers: ['+919876543210'] };
    const req = new Request('http://website.test/api/admin-contact-settings', { method, headers: { 'Content-Type': 'application/json', Origin: origin }, ...(method === 'PATCH' ? { body: JSON.stringify(body) } : {}) });
    const response = await qa.context.run(context(user), () => qa.contactRoutes[method](req));
    return { status: response.status, ...await response.json() };
  }
  assert.equal((await contact(null)).status, 401);
  assert.equal((await contact(websiteAdmin)).status, 403);
  assert.equal((await contact(admin, 'PATCH', 'http://foreign.test')).status, 403);
  const saved = await contact(admin, 'PATCH');
  assert.equal(saved.status, 200); assert.equal(saved.data.contactEmail, 'contact@example.test');
  assert.deepEqual((await contact(admin)).data.whatsappNumbers, ['+919876543210']);
  assert.equal((await userModel.findById(admin._id)).email, 'admin@example.test');
});
