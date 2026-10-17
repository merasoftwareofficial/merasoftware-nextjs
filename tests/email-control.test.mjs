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
    stdin: { contents: `import * as emailRoutes from './src/app/api/email-control/[[...path]]/route'; import * as subscriptionRoute from './src/app/api/subscribe/route'; export {emailRoutes,subscriptionRoute}; export {context} from ${JSON.stringify(auth)}; export {subscriberRepo} from './src/lib/repo'; export {confirmSubscription,unsubscribe} from './src/lib/subscription-actions'; export {emailControlRequest} from './src/lib/email-control-server';`, resolveDir: root, loader: 'ts' },
    plugins: [{ name: 'request-context-fixtures', setup(b) { b.onResolve({ filter: /^@\/lib\/auth$/ }, () => ({ path: auth })); b.onResolve({ filter: /^next\/headers$/ }, () => ({ path: headers })); b.onResolve({ filter: /^server-only$/ }, () => ({ path: 'empty', namespace: 'fixture' })); b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export {}', loader: 'js' })); } }],
  });
  await build({ absWorkingDir: root, bundle: true, outfile: path.join(qaDir, 'panel.js'), jsx: 'automatic', tsconfig: path.join(root, 'tsconfig.json'), loader: { '.module.css': 'local-css' }, define: { 'process.env.NODE_ENV': '"production"', 'process.env': '{}' },
    stdin: { contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {EmailControlPanel} from './src/app/admin/email-control/email-control-panel';createRoot(document.getElementById('root')!).render(<EmailControlPanel initialApplication="website" canManagePortal={true}/>);`, loader: 'tsx', resolveDir: root } });
  database = await MongoMemoryServer.create({ instance: { launchTimeout: Number(process.env.EMAIL_TEST_MONGO_TIMEOUT || 60000) } });
  await mongoose.connect(database.getUri(), { dbName: 'website-email-isolated' });
  [admin, websiteAdmin] = await userModel.create([{ name: 'Portal Admin', email: 'admin@example.test', roles: ['admin'] }, { name: 'Website Admin', email: 'website-admin@example.test', roles: ['member'] }]);
  const app = express(); app.use(express.json()); app.use(backend('cookie-parser')()); app.use(requestMiddleware); app.use('/api/email-control', backend('./routes/emailControl'));
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
      if (req.url === '/panel.js' || req.url === '/panel.css') { res.setHeader('Content-Type', req.url.endsWith('.js') ? 'application/javascript' : 'text/css'); return res.end(readFileSync(path.join(qaDir, req.url.slice(1)))); }
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
    await page.goto(websiteBase); await page.getByRole('heading', { name: 'Website email rules' }).waitFor();
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
    await page.getByRole('tab', { name: 'Portal', exact: true }).click(); await page.getByRole('heading', { name: 'Portal email rules' }).waitFor();
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
    await page.goto(websiteBase); await page.getByRole('heading', { name: 'Website email rules' }).waitFor();
    await page.getByRole('tab', { name: 'Portal', exact: true }).click(); await page.getByRole('heading', { name: 'Portal email rules' }).waitFor();
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
    await page.getByRole('heading', { name: 'Review email' }).waitFor();
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
    await page.goto(websiteBase); await page.getByRole('heading', { name: 'Website email rules' }).waitFor();
    for (const tab of ['Website', 'Portal']) {
      await page.getByRole('tab', { name: tab, exact: true }).click(); await page.getByRole('heading', { name: `${tab} email rules` }).waitFor();
      const rows = page.locator('tbody tr');
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
      await route.fulfill({ response, json: body });
    });
    await page.goto(websiteBase); await page.getByRole('heading', { name: 'Website email rules' }).waitFor();
    await page.getByRole('tab', { name: 'Portal', exact: true }).click(); await page.getByRole('heading', { name: 'Portal email rules' }).waitFor();
    const row = page.getByRole('row').filter({ hasText: 'Project created' });
    await row.getByLabel('Project created default template').locator('option').first().waitFor({ state: 'attached' });
    assert.deepEqual(await row.getByLabel('Project created default template').locator('option').allTextContents(), ['Built-in action template']);
    await row.getByRole('button', { name: 'Add template', exact: true }).click();
    await page.getByRole('heading', { name: 'New email template' }).waitFor();
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('browser: customer actions have their own On/Off section, Off by default', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(websiteBase); await page.getByRole('heading', { name: 'Website email rules' }).waitFor();
    assert.equal(await page.getByRole('heading', { name: 'Customer actions (automatic)' }).count(), 0);
    await page.getByRole('tab', { name: 'Portal', exact: true }).click(); await page.getByRole('heading', { name: 'Portal email rules' }).waitFor();
    const section = page.getByRole('region', { name: 'Customer actions (automatic)' });
    const row = section.getByRole('row').filter({ hasText: 'Update request received' });
    const mail = row.getByLabel('Update request received mail');
    assert.equal(await mail.inputValue(), 'off');
    assert.deepEqual(await mail.locator('option').allTextContents(), ['On — send automatically', 'Off']);
    assert.equal(await section.getByRole('row').filter({ hasText: 'Project created' }).count(), 0);
    assert.deepEqual(await page.getByLabel('Project created sending rule').locator('option').allTextContents(), ['Ask before sending', 'Off']);
    await mail.selectOption('auto');
    await page.getByText('Email rule saved.', { exact: true }).waitFor();
    assert.equal((await EmailPolicy.findOne({ event: 'sendUserConfirmation' }).lean()).mode, 'auto');
    assert.equal(await mail.inputValue(), 'auto');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
