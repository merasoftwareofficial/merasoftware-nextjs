// Lightweight browser + API integration. Actual forms, offer components, route
// validation and JSON storage; only the authenticated identity is a test fixture.
import assert from 'node:assert/strict';
import http from 'node:http';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium } from 'playwright';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const folder = path.join(root, 'test-results', `offers-component-${Date.now()}`);
mkdirSync(folder, { recursive: true });
const authSource = `
import {AsyncLocalStorage} from 'node:async_hooks';
import {atLeast} from '${path.join(root, 'src/lib/roles.ts').replaceAll('\\', '/')}';
export {atLeast}; export const identity = new AsyncLocalStorage();
export class AuthError extends Error { constructor(message,status){super(message);this.status=status} }
export async function requireRole(minimum){const role=identity.getStore();if(!role)throw new AuthError('Sign in',401);if(!atLeast(role,minimum))throw new AuthError('Not allowed',403);return {role};}
`;
const serverEntry = `
import {PATCH} from '${path.join(root, 'src/app/api/offers/route.ts').replaceAll('\\', '/')}';
import {identity} from '@/lib/auth';
import {settingsRepo} from '@/lib/repo';
import {resolvedOffers,publishedOffers,DEFAULT_UNIVERSAL_TERMS,DEFAULT_OFFER_LISTING} from '@/lib/offers';
export const handle=(request,role)=>identity.run(role,()=>PATCH(request));
export async function state(){const s=await settingsRepo.get();return {offers:resolvedOffers(s.offers),published:publishedOffers(s.offers),terms:s.offerUniversalTerms??DEFAULT_UNIVERSAL_TERMS,listing:s.offerListing??DEFAULT_OFFER_LISTING};}
`;
await build({ stdin: { contents: serverEntry, resolveDir: root, sourcefile: 'offer-api-fixture.ts' }, outfile: path.join(folder, 'server.cjs'), platform: 'node', format: 'cjs', bundle: true, packages: 'external', tsconfig: path.join(root, 'tsconfig.json'), plugins: [{ name: 'test-identity-and-storage', setup(builder) {
  builder.onResolve({ filter: /^@\/lib\/auth$/ }, () => ({ path: 'auth', namespace: 'test' }));
  builder.onLoad({ filter: /^auth$/, namespace: 'test' }, () => ({ contents: authSource, loader: 'ts', resolveDir: root }));
  builder.onResolve({ filter: /^@\/lib\/sales-catalogue-server$/ }, () => ({ path: 'sales-admin', namespace: 'test' }));
  builder.onLoad({ filter: /^sales-admin$/, namespace: 'test' }, () => ({ contents: `import {requireRole} from '@/lib/auth';export const requireSalesAdmin=()=>requireRole('admin');`, loader: 'ts', resolveDir: root }));
  builder.onResolve({ filter: /^@\/lib\/repo$/ }, () => ({ path: 'repo', namespace: 'test' }));
  builder.onLoad({ filter: /^repo$/, namespace: 'test' }, () => ({ contents: `import {jsonDriver} from '${path.join(root, 'src/lib/repo/json-driver.ts').replaceAll('\\', '/')}';export const settingsRepo=jsonDriver.settings;`, loader: 'ts', resolveDir: root }));
} }] });
const clientEntry = `
import React from 'react';import{createRoot}from'react-dom/client';
import{OffersManager}from'@/app/admin/content/offers-manager';
import{OfferPreview}from'@/components/campaign/offer-preview';
import{PublicInteraction}from'@/components/campaign/public-interaction/page-content';
import{resolvedTerms}from'@/lib/offers';
import '${path.join(root, 'src/app/globals.css').replaceAll('\\', '/')}';
fetch('/state').then(r=>r.json()).then(s=>{const admin=location.pathname==='/admin';const section=new URLSearchParams(location.search).get('section')||'details';const slug=location.pathname.split('/')[2];const offer=s.published.find(o=>o.slug===slug);createRoot(document.getElementById('app')).render(admin?<main style={{padding:24,maxWidth:1100,margin:'auto'}}><OffersManager initialOffers={s.offers} initialTerms={s.terms} initialListing={s.listing} section={section}/></main>:offer?<PublicInteraction offer={offer} terms={resolvedTerms(offer,s.terms)}/>:<main><h1>{s.listing.title}</h1>{s.published.map(o=><a href={'/offer/'+o.slug} key={o.slug}><OfferPreview offer={o}/><h2>{o.title}</h2></a>)}</main>);});
`;
await build({ stdin: { contents: clientEntry, resolveDir: root, sourcefile: 'offer-ui-fixture.tsx', loader: 'tsx' }, outfile: path.join(folder, 'client.js'), bundle: true, platform: 'browser', conditions: ['style', 'browser'], jsx: 'automatic', tsconfig: path.join(root, 'tsconfig.json'), plugins: [{ name: 'plain-test-link', setup(builder) {
  builder.onResolve({ filter: /^@\/components\/link$/ }, () => ({ path: 'link', namespace: 'test' }));
  builder.onLoad({ filter: /^link$/, namespace: 'test' }, () => ({ contents: `import React from 'react';export default function Link(props){return <a {...props}/>}`, loader: 'tsx', resolveDir: root }));
} }] });
const previous = process.cwd();
process.chdir(folder);
const api = createRequire(import.meta.url)(path.join(folder, 'server.cjs'));
const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);
    if (url.pathname === '/api/time') { response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify({ now: Date.now() })); return; }
    if (url.pathname === '/api/offers') {
      const chunks = []; for await (const chunk of request) chunks.push(chunk);
      const result = await api.handle(new Request(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: Buffer.concat(chunks).toString() }), request.headers['x-test-role']);
      response.writeHead(result.status, { 'Content-Type': 'application/json' }); response.end(await result.text()); return;
    }
    if (url.pathname === '/state') { response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify(await api.state())); return; }
    if (url.pathname === '/client.js' || url.pathname === '/client.css') { response.setHeader('Content-Type', url.pathname.endsWith('css') ? 'text/css' : 'text/javascript'); response.end(readFileSync(path.join(folder, url.pathname.slice(1)))); return; }
    if (url.pathname.startsWith('/offer/')) {
      const state = await api.state();
      if (!state.published.some(o => o.slug === url.pathname.split('/')[2])) { response.statusCode = 404; response.end('Not found'); return; }
    }
    response.setHeader('Content-Type', 'text/html'); response.end('<!doctype html><html><head><link rel="stylesheet" href="/client.css"></head><body><div id="app"></div><script src="/client.js"></script></body></html>');
  } catch (error) { response.statusCode = 500; response.end(String(error)); }
});
let browser;
try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ timezoneId: 'America/New_York', extraHTTPHeaders: { 'x-test-role': 'admin' } });
  const page = await context.newPage();
  const errors = []; page.on('pageerror', error => { errors.push(error.message); console.error('Browser error:', error.message); });
  await page.goto(origin + '/admin');
  await page.getByRole('button', { name: 'New offer +', exact: true }).click();
  await page.getByLabel('Offer name', { exact: true }).fill('Diwali Launch');
  await page.getByLabel('URL slug', { exact: true }).fill('diwali');
  await page.getByLabel('Main heading', { exact: true }).fill('Launch your business');
  await page.getByLabel('Short description', { exact: true }).fill('A focused business launch package.');
  await page.getByLabel('Main price (₹)', { exact: true }).fill('10000');
  await page.getByLabel('Normal discount price (₹)', { exact: true }).fill('5000');
  await page.getByLabel('Offer price (₹)', { exact: true }).fill('999');
  await page.getByLabel("What's included", { exact: true }).fill('Website setup\nGoogle profile\nSocial launch post');
  await page.getByLabel('Expires at (India time / IST)', { exact: true }).fill('2030-10-20T23:59');
  await page.getByLabel('Offer-specific terms', { exact: true }).fill('Offer-specific launch term');
  await page.getByRole('button', { name: 'Preview changes ↗', exact: true }).click();
  assert(await page.getByRole('dialog', { name: 'Offer preview', exact: true }).getByRole('heading', { name: 'Launch your business', exact: true }).isVisible());
  await page.getByRole('button', { name: 'Close preview', exact: true }).click();
  async function save(label) {
    const pending = page.waitForResponse(r => r.url().endsWith('/api/offers') && r.request().method() === 'PATCH');
    await page.getByRole('button', { name: label, exact: true }).click();
    const response = await pending; assert.equal(response.status(), 200, await response.text()); return response.json();
  }
  const draft = await save('Save offer');
  console.log('Draft saved:', draft.slug);
  await page.screenshot({ path: path.join(folder, 'admin-after-save.png'), fullPage: true });
  assert.equal(draft.endsAt, '2030-10-20T18:29:59.999Z');
  assert.equal(await page.getByLabel('Expires at (India time / IST)', { exact: true }).inputValue(), '2030-10-20T23:59');
  assert.equal((await context.request.get(origin + '/offer/diwali')).status(), 404);
  await page.getByLabel('Status', { exact: true }).selectOption('published');
  const published = await save('Save & publish');
  const duplicate = await context.request.patch(origin + '/api/offers', { data: { kind: 'offer', offer: published, creating: true } }); assert.equal(duplicate.status(), 409);
  const denied = await context.request.patch(origin + '/api/offers', { headers: { 'x-test-role': 'moderator' }, data: { kind: 'offer', offer: published, creating: false } }); assert.equal(denied.status(), 403);
  const editorDenied = await context.request.patch(origin + '/api/offers', { headers: { 'x-test-role': 'editor' }, data: { kind: 'offer', offer: published, creating: false } }); assert.equal(editorDenied.status(), 403);
  const invalid = await context.request.patch(origin + '/api/offers', { data: { kind: 'offer', offer: { ...published, contactHref: 'javascript:alert(1)' }, creating: false } }); assert.equal(invalid.status(), 400);
  const publicPage = await context.newPage();
  await publicPage.goto(origin + '/offer/diwali');
  await publicPage.getByRole('heading', { name: 'Launch your business', exact: true }).waitFor();
  const before = await publicPage.getByRole('timer').innerText(); await publicPage.waitForTimeout(1200); assert.notEqual(await publicPage.getByRole('timer').innerText(), before);
  await context.request.patch(origin + '/api/offers', { data: { kind: 'terms', terms: ['Universal launch term'] } });
  await publicPage.reload(); await publicPage.getByRole('button', { name: 'T&C', exact: true }).click();
  const terms = await publicPage.getByRole('dialog').innerText(); assert(terms.includes('Universal launch term') && terms.includes('Offer-specific launch term') && terms.includes('20 October 2030')); await publicPage.keyboard.press('Escape');
  for (const width of [1440, 390, 320]) {
    await publicPage.setViewportSize({ width, height: 950 });
    await publicPage.goto(origin + '/offer/diwali'); await publicPage.getByRole('timer').waitFor();
    assert(await publicPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await publicPage.screenshot({ path: path.join(folder, `detail-${width}.png`), fullPage: true });
  }
  await page.getByLabel('Status', { exact: true }).selectOption('archived'); await save('Save offer');
  assert.equal((await context.request.get(origin + '/offer/diwali')).status(), 404);
  await page.reload(); assert((await page.locator('main').innerText()).includes('archived'));
  assert.deepEqual(errors, []);
  console.log('PASS: actual offer form, unsaved preview, validated API, JSON persistence, draft/publish/archive flow, role guard, combined T&C, live countdown and desktop/mobile layout.');
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
  process.chdir(previous);
}
