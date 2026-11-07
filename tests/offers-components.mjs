// Lightweight browser + API integration for the one package form (src/docs/package-offers.md) and package
// offers (src/docs/dynamic-offers.md). Actual package/offer forms, the package page card and the real
// /api/offers, /api/packages and /api/packages/offer-links handlers with JSON storage. Only the signed-in
// identity and the portal package catalogue are test fixtures; nothing touches a real database or network.
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
export const store = { packages: {}, linkCalls: [], saves: [], failLink: false };
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
    // A new package without an ID gets one from its name, the next number while taken (as the backend does).
    const item = { ...body.item };
    if (body.creating && !item.id) {
      const base = item.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'package';
      for (let n = 1; ; n++) { const id = n === 1 ? base : base + '-' + n; if (!store.packages[id]) { item.id = id; break; } }
    }
    const exists = !!store.packages[item.id];
    if (body.creating === exists) throw new AuthError(body.creating ? 'This package ID already exists' : 'Package not found', 409);
    store.saves.push(item);
    store.packages[item.id] = item;
    return store.packages[item.id];
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
// The package page mirrors app/package/[id]/page.tsx: running offer → offer mode, else package mode.
const clientEntry = `
import React from 'react';import{createRoot}from'react-dom/client';
import{OffersManager}from'@/app/admin/offers/offers-manager';
import{PackagesManager}from'@/app/admin/packages/packages-manager';
import{PublicInteraction}from'@/components/campaign/public-interaction/page-content';
import{resolvedTerms}from'@/lib/offers';
import{offerView,packageView}from'@/lib/package-design';
import '${src('src/app/globals.css')}';
fetch('/state').then(r=>r.json()).then(s=>{const q=new URLSearchParams(location.search);const [,kind,slug]=location.pathname.split('/');
const offer=s.published.find(o=>o.slug===slug);const item=kind==='package'&&s.catalogue.packages.find(p=>p.id===slug&&p.status==='published');
const own=item?s.offers.filter(o=>o.packageId===item.id&&o.status!=='draft'):[];const running=own.find(o=>o.status==='published'&&Date.parse(o.endsAt)>Date.now());
const packageTerms=item?[...new Set([...s.terms,...item.terms])]:[];
createRoot(document.getElementById('app')).render(location.pathname==='/admin/offers'?<main style={{padding:24,maxWidth:1100,margin:'auto'}}><OffersManager key={location.search} initialOffers={s.offers} initialTerms={s.terms} initialListing={s.listing} section={q.get('section')||'settings'} initialOfferSlug={q.get('offer')||undefined} createNew={q.get('new')==='1'}/></main>
:location.pathname==='/admin/packages'?<main style={{padding:24,maxWidth:1400,margin:'auto'}}><PackagesManager key={location.search} initial={s.catalogue} initialPages={[]} initialOffers={s.offers} universalTerms={s.terms} openPackageId={q.get('package')||undefined}/></main>
:item?<PublicInteraction offer={running?offerView(running,item):packageView(item,own[0])} terms={running?resolvedTerms(running,s.terms):packageTerms} pkg={{id:item.id,name:item.name,live:!!running,back:{href:'/',label:'Packages'},packageTerms,start:{signedIn:false}}}/>
:offer?<PublicInteraction offer={offerView(offer)} terms={resolvedTerms(offer,s.terms)}/>:<main>Not found</main>);});
`;
await build({ stdin: { contents: clientEntry, resolveDir: root, sourcefile: 'offer-ui-fixture.tsx', loader: 'tsx' }, outfile: path.join(folder, 'client.js'), bundle: true, platform: 'browser', conditions: ['style', 'browser'], jsx: 'automatic', tsconfig: path.join(root, 'tsconfig.json'), plugins: [{ name: 'browser-fixtures', setup(builder) {
  virtual(builder, 'link', /^@\/components\/link$/, `import React from 'react';export default function Link(props){return <a {...props}/>}`, 'tsx');
  virtual(builder, 'navigation', /^@\/components\/loading\/navigation$/, `export const useNavigate=()=>({pending:false,push:h=>location.assign(h),replace:h=>location.assign(h),refresh(){},assign:h=>location.assign(h)});`);
} }] });
const previous = process.cwd();
process.chdir(folder);
const api = createRequire(import.meta.url)(path.join(folder, 'server.cjs'));
const pkg = (id, patch = {}) => ({ id, name: id, description: 'Package description', status: 'published', category: 'standard_websites', regularPrice: 4000, discountedPrice: 3500, offerExtraPrice: 0, offerSlug: '', inclusions: ['Business profile setup', 'Search and Maps listing'], terms: ['Package term: one revision.'], linkedPlanIds: [], order: 0, pages: [], ...patch });
for (const item of [pkg('gbp', { name: 'GBP Setup' }), pkg('old-pkg', { offerSlug: 'legacy' })]) api.store.packages[item.id] = item;
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
  await page.setViewportSize({ width: 1440, height: 1000 });
  const errors = []; page.on('pageerror', error => { errors.push(error.message); console.error('Browser error:', error.message); });
  page.on('dialog', dialog => dialog.accept());
  let packageSaves = 0; page.on('request', request => { if (request.url().endsWith('/api/packages') && request.method() === 'PATCH') packageSaves++; });
  const offerApi = (offer, creating = false, role) => context.request.patch(origin + '/api/offers', { data: { kind: 'offer', offer, creating }, ...(role ? { headers: { 'x-test-role': role } } : {}) });
  const packageApi = (item, extra = {}) => context.request.patch(origin + '/api/packages', { data: { item, creating: false, ...extra } });
  const state = async () => (await context.request.get(origin + '/state')).json();
  async function save(label) {
    const pending = page.waitForResponse(r => r.url().endsWith('/api/packages') && r.request().method() === 'PATCH');
    await page.getByRole('button', { name: label, exact: true }).click();
    const response = await pending; assert.equal(response.status(), 200, await response.text().catch(() => '')); return response.json();
  }
  // The admin form (the closed full-page preview dialog repeats some labels).
  const form = page.locator('form').first();
  const editor = async name => { await page.goto(origin + '/admin/packages'); await page.locator('article').filter({ hasText: name }).getByRole('button', { name: 'Edit package →' }).click(); };

  // 1. A package alone: no ID field (made from the name), page design pre-filled, offer optional.
  await page.goto(origin + '/admin/packages');
  await page.getByRole('button', { name: 'New package +', exact: true }).click();
  assert.equal(await form.getByLabel('Permanent ID', { exact: true }).count(), 0, 'no ID field');
  await form.getByLabel('Package name', { exact: true }).fill('Business Starter');
  await form.getByText('/package/business-starter', { exact: true }).waitFor();
  await form.getByLabel('Status', { exact: true }).selectOption('published');
  await form.getByLabel('Description', { exact: true }).fill('A ready-to-launch business website.');
  await form.getByLabel('Included work (one item per line)', { exact: true }).fill('5-page business website\nMobile-friendly design');
  await form.getByLabel('Main price (₹)', { exact: true }).fill('15000');
  await form.getByLabel('Normal price (₹)', { exact: true }).fill('9999');
  assert.equal(await form.getByLabel('Main heading', { exact: true }).inputValue(), 'Business Starter', 'design pre-filled from the name');
  await page.getByRole('button', { name: '+ Add offer', exact: true }).waitFor();
  await page.screenshot({ path: path.join(folder, 'admin-new-package.png'), fullPage: true });
  const first = await save('Save package');
  assert.equal(first.package.id, 'business-starter'); assert.equal(first.offer, null);
  assert.equal(api.store.packages['business-starter'].design.heading, 'Business Starter');
  await page.getByText('Package saved. Its page is /package/business-starter. No offer: customers see 2 prices.', { exact: true }).waitFor();
  await page.getByText('fixed', { exact: true }).waitFor();
  assert.equal((await state()).offers.filter(row => row.packageId).length, 0, 'no offer was made');

  // 2. Add offer makes every offer field the system needs required; nothing is sent until they are right.
  await page.getByRole('button', { name: '+ Add offer', exact: true }).click();
  const before = packageSaves;
  await page.getByRole('button', { name: 'Save package & offer', exact: true }).click();
  await page.getByText('Nothing was saved. Fix the marked fields first.', { exact: true }).waitFor();
  for (const text of ['Enter the offer name.', 'Enter the offer price.', 'Choose how the project is paid.']) await page.getByText(text, { exact: true }).waitFor();
  await form.getByLabel('Offer name', { exact: true }).fill('Diwali Launch Offer');
  await form.getByLabel('Offer price (₹)', { exact: true }).fill('9999');
  await page.getByRole('button', { name: 'Save package & offer', exact: true }).click();
  await page.getByText('Must be below the normal price (₹9,999).', { exact: true }).waitFor();
  assert.equal(packageSaves, before, 'nothing was sent');
  await form.getByLabel('Offer price (₹)', { exact: true }).fill('2999');
  await page.getByText('Shown as 80% OFF the main price.', { exact: true }).waitFor();
  await form.getByLabel('Payment rule', { exact: true }).selectOption('limited_uploads');
  await form.getByLabel('Pre-payment upload allowance', { exact: true }).fill('2');
  await form.getByLabel('Expires at (India time / IST)', { exact: true }).fill('2030-10-20T23:59');
  await form.getByLabel('Reserve opens (hours before the offer ends)', { exact: true }).fill('48');
  await form.getByLabel('Offer status', { exact: true }).selectOption('published');
  await page.getByText('/offer/diwali-launch-offer', { exact: true }).waitFor();
  assert.equal(await page.getByText('Nothing was saved. Fix the marked fields first.', { exact: true }).count(), 0, 'fixed fields clear their marks before saving');
  await page.screenshot({ path: path.join(folder, 'admin-package-with-offer.png'), fullPage: true });
  const second = await save('Save package & offer');
  assert.equal(second.offer.slug, 'diwali-launch-offer'); assert.equal(second.offer.packageId, 'business-starter');
  for (const key of ['eyebrow', 'heading', 'description', 'ctaLabel', 'contactHref']) assert.equal(key in second.offer, false, `a new offer stores no ${key}`);
  assert.equal(second.offer.mainPrice, 15000); assert.equal(second.offer.discountPrice, 9999); assert.equal(second.offer.reserveWindowHours, 48);
  assert.deepEqual(second.offer.paymentPolicy, { mode: 'limited_uploads', uploadAllowance: 2, dueDays: 7, cycleScope: 'first_purchase', reminderOffsets: [-1, 0, 3] });
  assert.deepEqual(api.store.linkCalls.at(-1), { offerSlug: 'diwali-launch-offer', packageIds: ['business-starter'] });
  await page.getByText('Running', { exact: true }).first().waitFor();
  assert.equal(await form.getByLabel('Project category', { exact: true }).isDisabled(), true, 'fixed while its offer runs');

  // 3. The package page: offer mode (3 prices, % OFF, countdown) and package mode (2 prices, Start my project).
  const publicPage = await context.newPage(); publicPage.on('pageerror', error => errors.push(error.message));
  await publicPage.goto(origin + '/package/business-starter'); await publicPage.getByRole('timer').waitFor();
  await publicPage.getByText('80% OFF', { exact: true }).waitFor();
  assert.equal(await publicPage.locator('section[aria-label] h2').first().innerText(), 'Diwali Launch Offer');
  await publicPage.getByRole('button', { name: 'T&C', exact: true }).click();
  assert((await publicPage.getByRole('dialog').innerText()).includes('Offer valid until')); await publicPage.keyboard.press('Escape');
  await publicPage.goto(origin + '/package/gbp');
  await publicPage.getByText('PRICE', { exact: true }).waitFor();
  assert.equal(await publicPage.getByRole('timer').count(), 0, 'no countdown without an offer');
  assert.equal(await publicPage.locator('del').count(), 1, 'only the main price is crossed out');
  await publicPage.locator('section[aria-label]').getByText('Have a question? Enquire', { exact: true }).waitFor();
  await publicPage.locator('section[aria-label] [class*="claim"]').filter({ hasText: 'Start my project' }).click();
  await publicPage.getByRole('button', { name: 'Continue to sign in' }).waitFor();
  await publicPage.keyboard.press('Escape');
  for (const width of [1440, 390, 320]) {
    await publicPage.setViewportSize({ width, height: 950 });
    for (const id of ['business-starter', 'gbp']) {
      await publicPage.goto(origin + '/package/' + id); await publicPage.locator('section[aria-label]').first().waitFor();
      assert(await publicPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `no horizontal scroll at ${width} on ${id}`);
    }
    await publicPage.screenshot({ path: path.join(folder, `package-${width}.png`), fullPage: true });
  }

  // 4. A package change updates its offer; changes that would break the running offer are refused.
  const saved = api.store.packages['business-starter'];
  const changed = await packageApi({ ...saved, regularPrice: 20000 });
  assert.equal(changed.status(), 200, await changed.text());
  assert.equal((await state()).offers.find(row => row.slug === 'diwali-launch-offer').mainPrice, 20000);
  for (const [patch, status, message] of [
    [{ discountedPrice: 2000 }, 400, /must be below the normal price/],
    [{ status: 'archived' }, 409, /cannot be archived/],
    [{ status: 'draft' }, 400, /Publish "Business Starter" before publishing its offer/],
    [{ offerSlug: '' }, 409, /running offer/],
  ]) { const response = await packageApi({ ...api.store.packages['business-starter'], ...patch }); assert.equal(response.status(), status, JSON.stringify(patch)); assert.match((await response.json()).error, message); }
  const design = await packageApi({ ...api.store.packages['business-starter'], design: { ...saved.design, contactHref: 'http://insecure.example' } });
  assert.equal(design.status(), 400); assert.match((await design.json()).error, /Page design/);

  // 5. One running offer per package; a new package offer needs a package; editors cannot change offers.
  const offer = (await state()).offers.find(row => row.slug === 'diwali-launch-offer');
  const busy = await offerApi({ ...offer, slug: 'diwali-two', title: 'Two' }, true); assert.equal(busy.status(), 409); assert.match((await busy.json()).error, /already has a running offer/);
  const withoutPackage = { ...legacy, slug: 'no-package' };
  assert.equal((await offerApi(withoutPackage, true)).status(), 400, 'a new offer needs a package');
  assert.equal((await offerApi({ ...offer, packageId: 'gbp' })).status(), 400, 'the package is fixed after creation');
  assert.equal((await offerApi(offer, false, 'editor')).status(), 403);
  const tick = data => context.request.patch(origin + '/api/packages/offer-links', { data });
  assert.equal((await tick({ offerSlug: 'diwali-launch-offer', packageIds: ['gbp'] })).status(), 400, 'a package offer is never linked by ticks');

  // 6. A second package with the same name gets the next number.
  const twin = await context.request.patch(origin + '/api/packages', { data: { item: { ...pkg(''), name: 'Business Starter', design: saved.design }, creating: true } });
  assert.equal((await twin.json()).package.id, 'business-starter-2');

  // 7. Offers lists package offers with a link to their package form; older offers keep their own form.
  await page.goto(origin + '/admin/offers?section=settings');
  assert.equal(await page.locator('article').filter({ hasText: 'Diwali Launch Offer' }).getByRole('link', { name: 'Edit →' }).getAttribute('href'), '/admin/packages?package=business-starter');
  assert.equal(await page.getByRole('link', { name: 'New offer +' }).count(), 0, 'offers are made on a package');
  await page.goto(origin + '/admin/offers?section=settings&offer=legacy');
  await page.getByText('Pricing rule', { exact: true }).waitFor();
  await page.getByLabel('Short description', { exact: true }).fill('Still an older offer.');
  const legacyPending = page.waitForResponse(r => r.url().endsWith('/api/offers') && r.request().method() === 'PATCH');
  await page.getByRole('button', { name: 'Save & publish', exact: true }).click();
  const legacySaved = await (await legacyPending).json();
  assert.equal('packageId' in legacySaved, false); assert.equal(legacySaved.pricingRule, 'percentage'); assert.deepEqual(legacySaved.inclusions, ['Hand-written point']);
  assert.equal(legacySaved.heading, 'Old heading', 'an older offer keeps its own design');

  // 8. End offer = archive: the package is back to 2 prices, the offer moves to past offers, a new one can start.
  await page.goto(origin + '/admin/packages?package=business-starter');
  await page.getByRole('button', { name: 'End offer', exact: true }).click();
  const ending = page.waitForResponse(r => r.url().endsWith('/api/packages') && r.request().method() === 'PATCH');
  await page.locator('p').getByRole('button', { name: 'End offer', exact: true }).click();
  assert.equal((await ending).status(), 200);
  await page.getByText('Offer ended. The package page shows 2 prices again.', { exact: true }).waitFor();
  assert.deepEqual(api.store.linkCalls.at(-1), { offerSlug: 'diwali-launch-offer', packageIds: [] });
  assert.equal((await state()).offers.find(row => row.slug === 'diwali-launch-offer').status, 'archived');
  await page.getByRole('button', { name: '+ Start new offer', exact: true }).waitFor();
  await page.getByText('Past offers (read only)', { exact: true }).waitFor();
  await publicPage.setViewportSize({ width: 1440, height: 950 });
  await publicPage.goto(origin + '/package/business-starter'); await publicPage.getByText('PRICE', { exact: true }).waitFor();
  assert.equal(await publicPage.getByRole('timer').count(), 0);
  await page.screenshot({ path: path.join(folder, 'admin-package-offer-ended.png'), fullPage: true });

  // 9. A package with an older extra-scope charge: adding an offer here clears it, so the page shows the price paid.
  api.store.packages['extra-pkg'] = pkg('extra-pkg', { offerExtraPrice: 2000 });
  const extra = await packageApi({ ...api.store.packages['extra-pkg'], design: saved.design }, { offer: { creating: true, offer: { title: 'Extra package offer', status: 'draft', offerPrice: 1000, endsAt: '2030-10-20T18:29:59.999Z', order: 0 } } });
  assert.equal(extra.status(), 200, await extra.text());
  assert.equal(api.store.packages['extra-pkg'].offerExtraPrice, 0);
  assert.equal((await extra.json()).offer.slug, 'extra-package-offer');

  assert.deepEqual(errors, []);
  console.log('PASS: one package form — automatic IDs and offer links, page design, optional offer with required fields, package page in offer and package mode, sync and guards, end offer, older offers unchanged, desktop/mobile layout.');
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
  process.chdir(previous);
}
