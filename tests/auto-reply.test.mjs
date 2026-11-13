import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { build } from 'esbuild';
import { chromium } from 'playwright';

// The Communication top tab bar is gone; the sidebar sub-tabs change the URL the same way, so tests do too.
async function openPanel(page, search) {
  await page.evaluate(query => { window.history.pushState(null, '', `${window.location.pathname}${query}`); window.dispatchEvent(new PopStateEvent('popstate')); }, search);
}

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
  const retryPath = `/api/auto-reply/reminder-runs/${new mongoose.Types.ObjectId()}/retry`;
  assert.equal((await request(retryPath, 'POST', member, 'admin', {})).status, 403);
  assert.equal((await request(retryPath, 'POST', admin, 'editor', {})).status, 403);
  assert.equal((await request(retryPath, 'POST', admin, 'admin', {})).status, 400, 'admin reaches the guarded backend');
});
test('proxy forwards a reminder draft edit (PUT body) and keeps revision and role checks', async () => {
  const steps = [{ offsetDays: -3, subject: 'Payment due soon', text: 'Hello {{name}}, please pay {{amount}}.', channel: 'email' }];
  const created = await request('/api/auto-reply/reminder-rules', 'POST', admin, 'admin', { name: 'Proxy edit rule', source: 'monthly_package', steps });
  assert.equal(created.status, 200);
  const id = created.data._id, revision = created.data.revision;
  const path = `/api/auto-reply/reminder-rules/${id}`;
  const edit = { name: 'Proxy edit rule v2', source: 'monthly_package', steps: [{ ...steps[0], subject: 'Updated subject' }], expectedRevision: revision };
  assert.equal((await request(path, 'PUT', member, 'admin', edit)).status, 403);
  assert.equal((await request(path, 'PUT', admin, 'editor', edit)).status, 403);
  const saved = await request(path, 'PUT', admin, 'admin', edit);
  assert.equal(saved.status, 200, saved.error);
  assert.equal(saved.data.name, 'Proxy edit rule v2');
  assert.equal(saved.data.revision, revision + 1);
  const stored = (await request('/api/auto-reply/reminder-rules')).data.find(row => row._id === id);
  assert.equal(stored.name, 'Proxy edit rule v2');
  assert.equal(stored.steps[0].subject, 'Updated subject');
  assert.equal(stored.enabled, false);
  const stale = await request(path, 'PUT', admin, 'admin', { ...edit, name: 'Stale overwrite' });
  assert.equal(stale.status, 409, 'an old revision is rejected, not saved');
  assert.equal((await request('/api/auto-reply/reminder-rules')).data.find(row => row._id === id).name, 'Proxy edit rule v2');
  assert.equal((await request(path, 'PUT', admin, 'admin', { name: 'No revision', source: 'monthly_package', steps })).status, 400);
});
test('paid-project review is admin-only and shows mismatches before any linking', async () => {
  const Reservation = backend('./models/offerReservationModel'), Order = backend('./models/orderProductModel'), Invoice = backend('./models/invoiceModel'), Transaction = backend('./models/transactionModel');
  const customer = await User.create({ name: 'Paid review', email: 'paidreview@example.test', roles: ['customer'] });
  const now = Date.now(), reservationId = new mongoose.Types.ObjectId(), orderId = new mongoose.Types.ObjectId(), invoiceId = new mongoose.Types.ObjectId();
  await Reservation.create({ _id: reservationId, userId: customer._id, offerSlug: 'review-offer', offerSnapshot: { title: 'Review offer', applicableCategories: ['combo_packages'] }, periodEndsAt: new Date(now + 3600000), regularPrice: 10000, reservedPrice: 2099, reservedAt: new Date(now - 3600000), expiresAt: new Date(now + 36000000), origin: 'customer', remindersEnabled: true });
  await Order.collection.insertOne({ _id: orderId, userId: customer._id, isWebsiteProject: true, isServicePlan: false, orderVisibility: 'approved', price: 2099, totalAmount: 2099, createdAt: new Date(now - 10000), projectSnapshot: { category: 'standard_websites' }, orderItems: [{ name: 'Paid project' }] });
  await Invoice.collection.insertOne({ _id: invoiceId, orderId, userId: customer._id, invoiceType: 'project', status: 'paid', amount: 2099, amountPaid: 2099 });
  await Transaction.collection.insertOne({ orderId, invoiceId, userId: customer._id, type: 'payment', status: 'completed', amount: 2099, createdAt: new Date(now - 5000) });
  const path = `/api/auto-reply/reservations/${reservationId}/paid-projects`;
  assert.equal((await request(path, 'GET', member)).status, 403);
  assert.equal((await request(path, 'GET', admin, 'editor')).status, 403);
  const preview = await request(path);
  assert.equal(preview.status, 200);
  assert.equal(preview.data.candidates[0].categoryMismatch, true);
  assert.equal(preview.data.candidates[0].offerRecorded, false);
  assert.equal((await Reservation.findById(reservationId)).projectId, null);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(websiteBase);
    await openPanel(page, '?panel=whatsapp-connection');
    await page.getByRole('button', { name: 'Reservations', exact: true }).click();
    await page.getByRole('button', { name: 'Review matching paid projects' }).click();
    const review = page.getByRole('region', { name: 'Review paid project link' });
    await review.getByLabel('Paid project').selectOption(String(orderId));
    await review.getByText(/No offer agreement was recorded/).waitFor();
    await review.getByText(/I reviewed the category mismatch/).waitFor();
    assert.ok(await review.getByRole('button', { name: 'Link paid project' }).isDisabled());
  } finally { await browser.close(); }
  await Reservation.deleteOne({ _id: reservationId }); await Order.deleteOne({ _id: orderId }); await Invoice.deleteOne({ _id: invoiceId }); await Transaction.deleteMany({ orderId }); await User.deleteOne({ _id: customer._id });
});
test('package start can be closed from Communication only by both admins', async () => {
  const StartRequest = backend('./models/packageStartRequestModel');
  const customer = await User.create({ name: 'Request customer', email: 'request-close@example.test', roles: ['customer'] });
  const row = await StartRequest.create({ userId: customer._id, packageId: 'request-close', packageSnapshot: { name: 'Request package' }, requestedAt: new Date(), kind: 'callback' });
  const path = `/api/auto-reply/package-starts/${row._id}/close`;
  assert.equal((await request(path, 'POST', member, 'admin', {})).status, 403);
  assert.equal((await request(path, 'POST', admin, 'editor', {})).status, 403);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(websiteBase);
    await openPanel(page, '?panel=whatsapp-connection');
    await page.getByRole('button', { name: 'Reservations', exact: true }).click();
    await page.getByText('Request customer', { exact: true }).waitFor();
    const control = { source: 'package_request', entityId: String(row._id), paused: true, expectedPaused: false };
    assert.equal((await request('/api/auto-reply/reminder-controls', 'POST', member, 'admin', control)).status, 403);
    assert.equal((await request('/api/auto-reply/reminder-controls', 'POST', admin, 'editor', control)).status, 403);
    page.once('dialog', confirmation => confirmation.accept());
    await page.getByRole('button', { name: 'Pause request team reminders', exact: true }).click();
    await page.getByText('Request team reminders: Paused', { exact: true }).waitFor();
    assert.equal((await StartRequest.findById(row._id)).remindersPaused, true);
    assert.equal((await request('/api/auto-reply/reminder-controls', 'POST', admin, 'admin', control)).status, 409, 'stale state is rejected');
    page.once('dialog', confirmation => confirmation.accept());
    await page.getByRole('button', { name: 'Resume request team reminders', exact: true }).click();
    await page.getByText('Request team reminders: On', { exact: true }).waitFor();
    page.once('dialog', confirmation => confirmation.accept());
    await page.getByRole('button', { name: 'Close request', exact: true }).click();
    await page.getByText('No open request.').waitFor();
    const saved = await StartRequest.findById(row._id).lean();
    assert.equal(saved.closedReason, 'closed_by_team');
    assert.equal(String(saved.closedBy), String(admin._id));
    assert.equal((await request(path, 'POST', admin, 'admin', {})).status, 409);
  } finally { await browser.close(); await StartRequest.deleteOne({ _id: row._id }); await User.deleteOne({ _id: customer._id }); }
});
test('reservation team reminders can be paused independently without resuming the customer countdown', async () => {
  const Reservation = backend('./models/offerReservationModel');
  const customer = await User.create({ name: 'Reservation team customer', email: 'reservation-team@example.test', roles: ['member'] });
  const now = Date.now(), at = new Date(now - 24 * 3600000);
  const row = await Reservation.create({ userId: customer._id, offerSlug: 'team-control', offerSnapshot: { title: 'Team controlled offer' }, periodEndsAt: new Date(now + 3600000), regularPrice: 10000, reservedPrice: 5000, reservedAt: new Date(now - 48 * 3600000), expiresAt: new Date(now + 24 * 3600000), origin: 'customer', remindersEnabled: true, startRequestedAt: at, pausedRemainingMs: 48 * 3600000, startRequests: [{ at, remainingMs: 48 * 3600000, alerts: 1 }] });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(websiteBase);
    await openPanel(page, '?panel=whatsapp-connection');
    await page.getByRole('button', { name: 'Reservations', exact: true }).click();
    await page.getByText(/Customer countdown reminders are held/).waitFor();
    page.once('dialog', confirmation => confirmation.accept());
    await page.getByRole('button', { name: 'Pause reservation team reminders', exact: true }).click();
    await page.getByText('Reservation team reminders: Paused', { exact: true }).waitFor();
    let saved = await Reservation.findById(row._id).lean();
    assert.equal(saved.teamRemindersPaused, true); assert.equal(saved.remindersPaused, false); assert.ok(saved.startRequestedAt);
    page.once('dialog', confirmation => confirmation.accept());
    await page.getByRole('button', { name: 'Resume reservation team reminders', exact: true }).click();
    await page.getByText('Reservation team reminders: On', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Message and channel settings (all customers)', exact: true }).click();
    assert.equal(new URL(page.url()).searchParams.get('event'), 'offer.start.request.admin');
  } finally { await browser.close(); await Reservation.deleteOne({ _id: row._id }); await User.deleteOne({ _id: customer._id }); }
});

test('all recorded reminder history supports pagination, retry and direct action settings', async () => {
  const Reservation = backend('./models/offerReservationModel');
  const { EmailHistory } = backend('./models/emailControlModel');
  const userId = new mongoose.Types.ObjectId(), reservationId = new mongoose.Types.ObjectId();
  await User.collection.insertOne({ _id: userId, name: 'History pagination customer' });
  await Reservation.collection.insertOne({ _id: reservationId, userId, projectId: new mongoose.Types.ObjectId(), offerSnapshot: { title: 'Finished history offer' } });
  const historyIds = [];
  for (let version = 1; version <= 21; version++) {
    const row = await EmailHistory.create({ draftId: new mongoose.Types.ObjectId(), application: 'portal', event: 'offer.reservation.extended', status: 'sent', dedupeKey: `offer-reservation-extended:${reservationId}:${version}` });
    historyIds.push(row._id);
  }
  assert.equal((await request('/api/auto-reply/legacy-reminder-history?source=reservation', 'GET', member)).status, 403);
  assert.equal((await request('/api/auto-reply/legacy-reminder-history?source=reservation', 'GET', admin, 'editor')).status, 403);
  assert.equal((await request('/api/auto-reply/legacy-reminder-history?source=reservation&entityId=invalid')).status, 400);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    let heldOnce = true;
    await page.route('**/api/auto-reply/legacy-reminder-history?**', async route => {
      if (heldOnce) { heldOnce = false; await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'History temporarily unavailable.' }) }); }
      else await route.continue();
    });
    await page.goto(websiteBase);
    await openPanel(page, '?panel=reminders');
    await page.getByRole('button', { name: 'Existing offer & reservation reminders' }).click();
    await page.getByText('All existing reminder message history', { exact: true }).click();
    const history = page.getByRole('region', { name: 'All existing reminder message history', exact: true });
    await history.getByText('History temporarily unavailable.', { exact: false }).waitFor();
    await history.getByRole('button', { name: 'Retry history' }).click();
    await history.getByText('Page 1 of 2 · 21 records', { exact: true }).waitFor();
    await history.getByRole('button', { name: 'Next history page' }).click();
    await history.getByText('Page 2 of 2 · 21 records', { exact: true }).waitFor();
    await history.getByRole('button', { name: 'Open action settings', exact: true }).click();
    assert.equal(new URL(page.url()).searchParams.get('event'), 'offer.reservation.extended');
  } finally {
    await browser.close(); await EmailHistory.deleteMany({ _id: { $in: historyIds } }); await Reservation.deleteOne({ _id: reservationId }); await User.deleteOne({ _id: userId });
  }
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
    await openPanel(page, '?panel=whatsapp-connection');
    await page.getByRole('button', { name: 'Final Message', exact: true }).click();
    const dialog = page.getByRole('region', { name: 'Final Message', exact: true });
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
test('browser: Communication → Reservation → running reservations with time left, used and expired counts', { timeout: 60000 }, async () => {
  const Reservation = backend('./models/offerReservationModel');
  const Order = backend('./models/orderProductModel'), Invoice = backend('./models/invoiceModel');
  const ReminderDraft = backend('./models/communicationReminderRuleModel');
  const ReminderRun = backend('./models/communicationReminderRunModel');
  const { EmailHistory } = backend('./models/emailControlModel');
  const { Queue } = backend('./whatsapp/src/models.js');
  const paymentDraftId = new mongoose.Types.ObjectId();
  const customer = await User.create({ name: 'Reserving Customer', email: 'reserve@example.test', roles: ['member'], phone: '+919876500009' });
  const hour = 3600000, now = Date.now();
  const base = { userId: customer._id, periodEndsAt: new Date(now + hour), regularPrice: 10000, reservedPrice: 5000, origin: 'customer' };
  const orderId = new mongoose.Types.ObjectId(), invoiceId = new mongoose.Types.ObjectId();
  await Order.collection.insertOne({ _id: orderId, userId: customer._id, orderVisibility: 'approved', isServicePlan: true, servicePlanStatus: 'active', salesPackage: { package: { id: 'sample' } }, orderItems: [{ name: 'Sample package' }], createdAt: new Date(now), paymentPolicy: { reminderOffsets: [-3, 0, 3] } });
  await Invoice.collection.insertOne({ _id: invoiceId, userId: customer._id, orderId, invoiceNumber: 'TEST-REMINDER', invoiceType: 'project', amount: 3000, amountPaid: 1000, status: 'partially_paid', dueDate: new Date(now + 7 * 24 * hour) });
  await EmailHistory.create({ draftId: paymentDraftId, application: 'portal', event: 'offer.payment.reminder', status: 'queued', dedupeKey: `offer-reminder:${invoiceId}:-3` });
  await Queue.create({ to: '919876500009', text: 'Payment reminder', status: 'pending', emailDraftId: paymentDraftId, event: 'offer.payment.reminder', application: 'portal' });
  await Reservation.create([
    { ...base, offerSlug: 'running', offerSnapshot: { title: 'Running offer' }, reservedAt: new Date(now - hour), expiresAt: new Date(now + 47 * hour), closureStatus: 'pending', remindersEnabled: true },
    { ...base, offerSlug: 'used', offerSnapshot: { title: 'Used offer' }, reservedAt: new Date(now - 2 * hour), expiresAt: new Date(now + 70 * hour), projectId: new mongoose.Types.ObjectId() },
    { ...base, offerSlug: 'gone', offerSnapshot: { title: 'Gone offer' }, reservedAt: new Date(now - 80 * hour), expiresAt: new Date(now - 8 * hour), closureStatus: 'sent' },
  ]);
  assert.equal((await request('/api/auto-reply/reservations')).status, 200);
  assert.equal((await request('/api/auto-reply/reservations', 'GET', member)).status, 403);
  assert.equal((await request('/api/auto-reply/reservations', 'POST', admin, 'admin', {})).status, 404, 'read only');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 850 } });
    page.setDefaultTimeout(10000);
    await page.goto(websiteBase);
    await openPanel(page, '?panel=whatsapp-connection');
    await page.getByRole('button', { name: 'Reservations', exact: true }).click();
    const dialog = page.getByRole('region', { name: 'Reservation', exact: true });
    await dialog.getByRole('heading', { name: 'Running (1)', exact: true }).waitFor();
    await dialog.getByText('Reserving Customer', { exact: true }).first().waitFor();
    await dialog.getByText('+91 98765 00009', { exact: true }).waitFor();
    await dialog.getByText(/^Running offer · 48 hours · ends /).waitFor();
    await dialog.getByText(/^4[67]h \d+m left$/).waitFor();
    await dialog.getByText(/Upcoming reminder milestone:.*Subject to current eligibility/).waitFor();
    const runningReservation = await Reservation.findOne({ offerSlug: 'running' });
    const controlPath = `/api/auto-reply/reservations/${runningReservation._id}/reminders`;
    assert.equal((await request(controlPath, 'POST', member, 'admin', { paused: true })).status, 403);
    assert.equal((await request(controlPath, 'POST', admin, 'editor', { paused: true })).status, 403);
    page.once('dialog', confirmation => confirmation.accept());
    await dialog.getByRole('button', { name: 'Pause customer reminders' }).click();
    await dialog.getByText('Customer reminders: Paused').waitFor();
    assert.equal((await Reservation.findById(runningReservation._id)).remindersPaused, true);
    assert.equal(await dialog.getByText(/Upcoming reminder milestone:/).count(), 0);
    page.once('dialog', confirmation => confirmation.accept());
    await dialog.getByRole('button', { name: 'Resume customer reminders' }).click();
    await dialog.getByText('Customer reminders: On').waitFor();
    assert.equal((await Reservation.findById(runningReservation._id)).remindersPaused, false);
    await dialog.getByText('1 reservation linked to a project · 1 expired reservation', { exact: true }).waitFor();
    await dialog.getByText(/Expiry message records: 1 sent or queued/).waitFor();
    assert.equal(await dialog.getByText('Used offer').isVisible(), false, 'a used reservation is not in the running list');
    await page.setViewportSize({ width: 390, height: 844 });
    const overflow = await page.evaluate(() => { const panel = document.querySelector('[aria-label="Reservation"]'); return panel.scrollWidth - panel.clientWidth; });
    assert.ok(overflow <= 0, `no sideways scroll at phone width (${overflow}px)`);
    await page.screenshot({ path: path.join(qaDir, 'reservation-mobile.png') });
    await openPanel(page, '');
    await openPanel(page, '?panel=reminders');
    const reminders = page.getByRole('region', { name: 'Reminders', exact: true });
    await reminders.getByRole('button', { name: 'Existing offer & reservation reminders' }).click();
    await reminders.getByRole('heading', { name: 'Running (1)', exact: true }).waitFor();
    await reminders.getByText('Reserving Customer · TEST-REMINDER', { exact: true }).waitFor();
    await reminders.getByText(/Outstanding ₹2,000/).waitFor();
    const invoiceCard = reminders.locator('article').filter({ hasText: 'TEST-REMINDER' });
    await invoiceCard.getByText('Recorded payment reminder history', { exact: true }).click();
    await invoiceCard.getByText('Day -3', { exact: true }).waitFor();
    await invoiceCard.getByText(/Message record: Queued/).waitFor();
    await invoiceCard.getByText('WhatsApp: Waiting', { exact: true }).waitFor();
    page.once('dialog', confirmation => confirmation.accept());
    await invoiceCard.getByRole('button', { name: 'Pause payment reminders', exact: true }).click();
    await invoiceCard.getByText('Payment reminders: Paused', { exact: true }).waitFor();
    assert.equal((await Invoice.findById(invoiceId)).offerRemindersPaused, true);
    assert.deepEqual((await Order.findById(orderId)).paymentPolicy.reminderOffsets, [-3, 0, 3], 'saved agreement stays unchanged');
    page.once('dialog', confirmation => confirmation.accept());
    await invoiceCard.getByRole('button', { name: 'Resume payment reminders', exact: true }).click();
    await invoiceCard.getByText('Payment reminders: On', { exact: true }).waitFor();
    await Invoice.updateOne({ _id: invoiceId }, { $set: { status: 'paid', amountPaid: 3000 } });
    await reminders.getByRole('button', { name: 'Paid / cancelled invoices', exact: true }).click();
    await reminders.getByText('This invoice is closed; no payment reminder is due.', { exact: true }).waitFor();
    await invoiceCard.getByText('Recorded payment reminder history', { exact: true }).click();
    await invoiceCard.getByText('Day -3', { exact: true }).waitFor();
    assert.equal(await invoiceCard.getByRole('button', { name: 'Pause payment reminders', exact: true }).count(), 0);

    assert.equal((await request('/api/auto-reply/payment-reminders', 'GET', member)).status, 403);
    await reminders.getByRole('region', { name: 'Existing reminders' }).getByText('Reserving Customer', { exact: true }).first().waitFor();
    await reminders.getByText('This is not a complete schedule of upcoming reminders.', { exact: false }).waitFor();
    await reminders.getByRole('button', { name: 'Rules', exact: true }).click();
    await reminders.getByRole('button', { name: 'Create draft' }).click();
    await reminders.getByLabel('Rule name').fill('Test monthly reminder');
    await reminders.getByLabel('Days for reminder 1').fill('-3');
    await reminders.getByLabel('Subject', { exact: true }).fill('Payment due soon');
    await reminders.getByLabel('Message', { exact: true }).fill('Hello {{name}}, please pay {{amount}}.');
    await reminders.getByRole('button', { name: 'Save draft' }).click();
    await reminders.getByText('Draft saved. It is not active and will not send messages.').waitFor();
    const draft = await ReminderDraft.findOne({ name: 'Test monthly reminder' });
    assert.equal(draft.enabled, false);
    assert.equal(draft.revision, 1);
    await reminders.locator('article', { hasText: 'Test monthly reminder' }).getByRole('button', { name: 'Edit draft' }).click();
    await reminders.getByLabel('Subject', { exact: true }).fill('Payment due very soon');
    await reminders.getByRole('button', { name: 'Save draft' }).click();
    await reminders.getByText('Draft saved. It is not active and will not send messages.').waitFor();
    const edited = await ReminderDraft.findById(draft._id);
    assert.equal(edited.name, 'Test monthly reminder');
    assert.equal(edited.steps[0].subject, 'Payment due very soon');
    assert.equal(edited.revision, 2);
    assert.equal(edited.enabled, false);
    await reminders.getByRole('button', { name: 'Create draft' }).click();
    await reminders.getByLabel('Rule name').fill('Broadcast follow-up');
    await reminders.locator('form').getByRole('combobox').first().selectOption('broadcast');
    await reminders.getByLabel('Subject', { exact: true }).fill('Following up');
    await reminders.getByLabel('Message', { exact: true }).fill('Hello {{name}}');
    await reminders.getByRole('button', { name: 'Save draft' }).click();
    await reminders.getByRole('button', { name: 'Preview broadcast rule' }).click();
    await reminders.getByRole('region', { name: 'Reminder rule preview' }).getByText('Future broadcasts only').waitFor();
    const oldJobs = process.env.COMMUNICATION_REMINDER_JOBS_ENABLED, oldCrons = process.env.ENABLE_CRONS;
    try {
      process.env.COMMUNICATION_REMINDER_JOBS_ENABLED = 'true'; process.env.ENABLE_CRONS = 'true';
      const broadcastRule = reminders.locator('article').filter({ hasText: 'Broadcast follow-up' });
      page.once('dialog', dialog => dialog.accept());
      await broadcastRule.getByRole('button', { name: 'Activate', exact: true }).click();
      await broadcastRule.getByRole('button', { name: 'Stop reminders' }).waitFor();
      assert.equal((await ReminderDraft.findOne({ name: 'Broadcast follow-up' })).enabled, true);
      page.once('dialog', dialog => dialog.accept());
      await broadcastRule.getByRole('button', { name: 'Stop reminders' }).click();
      await broadcastRule.getByRole('button', { name: 'Activate', exact: true }).waitFor();
      assert.equal((await ReminderDraft.findOne({ name: 'Broadcast follow-up' })).enabled, false);
    } finally {
      if (oldJobs === undefined) delete process.env.COMMUNICATION_REMINDER_JOBS_ENABLED; else process.env.COMMUNICATION_REMINDER_JOBS_ENABLED = oldJobs;
      if (oldCrons === undefined) delete process.env.ENABLE_CRONS; else process.env.ENABLE_CRONS = oldCrons;
    }
    await ReminderRun.create({ ruleId: draft._id, ruleRevision: 1, source: 'monthly_package', occurrenceKey: `${orderId}:2`, step: 0, entityId: orderId, clientId: customer._id, dueAt: new Date(now + hour), subject: 'Reminder', text: 'Test', channel: 'both', status: 'queued', channelOutcomes: { email: 'sent', whatsapp: 'queued' } });
    await reminders.getByRole('button', { name: 'Reminder activity', exact: true }).click();
    await reminders.getByText('Reserving Customer · Test monthly reminder', { exact: true }).waitFor();
    await reminders.getByText(/Email: sent · WhatsApp: queued/).waitFor();
    const history = reminders.getByRole('region', { name: 'New reminder activity' });
    await history.getByRole('combobox').selectOption('sent_today');
    await history.getByText('No reminder steps yet.').waitFor();
    await history.getByRole('combobox').selectOption('all');
    await history.getByText('Reserving Customer · Test monthly reminder', { exact: true }).waitFor();
    assert.equal((await request('/api/auto-reply/reminder-runs', 'GET', member)).status, 403);
    await reminders.getByRole('button', { name: 'Existing offer & reservation reminders' }).click();
    await reminders.getByRole('button', { name: 'Offer payment reminder settings →' }).click();
    assert.equal(new URL(page.url()).searchParams.get('event'), 'offer.payment.reminder');
    await openPanel(page, '?panel=email-review');
    await Order.collection.updateOne({ _id: orderId }, { $set: { serviceStartNotifiedAt: new Date() } });
    await page.getByRole('button', { name: 'Business activity', exact: true }).click();
    const activity = page.getByRole('region', { name: 'Business Activity', exact: true });
    await activity.getByText('Monthly package order created', { exact: true }).waitFor();
    await activity.getByText('Plan started', { exact: true }).waitFor();
    await activity.getByText('Offer reserved', { exact: true }).first().waitFor();
    await activity.getByText('Reserving Customer · Sample package', { exact: true }).first().waitFor();
    assert.equal((await request('/api/auto-reply/business-activity', 'GET', member)).status, 403);
    await activity.getByRole('button', { name: 'Reservation message settings' }).first().click();
    assert.equal(new URL(page.url()).searchParams.get('event'), 'offer.reserved');
    await openPanel(page, '?panel=email-review');
    await page.getByRole('button', { name: 'Business activity', exact: true }).click();
    await page.getByRole('region', { name: 'Business Activity', exact: true }).getByRole('button', { name: 'Plan-start message settings' }).first().click();
    assert.equal(new URL(page.url()).searchParams.get('event'), 'plan.started');
  } finally {
    await browser.close();
    await Reservation.deleteMany({});
    await Queue.deleteMany({ emailDraftId: paymentDraftId }); await EmailHistory.deleteMany({ draftId: paymentDraftId });
    await Invoice.deleteOne({ _id: invoiceId }); await Order.deleteOne({ _id: orderId });
    await ReminderRun.deleteMany({});
    await ReminderDraft.deleteMany({});
  }
});
test('browser: Communication → Auto Reply → switch, ad message and recognised messages', { timeout: 90000 }, async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 850 } });
    page.setDefaultTimeout(10000);
    await page.goto(websiteBase);
    await openPanel(page, '?panel=whatsapp-connection');
    await page.getByRole('button', { name: 'Auto Reply', exact: true }).click();
    const dialog = page.getByRole('region', { name: 'Auto Reply', exact: true });
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
    await openPanel(page, '');
    assert.equal(await page.getByRole('dialog').count(), 0);
  } finally { await browser.close(); }
});
test('browser: work-based reminders are a plain list; details open per work and explanations sit in (i) popups', async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(websiteBase);
    await openPanel(page, '?panel=reminders');
    const work = page.getByRole('region', { name: 'Reminders by work' });
    await work.getByRole('heading', { name: 'Reminders', level: 3, exact: true }).waitFor();
    // Plain rows, not cards: each work is one button row with its name and one short status.
    assert.equal(await work.locator('article').count(), 0);
    const row = title => work.getByRole('button', { name: new RegExp(`^${title}`) });
    for (const title of ['Monthly payment', 'Offer payment', 'Reservation', 'Broadcast follow-up']) await row(title).waitFor();
    await row('Offer payment').getByText(/customers$/).waitFor();
    await row('Reservation').getByText(/customers$/).waitFor();
    // Add Reminder opens one form right away. Saving closes it and keeps the user on this page.
    await work.getByRole('button', { name: 'Add Reminder' }).click();
    const form = page.getByRole('dialog', { name: 'New reminder' });
    await form.getByRole('heading', { name: 'New reminder' }).waitFor();
    assert.equal(await form.getByLabel('Work').inputValue(), 'monthly_package');
    assert.equal(await form.getByLabel('Work').locator('option').count(), 2);
    await form.getByLabel('Rule name').fill('Browser renewal reminder');
    await form.getByLabel('Days for reminder 1').fill('-3');
    await form.getByLabel('Subject', { exact: true }).fill('Renewal due soon');
    await form.getByLabel('Message', { exact: true }).fill('Hello {{name}}, your renewal is due soon.');
    await form.getByRole('button', { name: 'Save draft' }).click();
    await page.getByText('Draft saved. It is not active and will not send messages.').waitFor();
    assert.equal(await page.getByRole('dialog', { name: 'New reminder' }).count(), 0);
    // The saved rule shows on its work page. Opening a work from its row does not open the form by itself.
    const details = page.getByRole('region', { name: 'Work reminders' });
    await row('Monthly payment').click();
    await details.getByRole('heading', { name: 'Monthly payment', level: 3, exact: true }).waitFor();
    await details.getByText('Browser renewal reminder', { exact: true }).waitFor();
    assert.equal(await page.getByRole('dialog', { name: 'New reminder' }).count(), 0);
    // The popup on Timing opens with the detail, closes with Escape, and the page does not move.
    await details.getByRole('button', { name: 'About Timing' }).click();
    await details.getByRole('note').getByText(/Each step is set in days/).waitFor();
    await page.keyboard.press('Escape');
    assert.equal(await details.getByRole('note').count(), 0);
    await details.getByRole('button', { name: 'All work' }).click();
    // Each work: a title, the facts list with its (i) popups, and its existing data lists. No long paragraphs.
    for (const title of ['Offer payment', 'Reservation', 'Broadcast follow-up']) {
      await row(title).click();
      await details.getByRole('heading', { name: title, level: 3, exact: true }).waitFor();
      for (const label of ['Timing', 'Stops', 'Control']) await details.getByRole('button', { name: `About ${label}` }).waitFor();
      await details.getByRole('button', { name: 'Delivery history →' }).waitFor();
      await details.getByRole('button', { name: 'All work' }).click();
    }
    await row('Broadcast follow-up').click();
    await details.getByText('Set in each step below', { exact: true }).waitFor();
    await details.getByRole('button', { name: 'All work' }).click();
    await row('Reservation').click();
    for (const label of ['Reservation confirmation', 'Start request and team reminder', 'After 24 hours', '24 hours left', '6 hours left', '1 hour left']) await details.getByRole('button', { name: `${label} →` }).waitFor();
    // The work's own recorded history is open straight away, not hidden behind a click.
    await details.getByRole('region', { name: 'Reservation message history', exact: true }).waitFor();
    await details.getByRole('button', { name: 'All work' }).click();
    await row('Offer payment').click();
    await details.getByRole('heading', { name: 'Offer payment reminders' }).waitFor();
    await details.getByRole('region', { name: 'Message history', exact: true }).waitFor();
    await details.getByRole('button', { name: 'Offer payment reminder message →' }).click();
    assert.match(page.url(), /event=offer.payment.reminder/);
    // Reminder activity: recorded offer and reservation history is open straight away too.
    await openPanel(page, '?panel=reminders');
    await page.getByRole('button', { name: 'Reminder activity', exact: true }).click();
    await page.getByRole('region', { name: 'Offer and reservation message history', exact: true }).waitFor();
  } finally { await browser.close(); }
});
test('reminder activity filters by work using stored runs', async () => {
  const Run = backend('./models/communicationReminderRunModel');
  const id = () => new mongoose.Types.ObjectId();
  const ruleId = id(), clientId = id();
  const base = { ruleId, ruleRevision: 1, step: 0, entityId: id(), clientId, dueAt: new Date(), subject: 'Reminder', text: 'Hello', channel: 'email' };
  await Run.create([{ ...base, source: 'monthly_package', occurrenceKey: `monthly-${id()}` }, { ...base, source: 'broadcast', occurrenceKey: `broadcast-${id()}` }]);
  try {
    const monthly = await request('/api/auto-reply/reminder-runs?source=monthly_package');
    assert.equal(monthly.status, 200);
    assert.ok(monthly.data.rows.some(row => String(row.ruleId) === String(ruleId)));
    assert.ok(monthly.data.rows.every(row => row.source === 'monthly_package'));
    const broadcast = await request('/api/auto-reply/reminder-runs?source=broadcast');
    assert.ok(broadcast.data.rows.some(row => String(row.ruleId) === String(ruleId)));
    assert.ok(broadcast.data.rows.every(row => row.source === 'broadcast'));
    assert.equal((await request('/api/auto-reply/reminder-runs?source=invalid')).status, 400);
  } finally { await Run.deleteMany({ ruleId }); }
});
test('work summary counts distinct recipients only for current active scheduled rule', async () => {
  const Rule = backend('./models/communicationReminderRuleModel');
  const Run = backend('./models/communicationReminderRunModel');
  const id = () => new mongoose.Types.ObjectId();
  const ruleId = id(), customer = id(), entityId = id();
  // Insert directly to avoid changing any existing rule's state in this isolated fixture.
  await Rule.collection.insertOne({ _id: ruleId, name: 'Summary test', source: 'monthly_package', enabled: true, revision: 37, steps: [] });
  const base = { ruleId, ruleRevision: 37, source: 'monthly_package', entityId, clientId: customer, dueAt: new Date(), subject: 'Reminder', text: 'Hello', channel: 'email' };
  try {
    await Run.create([{ ...base, occurrenceKey: `a-${id()}`, step: 0 }, { ...base, occurrenceKey: `b-${id()}`, step: 1 }, { ...base, occurrenceKey: `c-${id()}`, step: 0, status: 'sent' }, { ...base, occurrenceKey: `d-${id()}`, step: 0, ruleRevision: 36, clientId: id() }]);
    const response = await request('/api/auto-reply/reminder-work-summary');
    assert.equal(response.status, 200);
    assert.equal(response.data.monthly_package.enabled, true);
    assert.equal(response.data.monthly_package.scheduledRecipients, 1);
    // An active rule is not "sending" while the server schedulers are off; the summary says so.
    assert.equal(response.data.monthly_package.schedulerEnabled, false);
    const oldJobs = process.env.COMMUNICATION_REMINDER_JOBS_ENABLED, oldCrons = process.env.ENABLE_CRONS;
    try {
      process.env.COMMUNICATION_REMINDER_JOBS_ENABLED = 'true'; process.env.ENABLE_CRONS = 'true';
      assert.equal((await request('/api/auto-reply/reminder-work-summary')).data.monthly_package.schedulerEnabled, true);
    } finally {
      if (oldJobs === undefined) delete process.env.COMMUNICATION_REMINDER_JOBS_ENABLED; else process.env.COMMUNICATION_REMINDER_JOBS_ENABLED = oldJobs;
      if (oldCrons === undefined) delete process.env.ENABLE_CRONS; else process.env.ENABLE_CRONS = oldCrons;
    }
  } finally { await Run.deleteMany({ ruleId }); await Rule.deleteOne({ _id: ruleId }); }
});
test('work summary counts distinct customers with upcoming offer-payment and reservation reminders', async () => {
  const User = backend('./models/userModel'), Order = backend('./models/orderProductModel'), Invoice = backend('./models/invoiceModel');
  const Reservation = backend('./models/offerReservationModel');
  const { clearCache } = backend('./helpers/reminderWorkSummary');
  const id = () => new mongoose.Types.ObjectId(), hour = 3600000, now = Date.now();
  const read = async () => { clearCache(); const response = await request('/api/auto-reply/reminder-work-summary'); assert.equal(response.status, 200); return response.data; };
  const before = await read();
  const good = await User.create({ name: 'Summary offer customer', email: 'summary-offer@example.test', roles: ['member'] });
  const paused = await User.create({ name: 'Summary paused customer', email: 'summary-paused@example.test', roles: ['member'] });
  const noEmail = id();
  await User.collection.insertOne({ _id: noEmail, name: 'Summary customer without email' });
  const orders = [], invoices = [];
  // Two open invoices for one customer count once; a paused invoice and a customer with no email do not count.
  for (const [userId, extra] of [[good._id, {}], [good._id, {}], [paused._id, { offerRemindersPaused: true }], [noEmail, {}]]) {
    const orderId = id();
    orders.push(orderId);
    await Order.collection.insertOne({ _id: orderId, userId, orderVisibility: 'approved', isServicePlan: false, orderItems: [{ name: 'Summary project' }], createdAt: new Date(now), paymentPolicy: { reminderOffsets: [-3, 0, 3] } });
    const invoiceId = id();
    invoices.push(invoiceId);
    await Invoice.collection.insertOne({ _id: invoiceId, userId, orderId, invoiceNumber: `SUMMARY-${invoiceId}`, invoiceType: 'project', amount: 3000, amountPaid: 0, status: 'unpaid', dueDate: new Date(now + 7 * 24 * hour), ...extra });
  }
  const reservationBase = { periodEndsAt: new Date(now + hour), regularPrice: 10000, reservedPrice: 5000, origin: 'customer', reservedAt: new Date(now - hour), expiresAt: new Date(now + 47 * hour), remindersEnabled: true };
  const reservations = await Reservation.create([
    { ...reservationBase, userId: good._id, offerSlug: 'summary-a', offerSnapshot: { title: 'Summary A' } },
    { ...reservationBase, userId: good._id, offerSlug: 'summary-b', offerSnapshot: { title: 'Summary B' } },
    { ...reservationBase, userId: paused._id, offerSlug: 'summary-c', offerSnapshot: { title: 'Summary C' }, remindersPaused: true },
  ]);
  try {
    const after = await read();
    assert.equal(after.offer_payment.upcomingCustomers, before.offer_payment.upcomingCustomers + 1);
    assert.equal(after.reservation.upcomingCustomers, before.reservation.upcomingCustomers + 1);
    assert.equal(typeof after.offer_payment.schedulerEnabled, 'boolean');
    assert.equal(typeof after.reservation.schedulerEnabled, 'boolean');
    assert.ok(after.legacyAsOf);
    // Cached for a minute: a new open reservation does not show until the cache is cleared.
    await Reservation.create({ ...reservationBase, userId: noEmail, offerSlug: 'summary-d', offerSnapshot: { title: 'Summary D' } });
    assert.equal((await request('/api/auto-reply/reminder-work-summary')).data.reservation.upcomingCustomers, after.reservation.upcomingCustomers);
    assert.equal((await read()).reservation.upcomingCustomers, after.reservation.upcomingCustomers + 1);
  } finally {
    clearCache();
    await Reservation.deleteMany({ offerSlug: /^summary-/ });
    await Invoice.collection.deleteMany({ _id: { $in: invoices } });
    await Order.collection.deleteMany({ _id: { $in: orders } });
    await User.collection.deleteMany({ _id: { $in: [good._id, paused._id, noEmail] } });
  }
});

test('actions API: admin only; lists every action; saves a move, archive and delete; reset restores the original', async () => {
  const list = await request('/api/auto-reply/actions');
  assert.equal(list.status, 200);
  assert.equal(list.data.actions.length, 178);
  assert.deepEqual(list.data.surfaces, ['Admin', 'Client', 'Website', 'System']);
  assert.equal((await request('/api/auto-reply/actions', 'GET', member)).status, 403);
  assert.equal((await request('/api/auto-reply/actions/A01', 'PUT', member, 'admin', { archived: true })).status, 403);
  assert.equal((await request('/api/auto-reply/actions/A01', 'PUT', admin, 'editor', { archived: true })).status, 403);
  assert.equal((await request('/api/auto-reply/actions/Z99', 'PUT', admin, 'admin', { archived: true })).status, 404);
  const original = list.data.actions.find(row => row.id === 'A01');
  const moved = await request('/api/auto-reply/actions/A01', 'PUT', admin, 'admin', { surface: 'Website', category: 'Orders' });
  assert.equal(moved.status, 200, moved.error);
  assert.equal(moved.data.surface, 'Website');
  assert.equal(moved.data.category, 'Orders');
  assert.equal(moved.data.changed, true);
  const archived = await request('/api/auto-reply/actions/A01', 'PUT', admin, 'admin', { archived: true });
  assert.equal(archived.data.archived, true);
  const deleted = await request('/api/auto-reply/actions/A01', 'PUT', admin, 'admin', { deleted: true });
  assert.equal(deleted.data.deleted, true);
  const reset = await request('/api/auto-reply/actions/A01', 'PUT', admin, 'admin', { reset: true });
  assert.equal(reset.data.surface, original.surface);
  assert.equal(reset.data.category, original.category);
  assert.equal(reset.data.archived, false);
  assert.equal(reset.data.deleted, false);
  assert.equal(reset.data.changed, false);
  assert.equal((await request('/api/auto-reply/actions/A01', 'PUT', admin, 'admin', { surface: 'Other' })).status, 400);
});

test('browser: Communication → Actions → Where and Category change in the row; Manage menu archives, deletes, restores and resets', { timeout: 120000 }, async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(websiteBase);
    await openPanel(page, '?panel=actions');
    const region = page.getByRole('region', { name: 'Actions list' });
    for (const name of ['All', 'Admin panel', 'Client portal', 'Website', 'System', 'Archived', 'Deleted']) await region.getByRole('tab', { name: new RegExp(`^${name}`) }).waitFor();
    const endpoint = '/api/admin/my-settings';
    const rowOf = () => region.locator('tbody tr', { hasText: endpoint });
    const tab = name => region.getByRole('tab', { name: new RegExp(`^${name}`) });
    const openMenu = async () => { await rowOf().getByRole('button', { name: /^Manage / }).click(); return page.getByRole('menu', { name: 'Manage A01' }); };
    await region.getByRole('table', { name: 'Actions table' }).waitFor();
    assert.ok(await region.getByRole('columnheader', { name: /Endpoint/ }).count());
    await tab('Admin panel').click();
    await rowOf().waitFor();
    // Where: change it right in the row.
    await rowOf().getByRole('combobox', { name: 'Where A01' }).selectOption('Website');
    await region.getByRole('status').getByText('Moved to Website.').waitFor();
    assert.equal(await rowOf().count(), 0, 'moved action leaves the Admin view');
    await tab('Website').click();
    await rowOf().waitFor();
    assert.match(await rowOf().innerText(), /Changed/);
    // Category: click the cell, type, press Enter.
    await rowOf().getByRole('button', { name: 'Admin settings' }).click();
    await rowOf().getByLabel('Category for A01').fill('Browser test');
    await rowOf().getByLabel('Category for A01').press('Enter');
    await region.getByRole('status').getByText('Category saved.').waitFor();
    assert.match(await rowOf().innerText(), /Browser test/);
    // Manage menu: Escape closes it.
    let menu = await openMenu();
    await menu.waitFor();
    await page.keyboard.press('Escape');
    await menu.waitFor({ state: 'detached' });
    // Archive from the menu, then restore from Archived.
    menu = await openMenu();
    await menu.getByRole('menuitem', { name: /^Archive/ }).click();
    await region.getByRole('status').getByText('Action archived.').waitFor();
    assert.equal(await rowOf().count(), 0);
    await tab('Archived').click();
    await rowOf().waitFor();
    menu = await openMenu();
    await menu.getByRole('menuitem', { name: /^Restore/ }).click();
    await region.getByRole('status').getByText('Action restored.').waitFor();
    assert.equal(await rowOf().count(), 0, 'restored action leaves Archived');
    // Delete from the list, then restore from Deleted.
    await tab('Website').click();
    await rowOf().waitFor();
    menu = await openMenu();
    await menu.getByRole('menuitem', { name: 'Delete from list' }).click();
    await region.getByRole('status').getByText('Action removed from the list. The code stays.').waitFor();
    await tab('Deleted').click();
    await rowOf().waitFor();
    menu = await openMenu();
    await menu.getByRole('menuitem', { name: 'Restore' }).click();
    await region.getByRole('status').getByText('Action restored.').waitFor();
    // Reset to original: back under Admin with its original category and no Changed badge.
    await tab('Website').click();
    await rowOf().waitFor();
    menu = await openMenu();
    await menu.getByRole('menuitem', { name: 'Reset to original' }).click();
    await region.getByRole('status').getByText('Action reset to its original place.').waitFor();
    await tab('Admin panel').click();
    await rowOf().waitFor();
    const text = await rowOf().innerText();
    assert.match(text, /Admin settings/);
    assert.doesNotMatch(text, /Browser test|Changed/);
  } finally {
    await browser.close();
  }
});
