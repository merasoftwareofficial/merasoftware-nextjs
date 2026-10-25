// Lightweight browser + API integration for package offers (src/docs/dynamic-offers.md).
// Actual offer/package forms, offer card and the real /api/offers, /api/packages and
// /api/packages/offer-links handlers with JSON storage. Only the signed-in identity and the
// portal package catalogue are test fixtures; nothing touches a real database or network.
import assert from 'node:assert/strict';
import http from 'node:http';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium } from 'playwright';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = file => path.join(root, file).replaceAll('\\', '/');
const folder = path.join(root, 'test-results', `offers-component-${Date.now()}`);
mkdirSync(folder, { recursive: true });
const authSource = `
import {AsyncLocalStorage} from 'node:async_hooks';
import {atLeast} from '${src('src/lib/roles.ts')}';
export {atLeast}; export const identity = new AsyncLocalStorage();
export class AuthError extends Error { constructor(message,status){super(message);this.status=status} }
export async function requireRole(minimum){const role=identity.getStore();if(!role)throw new AuthError('Sign in',401);if(!atLeast(role,minimum))throw new AuthError('Not allowed',403);return {role};}
`;
// The portal side: package catalogue, package save and the offer-links route (backend helpers/salesPackages.js).
const catalogueSource = `
import {requireRole, AuthError} from '@/lib/auth';
import {settingsRepo} from '@/lib/repo';
import {resolvedOffers} from '@/lib/offers';
export const store = { packages: {}, linkCalls: [], failLink: false };
export const requireSalesAdmin = () => requireRole('admin');
const quoted = item => ({ ...item, quoteKey: 'k-' + item.id, quote: { regularPrice: item.regularPrice, discountAmount: 0, finalPrice: item.discountedPrice, offer: null, terms: item.terms } });
export async function readSalesCatalogue(admin) {
  if (admin) await requireSalesAdmin();
  const settings = await settingsRepo.get();
  return { packages: Object.values(store.packages).map(quoted), offers: resolvedOffers(settings.offers), plans: [], categories: [{ category: 'standard_websites', label: 'Standard Websites', status: 'active', sortOrder: 1 }] };
}
export async function salesBackend(admin, body, path = 'sales-packages') {
  await requireSalesAdmin();
  if (!body) return readSalesCatalogue(admin);
  if (path === 'sales-packages') {
    const exists = !!store.packages[body.item.id];
    if (body.creating === exists) throw new AuthError(body.creating ? 'This package ID already exists' : 'Package not found', 409);
    store.packages[body.item.id] = { ...body.item };
    return store.packages[body.item.id];
  }
  if (path === 'sales-packages/offer-links') {
    store.linkCalls.push(body);
    if (store.failLink) throw new AuthError('Portal unavailable', 503);
    for (const item of Object.values(store.packages)) {
      if (body.packageIds.includes(item.id)) item.offerSlug = body.offerSlug;
      else if (item.offerSlug === body.offerSlug) item.offerSlug = '';
    }
    return body;
  }
  throw new AuthError('Unknown path', 404);
}
`;
const serverEntry = `
import {PATCH as offers} from '${src('src/app/api/offers/route.ts')}';
import {GET as packagesGet, PATCH as packagesPatch} from '${src('src/app/api/packages/route.ts')}';
import {PATCH as links} from '${src('src/app/api/packages/offer-links/route.ts')}';
import {identity} from '@/lib/auth';
import {settingsRepo} from '@/lib/repo';
import {store, readSalesCatalogue} from '@/lib/sales-catalogue-server';
import {resolvedOffers,publishedOffers,DEFAULT_UNIVERSAL_TERMS,DEFAULT_OFFER_LISTING} from '@/lib/offers';
const routes = { 'PATCH /api/offers': offers, 'GET /api/packages': packagesGet, 'PATCH /api/packages': packagesPatch, 'PATCH /api/packages/offer-links': links };
export const handle = (key, request, role) => identity.run(role, () => routes[key](request));
export const seedOffer = offer => settingsRepo.saveOffer(offer, true);
export {store};
export async function state() {
  const s = await settingsRepo.get();
  return { offers: resolvedOffers(s.offers), published: publishedOffers(s.offers), terms: s.offerUniversalTerms ?? DEFAULT_UNIVERSAL_TERMS, listing: s.offerListing ?? DEFAULT_OFFER_LISTING, catalogue: await identity.run('admin', () => readSalesCatalogue(true)) };
}
`;
const virtual = (builder, name, filter, contents, loader = 'ts') => {
  builder.onResolve({ filter }, () => ({ path: name, namespace: 'test' }));
  builder.onLoad({ filter: new RegExp(`^${name}$`), namespace: 'test' }, () => ({ contents, loader, resolveDir: root }));
};
await build({ stdin: { contents: serverEntry, resolveDir: root, sourcefile: 'offer-api-fixture.ts' }, outfile: path.join(folder, 'server.cjs'), platform: 'node', format: 'cjs', bundle: true, packages: 'external', tsconfig: path.join(root, 'tsconfig.json'), plugins: [{ name: 'fixtures', setup(builder) {
  virtual(builder, 'server-only', /^server-only$/, 'export {};');
  virtual(builder, 'auth', /^@\/lib\/auth$/, authSource);
  virtual(builder, 'sales', /^@\/lib\/sales-catalogue-server$/, catalogueSource);
  virtual(builder, 'repo', /^@\/lib\/repo$/, `import {jsonDriver} from '${src('src/lib/repo/json-driver.ts')}';export const settingsRepo=jsonDriver.settings;`);
} }] });
const clientEntry = `
import React from 'react';import{createRoot}from'react-dom/client';
import{OffersManager}from'@/app/admin/offers/offers-manager';
import{PackagesManager}from'@/app/admin/packages/packages-manager';
import{PublicInteraction}from'@/components/campaign/public-interaction/page-content';
import{resolvedTerms}from'@/lib/offers';
import '${src('src/app/globals.css')}';
fetch('/state').then(r=>r.json()).then(s=>{const q=new URLSearchParams(location.search);const slug=location.pathname.split('/')[2];const offer=s.published.find(o=>o.slug===slug);
createRoot(document.getElementById('app')).render(location.pathname==='/admin/offers'?<main style={{padding:24,maxWidth:1100,margin:'auto'}}><OffersManager key={location.search} initialOffers={s.offers} initialTerms={s.terms} initialListing={s.listing} section={q.get('section')||'settings'} initialOfferSlug={q.get('offer')||undefined} createNew={q.get('new')==='1'}/></main>
:location.pathname==='/admin/packages'?<main style={{padding:24,maxWidth:1100,margin:'auto'}}><PackagesManager initial={s.catalogue} initialPages={[]}/></main>
:offer?<PublicInteraction offer={offer} terms={resolvedTerms(offer,s.terms)}/>:<main>Not found</main>);});
`;
await build({ stdin: { contents: clientEntry, resolveDir: root, sourcefile: 'offer-ui-fixture.tsx', loader: 'tsx' }, outfile: path.join(folder, 'client.js'), bundle: true, platform: 'browser', conditions: ['style', 'browser'], jsx: 'automatic', tsconfig: path.join(root, 'tsconfig.json'), plugins: [{ name: 'browser-fixtures', setup(builder) {
  virtual(builder, 'link', /^@\/components\/link$/, `import React from 'react';export default function Link(props){return <a {...props}/>}`, 'tsx');
  virtual(builder, 'navigation', /^@\/components\/loading\/navigation$/, `export const useNavigate=()=>({pending:false,push:h=>location.assign(h),replace:h=>location.assign(h),refresh(){},assign:h=>location.assign(h)});`);
} }] });
const previous = process.cwd();
process.chdir(folder);
const api = createRequire(import.meta.url)(path.join(folder, 'server.cjs'));
const pkg = (id, patch = {}) => ({ id, name: id === 'starter' ? 'Google Starter' : id, description: 'Package description', status: 'published', category: 'standard_websites', regularPrice: 4000, discountedPrice: 3500, offerExtraPrice: 0, offerSlug: '', inclusions: ['Business profile setup', 'Search and Maps listing'], terms: ['Package term: one revision.'], linkedPlanIds: [], order: 0, pages: [], ...patch });
for (const item of [pkg('starter'), pkg('plus', { offerExtraPrice: 2000 }), pkg('gbp'), pkg('old-pkg', { offerSlug: 'legacy' })]) api.store.packages[item.id] = item;
const legacy = { slug: 'legacy', status: 'published', title: 'Legacy offer', eyebrow: 'OLD', heading: 'Old heading', headingHighlight: '', description: 'An offer saved before package offers.', supportingLine: '', subheading: 'Included', tagline: 'Tagline', badge: 'Badge', mainPrice: 4000, discountPrice: 3500, offerPrice: 3000, priceDescription: 'One-time', endsAt: '2030-12-31T23:59:59+05:30', inclusions: ['Hand-written point'], termsMode: 'combined', terms: ['Legacy term'], ctaLabel: 'Enquire', contactHref: 'mailto:hello@example.com', order: 9, applicableCategories: ['standard_websites'], packageIds: [], pricingRule: 'percentage', benefitValue: 25 };
await api.seedOffer(legacy);
const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);
    if (url.pathname === '/api/time') { response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify({ now: Date.now() })); return; }
    const key = `${request.method} ${url.pathname}`;
    if (url.pathname.startsWith('/api/')) {
      const chunks = []; for await (const chunk of request) chunks.push(chunk);
      const result = await api.handle(key, new Request(url, { method: request.method, headers: { 'Content-Type': 'application/json' }, ...(request.method === 'GET' ? {} : { body: Buffer.concat(chunks).toString() }) }), request.headers['x-test-role']);
      response.writeHead(result.status, Object.fromEntries(result.headers)); response.end(await result.text()); return;
    }
    if (url.pathname === '/state') { response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify(await api.state())); return; }
    if (url.pathname === '/client.js' || url.pathname === '/client.css') { response.setHeader('Content-Type', url.pathname.endsWith('css') ? 'text/css' : 'text/javascript'); response.end(readFileSync(path.join(folder, url.pathname.slice(1)))); return; }
    response.setHeader('Content-Type', 'text/html'); response.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/client.css"></head><body><div id="app"></div><script src="/client.js"></script></body></html>');
  } catch (error) { response.statusCode = 500; response.end(String(error?.stack || error)); }
});
let browser;
try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ timezoneId: 'America/New_York', extraHTTPHeaders: { 'x-test-role': 'admin' } });
  const page = await context.newPage();
  const errors = []; page.on('pageerror', error => { errors.push(error.message); console.error('Browser error:', error.message); });
  page.on('dialog', dialog => dialog.accept());
  const offerApi = (offer, creating = false, role) => context.request.patch(origin + '/api/offers', { data: { kind: 'offer', offer, creating }, ...(role ? { headers: { 'x-test-role': role } } : {}) });
  const packageApi = item => context.request.patch(origin + '/api/packages', { data: { item, creating: false } });
  const state = async () => (await context.request.get(origin + '/state')).json();
  async function save(label) {
    const pending = page.waitForResponse(r => r.url().endsWith('/api/offers') && r.request().method() === 'PATCH');
    await page.getByRole('button', { name: label, exact: true }).click();
    const response = await pending; assert.equal(response.status(), 200, await response.text().catch(() => '')); return response;
  }

  // 1. A new offer starts from its package: struck prices, included work and terms are locked.
  await page.goto(origin + '/admin/offers?section=settings&new=1');
  const packageSelect = page.getByLabel('Package', { exact: true });
  await packageSelect.locator('option[value="starter"]').waitFor({ state: 'attached' });
  assert.equal(await packageSelect.locator('option[value="plus"]').evaluate(option => option.disabled), true, 'a package with an extra scope price cannot back an offer');
  await packageSelect.selectOption('starter');
  await page.locator('[class*="locked"]').getByText('Business profile setup', { exact: true }).waitFor();
  assert.equal(await page.getByLabel("What's included", { exact: true }).count(), 0, 'no hand-written included work');
  assert.equal(await page.getByLabel('Main price (₹)', { exact: true }).count(), 0, 'no hand-written struck prices');
  assert.equal(await page.getByText('Pricing rule', { exact: true }).count(), 0, 'fixed offer price only');
  await page.getByLabel('Offer name', { exact: true }).fill('Mega offer');
  await page.getByLabel('URL slug', { exact: true }).fill('mega');
  await page.getByLabel('Main heading', { exact: true }).fill('Get found on Google');
  await page.getByLabel('Short description', { exact: true }).fill('Your business on Google Search and Maps.');
  await page.getByLabel('Offer price (₹)', { exact: true }).fill('699');
  await page.getByText('Shown as 82% OFF the main price.', { exact: true }).waitFor();
  await page.screenshot({ path: path.join(folder, 'admin-new-offer.png'), fullPage: true });
  await page.getByLabel('Expires at (India time / IST)', { exact: true }).fill('2030-10-20T23:59');
  await save('Save offer'); await page.waitForURL(/offer=mega/);
  const draft = (await state()).offers.find(row => row.slug === 'mega');
  assert.equal(draft.packageId, 'starter'); assert.equal(draft.mainPrice, 4000); assert.equal(draft.discountPrice, 3500);
  assert.deepEqual(draft.inclusions, ['Business profile setup', 'Search and Maps listing']); assert.deepEqual(draft.terms, ['Package term: one revision.']);
  assert.equal(api.store.linkCalls.length, 0, 'a draft does not take the package');

  // 2. Publishing links the package through the existing offer-links route.
  await page.goto(origin + '/admin/offers?section=settings&offer=mega');
  await page.getByLabel('Status', { exact: true }).selectOption('published');
  await save('Save & publish');
  assert.deepEqual(api.store.linkCalls.at(-1), { offerSlug: 'mega', packageIds: ['starter'] });
  assert.equal(api.store.packages.starter.offerSlug, 'mega');

  // 3. One running offer per package; drafts may wait; the package and creation rules hold.
  const second = { ...draft, slug: 'mega-two', title: 'Mega two', status: 'published' };
  const busy = await offerApi(second, true); assert.equal(busy.status(), 409); assert.match((await busy.json()).error, /already has a running offer: "Mega offer"/);
  assert.equal((await offerApi({ ...second, status: 'draft' }, true)).status(), 200, 'a draft for a busy package is allowed');
  const withoutPackage = { ...draft }; delete withoutPackage.packageId;
  assert.equal((await offerApi({ ...withoutPackage, slug: 'no-package' }, true)).status(), 400, 'a new offer needs a package');
  assert.equal((await offerApi({ ...draft, status: 'published', packageId: 'gbp' })).status(), 400, 'the package is fixed after creation');
  assert.equal((await offerApi({ ...draft, status: 'published' }, false, 'editor')).status(), 403);

  // 4. Public card: % badge from the main price, package points and terms; the card keeps its height.
  const publicPage = await context.newPage(); publicPage.on('pageerror', error => errors.push(error.message));
  const cardHeight = async slug => { await publicPage.goto(origin + '/offer/' + slug); await publicPage.getByRole('timer').waitFor(); return publicPage.locator('section[aria-label]').filter({ has: publicPage.getByRole('timer') }).evaluate(node => node.querySelector('[class*="deal"]').getBoundingClientRect().height); };
  const legacyDeal = await cardHeight('legacy');
  assert.equal(await publicPage.getByText(/% OFF/).count(), 0, 'older offers keep their card unchanged');
  const megaDeal = await cardHeight('mega');
  await publicPage.getByText('82% OFF', { exact: true }).waitFor();
  assert.equal(megaDeal, legacyDeal, 'the badge sits in the label line');
  assert(await publicPage.getByText('Search and Maps listing', { exact: true }).isVisible());
  await publicPage.getByRole('button', { name: 'T&C', exact: true }).click();
  assert((await publicPage.getByRole('dialog').innerText()).includes('Package term: one revision.')); await publicPage.keyboard.press('Escape');
  for (const width of [1440, 390, 320]) {
    await publicPage.setViewportSize({ width, height: 950 }); await publicPage.goto(origin + '/offer/mega'); await publicPage.getByRole('timer').waitFor();
    assert(await publicPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `no horizontal scroll at ${width}`);
    await publicPage.screenshot({ path: path.join(folder, `offer-${width}.png`), fullPage: true });
  }

  // 5. A package change updates its running offer and its drafts.
  const changed = await packageApi({ ...api.store.packages.starter, regularPrice: 5000, inclusions: ['Business profile setup', 'Search and Maps listing', 'Review link'] });
  assert.equal(changed.status(), 200, await changed.text());
  let offers = (await state()).offers;
  for (const slug of ['mega', 'mega-two']) { const offer = offers.find(row => row.slug === slug); assert.equal(offer.mainPrice, 5000, slug); assert.equal(offer.inclusions.length, 3, slug); }
  await publicPage.goto(origin + '/offer/mega'); await publicPage.getByText('86% OFF', { exact: true }).waitFor();

  // 6. Package changes that would break the running offer are refused.
  const starter = api.store.packages.starter;
  for (const [patch, status, message] of [
    [{ discountedPrice: 500 }, 400, /must not be more than the discounted price/],
    [{ status: 'archived' }, 409, /cannot be archived/],
    [{ offerSlug: '' }, 409, /running offer/],
    [{ offerExtraPrice: 2000 }, 400, /extra scope/],
  ]) { const response = await packageApi({ ...starter, ...patch }); assert.equal(response.status(), status, JSON.stringify(patch)); assert.match((await response.json()).error, message); }
  await page.goto(origin + '/admin/packages');
  await page.locator('article').filter({ hasText: 'Google Starter' }).getByRole('button', { name: 'Edit package →' }).click();
  await page.getByText(/Running offer:/).waitFor();
  assert.equal(await page.getByLabel('Linked offer', { exact: true }).isDisabled(), true);
  assert.equal(await page.getByLabel('Project category', { exact: true }).isDisabled(), true);
  await page.screenshot({ path: path.join(folder, 'admin-package-running-offer.png'), fullPage: true });

  // 7. Older offers' package ticks cannot take a busy package, nor link a package offer.
  const tick = data => context.request.patch(origin + '/api/packages/offer-links', { data });
  assert.equal((await tick({ offerSlug: 'legacy', packageIds: ['old-pkg', 'starter'] })).status(), 409);
  assert.equal((await tick({ offerSlug: 'mega', packageIds: ['gbp'] })).status(), 400);

  // 8. A failed link is reported, shown in the list and repaired by saving again.
  api.store.failLink = true;
  const gbp = await offerApi({ ...draft, slug: 'gbp-offer', title: 'GBP offer', packageId: 'gbp', status: 'published' }, true);
  assert.equal(gbp.status(), 200); assert.match(decodeURIComponent(gbp.headers()['x-package-link-error'] || ''), /package link was not updated/);
  await page.goto(origin + '/admin/offers?section=settings');
  await page.getByText('Not linked to its package yet. Open and save the offer to link it.', { exact: true }).waitFor();
  api.store.failLink = false;
  assert.equal((await offerApi({ ...(await gbp.json()) })).status(), 200);
  assert.equal(api.store.packages.gbp.offerSlug, 'gbp-offer');

  // 9. A package changed outside its offer is flagged in the list.
  api.store.packages.gbp.inclusions = ['Changed in the portal'];
  await page.goto(origin + '/admin/offers?section=settings');
  await page.getByText('Package changed since this offer was saved. Open and save the offer to update it.', { exact: true }).waitFor();

  // 10. Delete = archive: the offer leaves the website and frees its package for the waiting draft.
  await page.goto(origin + '/admin/offers?section=settings&offer=mega');
  await save('Delete offer');
  assert.deepEqual(api.store.linkCalls.at(-1), { offerSlug: 'mega', packageIds: [] });
  assert.equal(api.store.packages.starter.offerSlug, '');
  assert.equal((await state()).published.some(row => row.slug === 'mega'), false);
  offers = (await state()).offers;
  assert.equal((await offerApi({ ...offers.find(row => row.slug === 'mega-two'), status: 'published' })).status(), 200, 'the freed package takes the next offer');
  assert.equal(api.store.packages.starter.offerSlug, 'mega-two');

  // 11. An older offer keeps its full form and saves unchanged.
  await page.goto(origin + '/admin/offers?section=settings&offer=legacy');
  await page.getByText('Pricing rule', { exact: true }).waitFor();
  await page.getByLabel('Short description', { exact: true }).fill('Still an older offer.');
  const legacySaved = await (await save('Save & publish')).json();
  assert.equal('packageId' in legacySaved, false); assert.equal(legacySaved.pricingRule, 'percentage'); assert.deepEqual(legacySaved.inclusions, ['Hand-written point']);

  assert.deepEqual(errors, []);
  console.log('PASS: package offers — locked package fields, % badge, one running offer per package, drafts, package sync and guards, link failure/retry, delete = archive, older offers unchanged, desktop/mobile layout.');
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
  process.chdir(previous);
}
