import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { build } from 'esbuild';
import { chromium } from 'playwright';

// Real proxy + backend routes + MongoDB + the real panel in a browser. Only the website's offer feed is a fixture.
const root = process.cwd();
const backend = createRequire(path.resolve(root, '../backend/package.json'));
const mongoose = backend('mongoose'), express = backend('express'), jwt = backend('jsonwebtoken');
const { MongoMemoryServer } = backend('mongodb-memory-server');
const User = backend('./models/userModel'), Lead = backend('./models/leadModel'), Target = backend('./models/offerTargetModel');
let db, backendServer, websiteServer, websiteBase, qa, admin, member, rajan;
const SLUG = 'digital-dhamaka';
const qaDir = path.join(root, '.next', 'offer-targets-qa');
const nativeFetch = globalThis.fetch;
async function request(pathname, method = 'GET', user = admin, websiteRole = 'admin', body) {
  const url = new URL(pathname, 'http://website.test');
  const response = await qa.context.run({ session: user ? { user: { role: websiteRole }, portalRoles: user.roles } : null, token: user ? jwt.sign({ _id: String(user._id), role: user.roles[0] }, process.env.TOKEN_SECRET_KEY) : undefined },
    () => qa.routes[method](new Request(url, { method, ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }) }), { params: Promise.resolve({ path: url.pathname.split('/').slice(3).filter(Boolean) }) }));
  return { status: response.status, ...await response.json() };
}
before(async () => {
  process.env.TOKEN_SECRET_KEY = 'website-offer-target-isolated-secret';
  process.env.PORTFOLIO_WEBSITE_URL = 'https://website.example.test';
  process.env.PORTFOLIO_INTEGRATION_SECRET = 'isolated-test-secret-32-characters-long';
  globalThis.fetch = async (url, options) => String(url).includes('/api/offers/live')
    ? new Response(JSON.stringify({ offers: [{ slug: SLUG, title: 'Digital Dhamaka', status: 'published', endsAt: new Date(Date.now() + 86_400_000).toISOString() }] }), { status: 200 })
    : nativeFetch(url, options);
  mkdirSync(qaDir, { recursive: true });
  const auth = path.join(qaDir, 'auth.ts'), headers = path.join(qaDir, 'headers.ts');
  writeFileSync(auth, `import {AsyncLocalStorage} from 'node:async_hooks';export const context=new AsyncLocalStorage<any>();export class AuthError extends Error{constructor(message:string,public status:number){super(message)}}export const getSession=async()=>context.getStore()?.session||null;`);
  writeFileSync(headers, `import {context} from './auth';export const cookies=async()=>({get:()=>context.getStore()?.token?{value:context.getStore().token}:undefined});`);
  await build({ absWorkingDir: root, bundle: true, platform: 'node', format: 'cjs', packages: 'external', outfile: path.join(qaDir, 'server.cjs'), tsconfig: path.join(root, 'tsconfig.json'),
    stdin: { contents: `import * as routes from './src/app/api/offer-targets/[[...path]]/route';export {routes};export {context} from ${JSON.stringify(auth)};`, resolveDir: root, loader: 'ts' },
    plugins: [{ name: 'fixtures', setup(b) { b.onResolve({ filter: /^@\/lib\/auth$/ }, () => ({ path: auth })); b.onResolve({ filter: /^next\/headers$/ }, () => ({ path: headers })); b.onResolve({ filter: /^server-only$/ }, () => ({ path: 'empty', namespace: 'fixture' })); b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export {}' })); } }] });
  await build({ absWorkingDir: root, bundle: true, outfile: path.join(qaDir, 'panel.js'), jsx: 'automatic', tsconfig: path.join(root, 'tsconfig.json'), loader: { '.module.css': 'local-css' }, define: { 'process.env.NODE_ENV': '"production"', 'process.env': '{}' },
    stdin: { contents: `import {createRoot} from 'react-dom/client';import {OfferTargetsPanel} from './src/app/admin/offers/targets/[slug]/offer-targets-panel';const ended=location.search.includes('ended');createRoot(document.getElementById('root')!).render(<OfferTargetsPanel slug="${SLUG}" running={!ended} ended={ended}/>);`, resolveDir: root, loader: 'tsx' } });
  db = await MongoMemoryServer.create(); process.env.MONGODB_URI = db.getUri();
  await mongoose.connect(db.getUri(), { dbName: 'website-offer-target-isolated' });
  await Target.init();
  [admin, member, rajan] = await User.create([{ name: 'Admin', email: 'admin@example.test', roles: ['admin'] }, { name: 'Member', email: 'member@example.test', roles: ['member'] }, { name: 'Rajan Client', email: 'rajan@example.test', phone: '9876500000', roles: ['customer'] }]);
  await Lead.create([
    { name: 'Rajan Client', email: 'rajan@example.test', phone: '9876500000', status: 'Won', convertedToUserId: rajan._id, clientBehaviour: 'Tough' },
    { name: 'Lazy Lead', phone: '9000000001', status: 'Lazy' },
    { name: 'Unhappy Lead', phone: '9000000002', status: 'Unhappy' },
    { name: 'Dead Lead', phone: '9000000003', status: 'Dead' },
  ]);
  const app = express(); app.use(express.json()); app.use(backend('cookie-parser')()); app.use('/api/offer-targets', backend('./routes/offerTargets'));
  await new Promise(resolve => { backendServer = app.listen(0, '127.0.0.1', resolve); });
  process.env.PORTAL_API_URL = `http://127.0.0.1:${backendServer.address().port}`;
  qa = createRequire(import.meta.url)(path.join(qaDir, 'server.cjs'));
  websiteServer = http.createServer(async (req, res) => {
    try {
      if (['/panel.js', '/panel.css'].includes(req.url)) { res.setHeader('Content-Type', req.url.endsWith('.js') ? 'application/javascript' : 'text/css'); return res.end(readFileSync(path.join(qaDir, req.url.slice(1)))); }
      if (req.url.startsWith('/api/')) {
        let body = ''; for await (const chunk of req) body += chunk;
        const result = await request(req.url, req.method, admin, 'admin', body || undefined);
        res.statusCode = result.status; res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify(result));
      }
      res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/panel.css"></head><body><div id="root"></div><script src="/panel.js"></script></body></html>');
    } catch (error) { res.statusCode = 500; res.end(error.message); }
  });
  await new Promise(resolve => websiteServer.listen(0, '127.0.0.1', resolve));
  websiteBase = `http://127.0.0.1:${websiteServer.address().port}`;
});
after(async () => { globalThis.fetch = nativeFetch; if (websiteServer) await new Promise(resolve => websiteServer.close(resolve)); if (backendServer) await new Promise(resolve => backendServer.close(resolve)); await mongoose.disconnect(); await db?.stop(); });

test('proxy enforces both admin roles and its allow-list', async () => {
  const list = `/api/offer-targets/offers/${SLUG}`;
  assert.equal((await request(list)).status, 200);
  assert.equal((await request(list, 'GET', null)).status, 401);
  assert.equal((await request(list, 'GET', member)).status, 403);
  assert.equal((await request(list, 'GET', admin, 'editor')).status, 403);
  assert.equal((await request('/api/offer-targets/unknown')).status, 404);
  assert.equal((await request('/api/offer-targets/people/invalid/stage', 'PATCH', admin, 'admin', {})).status, 404);
});
test('browser: choose a client by behaviour and leads one by one; stage, behaviour, Bought; ended offer; phone width', { timeout: 120000 }, async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(websiteBase);
    await page.getByText('No one in this offer yet.').waitFor();
    await page.getByRole('button', { name: 'Add people' }).click();
    const add = page.getByRole('region', { name: 'Add people' });
    await add.getByText('Rajan Client').waitFor();
    await add.getByRole('checkbox', { name: /^Tough/ }).check();
    await add.getByRole('button', { name: 'Select all (1)' }).click();
    await add.getByRole('button', { name: 'Leads' }).click();
    const dead = add.getByRole('listitem').filter({ hasText: 'Dead Lead' });
    assert.equal(await dead.getByRole('checkbox').isDisabled(), true, 'a Dead person cannot be chosen');
    await add.getByRole('listitem').filter({ hasText: 'Lazy Lead' }).getByRole('checkbox').check();
    await add.getByRole('listitem').filter({ hasText: 'Unhappy Lead' }).getByRole('checkbox').check();
    await add.getByText(/1 chosen person is Unhappy/).waitFor();
    await add.getByRole('button', { name: 'Add 3 to offer' }).click();
    await page.getByRole('status').filter({ hasText: '3 added.' }).waitFor();
    const counts = page.getByRole('region', { name: 'Counts for this offer' });
    assert.match(await counts.innerText(), /3\s*People/);
    assert.match(await counts.innerText(), /1\s*Existing clients/);
    assert.match(await counts.innerText(), /2\s*Leads/);

    const client = page.getByRole('listitem').filter({ hasText: 'Rajan Client' });
    await client.getByLabel('Behaviour').selectOption('Active');
    await page.waitForFunction(() => document.querySelector('select:not([disabled])'));
    const won = await Lead.findOne({ convertedToUserId: rajan._id }).lean();
    for (let i = 0; i < 40 && (await Lead.findById(won._id).lean()).clientBehaviour !== 'Active'; i++) await new Promise(resolve => setTimeout(resolve, 100));
    assert.equal((await Lead.findById(won._id).lean()).clientBehaviour, 'Active');

    const lazy = page.getByRole('listitem').filter({ hasText: 'Lazy Lead' });
    await lazy.getByLabel('Offer stage').selectOption('Positive');
    await counts.getByText('Positive').locator('..').filter({ hasText: '1' }).waitFor();
    assert.equal((await Lead.findOne({ name: 'Lazy Lead' }).lean()).status, 'Lazy', "the lead's own stage stays");
    await lazy.getByRole('button', { name: 'Bought this offer' }).click();
    await page.getByRole('alert').filter({ hasText: /Convert this lead/ }).waitFor();
    await client.getByRole('button', { name: 'Bought this offer' }).click();
    await counts.getByText('Matured').locator('..').filter({ hasText: '1' }).waitFor();
    assert.equal((await Lead.findById(won._id).lean()).status, 'Won');
    await client.getByRole('button', { name: 'Bought this offer' }).waitFor({ state: 'detached' });

    await page.getByRole('combobox', { name: 'Stage' }).first().selectOption('Won');
    assert.equal(await page.getByRole('listitem').count(), 1);
    await page.getByRole('combobox', { name: 'Stage' }).first().selectOption('all');

    await page.setViewportSize({ width: 390, height: 800 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'no sideways scroll at phone width');

    await page.goto(`${websiteBase}/?ended`);
    await page.getByText(/Offer ended/).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Add people' }).count(), 0);
    await page.getByRole('listitem').filter({ hasText: 'Rajan Client' }).waitFor();
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
