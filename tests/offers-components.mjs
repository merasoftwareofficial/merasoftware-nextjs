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
const hex = n => String(n).padStart(24, '0');
export const store = { packages: {}, drafts: {}, linkCalls: [], saves: [], failLink: false, categorySaves: [], addOnCalls: [],
  categories: [{ category: 'standard_websites', label: 'Standard Websites', status: 'active', sortOrder: 1, basePrice: 10000, description: '', startingNodeTitle: '', customerSelectable: true, locked: true, usage: { projects: 2, features: 2, packages: 1 } },
    { category: 'seo_services', label: 'SEO Services', status: 'active', sortOrder: 2, basePrice: 5000, description: '', startingNodeTitle: '', customerSelectable: false, locked: false, usage: { projects: 0, features: 1, packages: 0 } }],
  addOns: [
    { id: hex(1), name: 'SEO setup', unitPrice: 3000, description: 'Basics', isHidden: false, isQuantityBased: false, compatibleWith: [] },
    { id: hex(2), name: 'Extra page', unitPrice: 500, description: '', isHidden: false, isQuantityBased: true, compatibleWith: [] },
    { id: hex(3), name: 'Hidden add-on', unitPrice: 100, description: '', isHidden: true, isQuantityBased: false, compatibleWith: [] },
    { id: hex(4), name: 'SEO audit', unitPrice: 800, description: '', isHidden: false, isQuantityBased: false, compatibleWith: ['seo_services'] }] };
export const requireSalesAdmin = () => requireRole('admin');
export async function portalAddOnRequest(action, body) {
  await requireSalesAdmin();
  store.addOnCalls.push({ action, body });
  if (action === 'create') { const id = hex(100 + store.addOns.length); store.addOns.push({ id, name: body.serviceName, unitPrice: body.sellingPrice, description: body.formattedDescriptions[0]?.content ?? '', isHidden: body.isHidden, isQuantityBased: body.isQuantityBased, compatibleWith: body.compatibleWith }); return { _id: id }; }
  const index = store.addOns.findIndex(row => row.id === body._id);
  if (action === 'remove') { if (store.addOns[index].name === 'Bought service') throw new AuthError('This product has 2 purchases and cannot be deleted. Retire it instead to keep the customer history intact.', 400); store.addOns.splice(index, 1); return { _id: body._id }; }
  Object.assign(store.addOns[index], { name: body.serviceName, unitPrice: body.sellingPrice, description: body.formattedDescriptions[0]?.content ?? '', isHidden: body.isHidden, isQuantityBased: body.isQuantityBased, compatibleWith: body.compatibleWith });
  return { _id: body._id };
}
const quoted = item => ({ ...item, quoteKey: 'k-' + item.id, quote: { regularPrice: item.regularPrice, discountAmount: 0, finalPrice: item.discountedPrice, offer: null, terms: item.terms } });
export async function readSalesCatalogue(admin) {
  if (admin) await requireSalesAdmin();
  const settings = await settingsRepo.get();
  return { packages: Object.values(store.packages).map(quoted), offers: resolvedOffers(settings.offers), plans: [], categories: store.categories.map(row => ({ ...row })), addOns: store.addOns.map(row => ({ ...row })), drafts: Object.values(store.drafts) };
}
const idBase = name => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'package';
const taken = id => !!store.packages[id] || !!store.drafts[id];
// Package working copies, as backend helpers/packageDrafts.js keeps them.
function draftAction(body) {
  const conflict = () => { throw new AuthError('Someone else saved this draft meanwhile. Reload the package to see their changes.', 409); };
  if (body.action === 'save') {
    const name = String(body.data?.item?.name ?? '').trim();
    if (!name) throw new AuthError('Enter the package name to save a draft', 400);
    let id = body.packageId;
    if (!id) { const base = idBase(name); id = base; for (let n = 2; taken(id); n++) id = base + '-' + n; }
    else if (body.version === 0) { if (!store.packages[id]) throw new AuthError('Package not found', 404); if (store.drafts[id]) conflict(); }
    else if (store.drafts[id]?.version !== body.version) conflict();
    const version = (store.drafts[id]?.version ?? 0) + 1;
    store.drafts[id] = { packageId: id, name, data: { ...body.data, item: { ...body.data.item, id } }, version };
    return store.drafts[id];
  }
  if (body.action === 'delete') { if (store.drafts[body.packageId] && store.drafts[body.packageId].version !== body.version) conflict(); const deleted = !!store.drafts[body.packageId]; delete store.drafts[body.packageId]; return { packageId: body.packageId, deleted }; }
  if (body.action === 'clearOffer') { const row = store.drafts[body.packageId]; const cleared = !!row && row.data.offer?.base?.slug === body.offerSlug; if (cleared) { row.data.offer = null; row.version++; } return { packageId: body.packageId, cleared }; }
  throw new AuthError('Choose a draft action', 400);
}
export async function salesBackend(admin, body, path = 'sales-packages') {
  await requireSalesAdmin();
  if (!body) return readSalesCatalogue(admin);
  if (path === 'sales-packages') {
    // A new package without an ID gets one from its name, the next number while taken (as the backend does).
    const item = { ...body.item };
    if (body.creating && !item.id) {
      const base = idBase(item.name);
      for (let n = 1; ; n++) { const id = n === 1 ? base : base + '-' + n; if (!taken(id)) { item.id = id; break; } }
    }
    const exists = !!store.packages[item.id];
    if (body.creating === exists) throw new AuthError(body.creating ? 'This package ID already exists' : 'Package not found', 409);
    if (Array.isArray(item.services)) {
      const previous = store.packages[item.id];
      const reuse = !!previous?.pricing && previous.category === item.category && item.repriceFromCurrent !== true;
      const category = store.categories.find(row => row.category === item.category);
      if (!reuse && (category?.basePrice === null || category?.basePrice === undefined)) throw new AuthError('This category has no base price yet. Set its base price first.', 400);
      const frozen = new Map(reuse ? previous.pricing.services.map(row => [row.featureId, row]) : []);
      const services = item.services.map(row => {
        const kept = frozen.get(row.featureId);
        const live = store.addOns.find(add => add.id === row.featureId && !add.isHidden && (!add.compatibleWith.length || add.compatibleWith.includes(item.category)));
        const source = kept ?? (live && { name: live.name, unitPrice: live.unitPrice, isQuantityBased: live.isQuantityBased });
        if (!source) throw new AuthError('An add-on service is unavailable for this category. Refresh the list.', 400);
        return { featureId: row.featureId, name: source.name, unitPrice: source.unitPrice, isQuantityBased: !!source.isQuantityBased, quantity: source.isQuantityBased ? row.quantity : 1 };
      });
      const base = reuse ? previous.pricing.categoryBasePrice : category.basePrice;
      const total = Math.round((base + services.reduce((sum, row) => sum + row.unitPrice * row.quantity, 0)) * 100) / 100;
      if (total !== item.regularPrice) throw new AuthError('The main price changed. Review the current category and add-on prices.', 409);
      item.pricing = { categoryBasePrice: base, services };
      delete item.services; delete item.repriceFromCurrent;
    }
    store.saves.push(item);
    store.packages[item.id] = item;
    return store.packages[item.id];
  }
  if (path === 'sales-packages/drafts') return draftAction(body);
  if (path === 'sales-packages/delete') {
    const item = store.packages[body.packageId];
    if (!item) throw new AuthError('Package not found', 404);
    if (item.status !== 'archived') throw new AuthError('Archive this package before deleting it', 409);
    delete store.packages[body.packageId]; delete store.drafts[body.packageId];
    return { id: body.packageId, name: item.name };
  }
  if (path === 'sales-packages/lifecycle') {
    const item = store.packages[body.packageId];
    if (!item) throw new AuthError('Package not found', 404);
    if (!['published', 'archived'].includes(body.action)) throw new AuthError('Choose a valid package action', 400);
    item.status = body.action;
    return item;
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
  // A new project category (backend savePlanCategoryController, save_project_category), as the plan form saves it.
  if (path === 'plan-categories') {
    store.categorySaves.push(body);
    if (body.action !== 'save_project_category' || !/^[a-z][a-z0-9_]{2,39}$/.test(body.category)) throw new AuthError('Enter a valid category', 400);
    if (!body.creating) {
      const row = store.categories.find(entry => entry.category === body.category);
      if (!row) throw new AuthError('Category not found', 404);
      if (row.locked && body.status === 'archived') throw new AuthError('This category is used by the customer website questionnaire, so it must stay active, open to customers and priced.', 400);
      for (const key of ['label', 'basePrice', 'description', 'startingNodeTitle', 'sortOrder', 'customerSelectable', 'status']) if (body[key] !== undefined) row[key] = body[key];
      return { ...row };
    }
    const entry = { category: body.category, label: body.label, status: 'active', sortOrder: body.sortOrder, basePrice: body.basePrice, description: body.description, startingNodeTitle: body.startingNodeTitle, customerSelectable: body.customerSelectable, locked: false, usage: { projects: 0, features: 0, packages: 0 } };
    store.categories.push(entry);
    return entry;
  }
  throw new AuthError('Unknown path', 404);
}
`;
const serverEntry = `
import {PATCH as offers} from '${src('src/app/api/offers/route.ts')}';
import {GET as packagesGet, PATCH as packagesPatch, DELETE as packagesDelete} from '${src('src/app/api/packages/route.ts')}';
import {PATCH as links} from '${src('src/app/api/packages/offer-links/route.ts')}';
import {PATCH as drafts} from '${src('src/app/api/packages/drafts/route.ts')}';
import {PATCH as lifecycle} from '${src('src/app/api/packages/lifecycle/route.ts')}';
import {PATCH as plans} from '${src('src/app/api/plans/route.ts')}';
import {POST as addOnPost, DELETE as addOnDelete} from '${src('src/app/api/add-ons/route.ts')}';
import {identity} from '@/lib/auth';
import {settingsRepo} from '@/lib/repo';
import {store, readSalesCatalogue} from '@/lib/sales-catalogue-server';
import {resolvedOffers,publishedOffers,DEFAULT_UNIVERSAL_TERMS,DEFAULT_OFFER_LISTING} from '@/lib/offers';
const routes = { 'PATCH /api/offers': offers, 'GET /api/packages': packagesGet, 'PATCH /api/packages': packagesPatch, 'DELETE /api/packages': packagesDelete, 'PATCH /api/packages/offer-links': links, 'PATCH /api/packages/drafts': drafts, 'PATCH /api/packages/lifecycle': lifecycle, 'PATCH /api/plans': plans, 'POST /api/add-ons': addOnPost, 'DELETE /api/add-ons': addOnDelete };
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
  virtual(builder, 'plans-server', /^@\/lib\/service-plans-server$/, 'export const readPlanCatalogue = async () => ({});');
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
createRoot(document.getElementById('app')).render(location.pathname==='/admin/offers'?<main style={{padding:24,maxWidth:1100,margin:'auto'}}><OffersManager key={location.search} initialOffers={s.offers} initialTerms={s.terms} initialListing={s.listing} section={q.get('section')||'settings'} initialOfferSlug={q.get('offer')||undefined}/></main>
:location.pathname==='/admin/packages'?<main style={{padding:24,maxWidth:1400,margin:'auto'}}><PackagesManager key={location.search} initial={s.catalogue} initialPages={[]} initialOffers={s.offers} universalTerms={s.terms} openPackageId={q.get('package')||undefined}/></main>
:item?<PublicInteraction offer={running?offerView(running,item):packageView(item,own[0])} terms={running?resolvedTerms(running,s.terms):packageTerms} pkg={{id:item.id,name:item.name,live:!!running,back:{href:'/',label:'Packages'},packageTerms,start:{signedIn:false}}}/>
:offer?<PublicInteraction offer={offerView(offer)} terms={resolvedTerms(offer,s.terms)}/>:<main>Not found</main>);});
`;
await build({ stdin: { contents: clientEntry, resolveDir: root, sourcefile: 'offer-ui-fixture.tsx', loader: 'tsx' }, outfile: path.join(folder, 'client.js'), bundle: true, platform: 'browser', conditions: ['style', 'browser'], jsx: 'automatic', tsconfig: path.join(root, 'tsconfig.json'), plugins: [{ name: 'browser-fixtures', setup(builder) {
  virtual(builder, 'link', /^@\/components\/link$/, `import React from 'react';export default function Link(props){return <a {...props}/>}`, 'tsx');
  virtual(builder, 'navigation', /^@\/components\/loading\/navigation$/, `export const useNavigate=()=>({pending:false,push:h=>location.assign(h),replace:h=>location.assign(h),refresh(){},assign:h=>location.assign(h)});export const InlineLoader=()=>null;`);
} }] });
const previous = process.cwd();
process.chdir(folder);
const api = createRequire(import.meta.url)(path.join(folder, 'server.cjs'));
const pkg = (id, patch = {}) => ({ id, name: id, description: 'Package description', status: 'published', category: 'standard_websites', regularPrice: 4000, discountedPrice: 3500, offerExtraPrice: 0, offerSlug: '', inclusions: ['Business profile setup', 'Search and Maps listing'], terms: ['Package term: one revision.'], linkedPlanIds: [], order: 0, pages: [], ...patch });
const OLD_REF = '0123456789abcdef01234567';
for (const item of [pkg('gbp', { name: 'GBP Setup', linkedPlanIds: [OLD_REF] }), pkg('old-pkg', { offerSlug: 'legacy' }), pkg('retired-pkg', { name: 'Retired package', status: 'archived' })]) api.store.packages[item.id] = item;
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
  const editor = async name => { await page.goto(origin + '/admin/packages'); await page.locator('li').filter({ hasText: name }).getByRole('button', { name: /^(Edit|Continue draft) →$/ }).click(); };

  const draftCall = async label => {
    const pending = page.waitForResponse(r => r.url().endsWith('/api/packages/drafts') && r.request().method() === 'PATCH');
    await page.getByRole('button', { name: label, exact: true }).click();
    const response = await pending; return { status: response.status(), body: await response.json() };
  };

  // 0. Save draft needs only the package name (and the offer name); wrong values are kept; nothing goes live.
  // Publish checks every field and sends nothing while one is wrong.
  await page.goto(origin + '/admin/packages');
  await page.getByRole('button', { name: 'New package +', exact: true }).click();
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await page.getByText('Enter the package name to save a draft.', { exact: true }).waitFor();
  await form.getByLabel('Package name', { exact: true }).fill('Draft Only');
  await form.getByLabel('Discount price (₹)', { exact: true }).fill('-5');
  await page.getByRole('button', { name: '+ Add offer', exact: true }).click();
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await page.getByText('Enter the offer name to save the offer in the draft.', { exact: true }).waitFor();
  await form.getByLabel('Offer name', { exact: true }).fill('Half offer');
  const firstDraft = await draftCall('Save draft');
  assert.equal(firstDraft.status, 200, JSON.stringify(firstDraft.body)); assert.equal(firstDraft.body.packageId, 'draft-only');
  assert.equal(api.store.drafts['draft-only'].data.item.discountedPrice, -5, 'a wrong value is kept in the draft');
  assert.equal(api.store.drafts['draft-only'].data.offer.title, 'Half offer');
  assert.equal(api.store.packages['draft-only'], undefined, 'nothing is live');
  await page.getByText('Draft saved. Its link /package/draft-only goes live when you publish.', { exact: true }).waitFor();
  const beforePublish = packageSaves;
  await form.getByLabel('Offer status', { exact: true }).selectOption('published');
  await page.getByRole('button', { name: 'Publish', exact: true }).click();
  await page.getByText('Not published. Fix the marked fields first, or press Save draft to keep your work.', { exact: true }).waitFor();
  for (const text of ['Choose a project category.', 'Enter a description.', "The main price must be above ₹0: set the category's base price or tick an add-on.", 'Enter the offer price.', 'Choose whether the client sends files in the portal.']) await page.getByText(text, { exact: true }).waitFor();
  assert.equal(packageSaves, beforePublish, 'nothing is sent while a field is wrong');
  await page.screenshot({ path: path.join(folder, 'admin-draft-refused-publish.png'), fullPage: true });
  await form.getByLabel('Offer status', { exact: true }).selectOption('draft');
  await page.getByRole('button', { name: '← All packages' }).click();
  // The packages list has three tabs (Live / Drafts / Archived); a never-published draft is under Drafts.
  await page.getByRole('tab', { name: /^Drafts/ }).click();
  await page.locator('li').filter({ hasText: 'Draft Only' }).getByRole('button', { name: 'Edit draft →' }).click();
  assert.equal(await form.getByLabel('Discount price (₹)', { exact: true }).inputValue(), '-5', 'the draft opens as typed');
  assert.equal(await form.getByLabel('Offer name', { exact: true }).inputValue(), 'Half offer');
  const stale = await context.request.patch(origin + '/api/packages/drafts', { data: { action: 'save', packageId: 'draft-only', version: 5, data: { item: { name: 'Old copy' } } } });
  assert.equal(stale.status(), 409, 'a save from an older copy is refused');
  const nameless = await context.request.patch(origin + '/api/packages/drafts', { data: { action: 'save', data: { item: { name: ' ' } } } });
  assert.equal(nameless.status(), 400);
  await page.getByRole('button', { name: 'Delete draft', exact: true }).click();
  await page.getByText('Draft deleted.', { exact: true }).waitFor();
  assert.equal(api.store.drafts['draft-only'], undefined);

  // 1. A package alone: no ID field (made from the name), page design pre-filled, offer optional.
  await page.goto(origin + '/admin/packages');
  await page.getByRole('button', { name: 'New package +', exact: true }).click();
  assert.equal(await form.getByLabel('Permanent ID', { exact: true }).count(), 0, 'no ID field');
  // Category (owner decision 4, 9 Nov 2026): the real list from the portal, nothing preselected; the removed
  // "Related portal services" field is gone from the form while the save still sends linkedPlanIds.
  const categorySelect = form.getByLabel('Project category', { exact: true });
  assert.equal(await categorySelect.inputValue(), '', 'no category preselected');
  assert.deepEqual(await categorySelect.locator('option').allInnerTexts(), ['Choose a category', 'Standard Websites', 'SEO Services']);
  assert.equal(await form.getByLabel('Related portal services (optional references)').count(), 0, 'related services removed');
  await categorySelect.selectOption('standard_websites');
  await form.getByLabel('Package name', { exact: true }).fill('Business Starter');
  await form.getByText('/package/business-starter', { exact: true }).waitFor();
  await form.getByLabel('Status', { exact: true }).selectOption('published');
  await form.getByLabel('Description', { exact: true }).fill('A ready-to-launch business website.');
  await form.getByLabel('Included work (one item per line)', { exact: true }).fill('5-page business website\nMobile-friendly design');
  // The main price is made from the category base price and the ticked add-ons (owner decision 10 Nov 2026), never typed.
  assert.equal(await form.getByLabel('Main price (₹)', { exact: true }).count(), 1);
  assert.equal(await form.getByLabel('Main price (₹)', { exact: true }).evaluate(node => node.tagName), 'P', 'the main price is shown, not typed');
  assert.equal(await form.getByLabel('Main price (₹)', { exact: true }).innerText(), '₹10,000', 'the category base price alone');
  assert.equal(await form.getByLabel('Discount price (₹)', { exact: true }).inputValue(), '10000', 'no discount to start with');
  const addOns = form.getByRole('group', { name: 'Add-on services', exact: true });
  assert.deepEqual(await addOns.getByRole('checkbox').evaluateAll(boxes => boxes.map(box => box.closest('label').innerText.replace(/\s+/g, ' ').trim())), ['SEO setup · ₹3,000', 'Extra page · ₹500 each'], 'hidden and other-category add-ons are not offered');
  await addOns.getByRole('checkbox', { name: /^SEO setup/ }).check();
  await addOns.getByRole('checkbox', { name: /^Extra page/ }).check();
  await form.getByLabel('Quantity of Extra page', { exact: true }).fill('4');
  assert.equal(await form.getByLabel('Main price (₹)', { exact: true }).innerText(), '₹15,000');
  await form.getByText('Base ₹10,000', { exact: false }).first().waitFor();
  assert.match(await form.getByLabel('Included work (one item per line)', { exact: true }).inputValue(), /SEO setup/, 'a ticked add-on is added to the included work');
  await form.getByLabel('Discount price (₹)', { exact: true }).fill('9999');
  await form.getByText('₹5,001 discount (33.3% off).', { exact: false }).waitFor();
  assert.equal(await form.getByLabel('Main heading', { exact: true }).inputValue(), 'Business Starter', 'design pre-filled from the name');
  // How customers buy it (src/docs/package.md decision 7): one-time and full payment pre-chosen, uploads always chosen.
  assert.equal(await form.getByLabel('Billing', { exact: true }).inputValue(), 'one_time');
  await form.getByLabel('Portal uploads', { exact: true }).selectOption('yes');
  await form.getByLabel('2 installments (50% + 50%)').check();
  await page.getByRole('button', { name: '+ Add offer', exact: true }).waitFor();
  await page.screenshot({ path: path.join(folder, 'admin-new-package.png'), fullPage: true });
  const first = await save('Publish');
  assert.equal(first.package.id, 'business-starter'); assert.equal(first.offer, null);
  assert.deepEqual([first.package.billing, first.package.portalUploads, first.package.paymentOptions], ['one_time', true, ['full', 'installments_2']]);
  assert.deepEqual([first.package.category, first.package.linkedPlanIds], ['standard_websites', []], 'chosen category; linkedPlanIds still sent');
  assert.equal(api.store.packages['business-starter'].design.heading, 'Business Starter');
  await page.getByText('Package published. Its page is /package/business-starter. No offer: customers see 2 prices.', { exact: true }).waitFor();
  await page.getByText('fixed', { exact: true }).waitFor();
  assert.equal((await state()).offers.filter(row => row.packageId).length, 0, 'no offer was made');

  // List actions work without opening the editor: Archive ends a running package offer, Publish restores
  // the catalogue state, and force delete works for an archived package.
  await api.seedOffer({ ...legacy, slug: 'gbp-running', title: 'GBP running offer', packageId: 'gbp', endsAt: '2030-12-31T23:59:59+05:30' });
  await page.goto(origin + '/admin/packages');
  const gbpLine = page.locator('li').filter({ hasText: 'GBP Setup' });
  const archiving = page.waitForResponse(r => r.url().endsWith('/api/packages/lifecycle') && r.request().method() === 'PATCH');
  await gbpLine.getByRole('button', { name: 'Archive', exact: true }).click();
  assert.equal((await archiving).status(), 200);
  await page.getByText('"GBP Setup" was archived.', { exact: true }).waitFor();
  assert.equal(api.store.packages.gbp.status, 'archived', 'outside Archive uses the lifecycle endpoint');
  assert.equal((await state()).offers.find(offer => offer.slug === 'gbp-running').status, 'archived', 'archiving a live package ends its running package offer');
  await page.getByRole('tab', { name: /^Archived/ }).click();
  const publishing = page.waitForResponse(r => r.url().endsWith('/api/packages/lifecycle') && r.request().method() === 'PATCH');
  await page.locator('li').filter({ hasText: 'GBP Setup' }).getByRole('button', { name: 'Publish', exact: true }).click();
  assert.equal((await publishing).status(), 200);
  await page.getByText('"GBP Setup" was published.', { exact: true }).waitFor();
  assert.equal(api.store.packages.gbp.status, 'published', 'outside Publish uses the lifecycle endpoint');
  const deleteRetired = page.getByRole('button', { name: 'Force delete Retired package permanently' });
  await deleteRetired.waitFor();
  const deleting = page.waitForResponse(r => r.url().endsWith('/api/packages') && r.request().method() === 'DELETE');
  await deleteRetired.click();
  assert.equal((await deleting).status(), 200);
  await page.getByText('"Retired package" was deleted permanently.', { exact: true }).waitFor();
  assert.equal(api.store.packages['retired-pkg'], undefined, 'the archived package is removed only after confirmation');
  await editor('Business Starter');

  // 2. Add offer makes every offer field the system needs required; nothing is sent until they are right.
  await page.getByRole('button', { name: '+ Add offer', exact: true }).click();
  await form.getByLabel('Offer status', { exact: true }).selectOption('published');
  const before = packageSaves;
  await page.getByRole('button', { name: 'Publish changes', exact: true }).click();
  await page.getByText('Not published. Fix the marked fields first, or press Save draft to keep your work.', { exact: true }).waitFor();
  for (const text of ['Enter the offer name.', 'Enter the offer price.', 'Choose how the project is paid.']) await page.getByText(text, { exact: true }).waitFor();
  await form.getByLabel('Offer name', { exact: true }).fill('Diwali Launch Offer');
  await form.getByLabel('Offer price (₹)', { exact: true }).fill('9999');
  await page.getByRole('button', { name: 'Publish changes', exact: true }).click();
  await page.getByText('Must be below the normal price (₹9,999).', { exact: true }).waitFor();
  assert.equal(packageSaves, before, 'nothing was sent');
  await form.getByLabel('Offer price (₹)', { exact: true }).fill('2999');
  await page.getByText('Shown as 80% OFF the main price.', { exact: true }).waitFor();
  await form.getByLabel('Payment rule', { exact: true }).selectOption('advance');
  await form.getByLabel('Minimum advance type', { exact: true }).selectOption('percentage');
  await form.getByLabel('Minimum advance', { exact: true }).fill('20');
  await form.getByLabel('Payment rule', { exact: true }).selectOption('limited_uploads');
  await form.getByLabel('Pre-payment upload allowance', { exact: true }).fill('2');
  await form.getByLabel('Expires at (India time / IST)', { exact: true }).fill('2030-10-20T23:59');
  await form.getByLabel('Reserve opens (hours before the offer ends)', { exact: true }).fill('48');
  await form.getByLabel('Offer status', { exact: true }).selectOption('published');
  await page.getByText('/offer/diwali-launch-offer', { exact: true }).waitFor();
  assert.equal(await page.getByText('Not published. Fix the marked fields first, or press Save draft to keep your work.', { exact: true }).count(), 0, 'fixed fields clear their marks before saving');
  await page.screenshot({ path: path.join(folder, 'admin-package-with-offer.png'), fullPage: true });
  const second = await save('Publish changes');
  assert.equal(second.offer.slug, 'diwali-launch-offer'); assert.equal(second.offer.packageId, 'business-starter');
  for (const key of ['eyebrow', 'heading', 'description', 'ctaLabel', 'contactHref']) assert.equal(key in second.offer, false, `a new offer stores no ${key}`);
  assert.equal(second.offer.mainPrice, 15000); assert.equal(second.offer.discountPrice, 9999); assert.equal(second.offer.reserveWindowHours, 48);
  assert.deepEqual(second.offer.paymentPolicy, { mode: 'limited_uploads', uploadAllowance: 2, dueDays: 7, cycleScope: 'first_purchase', reminderOffsets: [-1, 0, 3] });
  assert.deepEqual(api.store.linkCalls.at(-1), { offerSlug: 'diwali-launch-offer', packageIds: ['business-starter'] });
  await page.getByText('Running', { exact: true }).first().waitFor();
  assert.equal(await form.getByLabel('Project category', { exact: true }).isDisabled(), true, 'fixed while its offer runs');

  // 3. The package page: offer mode (3 prices, % OFF, countdown) and package mode (2 prices, Arrange a callback).
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
  await publicPage.locator('section[aria-label] [class*="claim"]').filter({ hasText: 'Arrange a callback' }).click();
  await publicPage.getByRole('dialog', { name: 'Arrange a callback for this package?' }).waitFor();
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

  // 3b. A published package's draft: the live page stays as it is until Publish changes; Discard draft goes back.
  await form.getByLabel('Description', { exact: true }).fill('Changed in the draft.');
  const copy = await draftCall('Save draft');
  assert.equal(copy.status, 200, JSON.stringify(copy.body)); assert.equal(copy.body.version, 1);
  assert.equal(api.store.packages['business-starter'].description, 'A ready-to-launch business website.', 'live package unchanged');
  await page.getByText('Draft saved. The live page stays as it is until you publish the changes.', { exact: true }).waitFor();
  await page.goto(origin + '/admin/packages');
  await page.locator('li').filter({ hasText: 'Business Starter' }).getByText('Draft in progress', { exact: true }).waitFor();
  await editor('Business Starter');
  assert.equal(await form.getByLabel('Description', { exact: true }).inputValue(), 'Changed in the draft.', 'the package opens its draft');
  await page.getByText('Running', { exact: true }).first().waitFor();
  await save('Publish changes');
  assert.equal(api.store.packages['business-starter'].description, 'Changed in the draft.');
  assert.equal(api.store.drafts['business-starter'], undefined, 'the draft is removed once published');
  await form.getByLabel('Description', { exact: true }).fill('Throw this away.');
  await draftCall('Save draft');
  await page.getByRole('button', { name: 'Discard draft', exact: true }).click();
  await page.getByText('Draft discarded. The form shows the live package.', { exact: true }).waitFor();
  assert.equal(await form.getByLabel('Description', { exact: true }).inputValue(), 'Changed in the draft.');
  assert.equal(api.store.drafts['business-starter'], undefined);

  // 4. A package change updates its offer; changes that would break the running offer are refused.
  const saved = api.store.packages['business-starter'];
  // The main price follows the add-ons: 14 extra pages (₹500 each, the saved unit price) make base ₹10,000 + SEO ₹3,000 + ₹7,000 = ₹20,000.
  const changed = await packageApi({ ...saved, regularPrice: 20000, services: [{ featureId: '0'.repeat(23) + '1', quantity: 1 }, { featureId: '0'.repeat(23) + '2', quantity: 14 }] });
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
  // Offers are created, edited and linked only in the package form.
  const elsewhere = await offerApi({ ...offer, slug: 'diwali-two', title: 'Two' }, true); assert.equal(elsewhere.status(), 400); assert.match((await elsewhere.json()).error, /Offers are created in Packages/);
  const withoutPackage = { ...legacy, slug: 'no-package' };
  assert.equal((await offerApi(withoutPackage, true)).status(), 400, 'no offer is created outside Packages');
  const packageEdit = await offerApi({ ...offer, title: 'Edited outside' }); assert.equal(packageEdit.status(), 400); assert.match((await packageEdit.json()).error, /Edit it in Packages/);
  assert.equal((await offerApi({ ...offer, packageId: 'gbp' })).status(), 400, 'the package is fixed after creation');
  assert.equal((await offerApi(offer, false, 'editor')).status(), 403);
  const tick = data => context.request.patch(origin + '/api/packages/offer-links', { data });
  assert.equal((await tick({ offerSlug: 'diwali-launch-offer', packageIds: ['gbp'] })).status(), 410, 'ticks no longer link offers');
  assert.equal((await tick({ offerSlug: 'legacy', packageIds: ['gbp'] })).status(), 410, 'not even older offers');

  // 6. A second package with the same name gets the next number.
  const twin = await context.request.patch(origin + '/api/packages', { data: { item: { ...pkg(''), name: 'Business Starter', design: saved.design }, creating: true } });
  assert.equal((await twin.json()).package.id, 'business-starter-2');

  // 7. Offers lists package offers with a link to their package form; older offers keep their own form.
  await page.goto(origin + '/admin/offers?section=settings');
  assert.equal(await page.locator('article').filter({ hasText: 'Diwali Launch Offer' }).getByRole('link', { name: 'Edit →' }).getAttribute('href'), '/admin/packages?package=business-starter');
  assert.equal(await page.getByRole('link', { name: 'New offer +' }).count(), 0, 'offers are made on a package');
  assert.equal(await page.getByRole('link', { name: 'Add an offer on a package →' }).count(), 0, 'no second way to make an offer');
  await page.goto(origin + '/admin/offers?section=settings&offer=legacy');
  await page.getByText('Pricing rule', { exact: true }).waitFor();
  assert.equal(await page.getByText('Packages with this offer', { exact: true }).count(), 0, 'older offers have no package ticks');
  await page.getByLabel('Short description', { exact: true }).fill('Still an older offer.');
  const legacyPending = page.waitForResponse(r => r.url().endsWith('/api/offers') && r.request().method() === 'PATCH');
  await page.getByRole('button', { name: 'Save & publish', exact: true }).click();
  const legacySaved = await (await legacyPending).json();
  assert.equal('packageId' in legacySaved, false); assert.equal(legacySaved.pricingRule, 'percentage'); assert.deepEqual(legacySaved.inclusions, ['Hand-written point']);
  assert.equal(legacySaved.heading, 'Old heading', 'an older offer keeps its own design');

  // 8. End offer = archive: the package is back to 2 prices, the offer moves to past offers, a new one can start.
  // A working copy keeps its other changes and forgets the ended offer.
  await page.goto(origin + '/admin/packages?package=business-starter');
  await form.getByLabel('Description', { exact: true }).fill('Draft kept while the offer ends.');
  await draftCall('Save draft');
  await page.getByRole('button', { name: 'End offer', exact: true }).click();
  const ending = page.waitForResponse(r => r.url().endsWith('/api/packages') && r.request().method() === 'PATCH');
  await page.locator('p').getByRole('button', { name: 'End offer', exact: true }).click();
  assert.equal((await ending).status(), 200);
  await page.getByText('Offer ended. The package page shows 2 prices again.', { exact: true }).waitFor();
  assert.deepEqual(api.store.linkCalls.at(-1), { offerSlug: 'diwali-launch-offer', packageIds: [] });
  assert.equal((await state()).offers.find(row => row.slug === 'diwali-launch-offer').status, 'archived');
  await page.getByRole('button', { name: '+ Start new offer', exact: true }).waitFor();
  await page.getByText('Past offers (read only)', { exact: true }).waitFor();
  assert.equal(api.store.drafts['business-starter'].data.offer, null, 'the draft forgets the ended offer');
  assert.equal(api.store.packages['business-starter'].description, 'Changed in the draft.', 'End offer sends the live package');
  assert.equal(await form.getByLabel('Description', { exact: true }).inputValue(), 'Draft kept while the offer ends.');
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

  // 10. Publishing a package whose new offer is still a draft: the package goes live, the offer stays in the copy.
  const later = await packageApi({ ...pkg(''), name: 'Later Offer Pack', design: saved.design }, { creating: true, draft: { version: 0, keepOffer: { title: 'Later offer', status: 'draft' } } });
  assert.equal(later.status(), 200, await later.text());
  const laterBody = await later.json();
  assert.equal(laterBody.package.id, 'later-offer-pack'); assert.equal(laterBody.offer, null);
  assert.equal(laterBody.draft.data.offer.title, 'Later offer');
  assert.equal((await state()).offers.some(row => row.packageId === 'later-offer-pack'), false, 'no live offer');
  // Publishing from an older copy is refused before anything is written.
  const stalePublish = await packageApi({ ...api.store.packages['later-offer-pack'], description: 'Old copy' }, { draft: { version: 9 } });
  assert.equal(stalePublish.status(), 409);
  assert.equal(api.store.packages['later-offer-pack'].description, 'Package description');

  // 11. Price per file works like the plan system (owner decisions 9 Nov 2026): files per update, ONE price per
  // file, updates a month, then billing cycles; no main / normal price boxes; a price check shows what a client
  // pays (lib/package-per-file.ts, equal to the backend quote: tests/package-per-file.test.ts). Saved as both prices.
  await page.goto(origin + '/admin/packages');
  await page.getByRole('button', { name: 'New package +', exact: true }).click();
  await form.getByLabel('Package name', { exact: true }).fill('Data Entry Pack');
  // + New category (the plan form's dialog, saved by the portal backend): the new category is listed and selected.
  await form.getByRole('button', { name: '+ New category', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'New project category' });
  await dialog.getByLabel('Category name', { exact: true }).fill('Data Services');
  assert.equal(await dialog.getByLabel('Permanent key', { exact: true }).inputValue(), 'data_services');
  await dialog.getByRole('button', { name: 'Create category', exact: true }).click();
  await dialog.waitFor({ state: 'detached' });
  assert.equal(await form.getByLabel('Project category', { exact: true }).inputValue(), 'data_services', 'the new category is selected');
  assert.deepEqual(await form.getByLabel('Project category', { exact: true }).locator('option').allInnerTexts(), ['Standard Websites', 'SEO Services', 'Data Services']);
  assert.deepEqual([api.store.categorySaves.length, api.store.categorySaves[0].action, api.store.categorySaves[0].creating], [1, 'save_project_category', true]);
  await form.getByLabel('Status', { exact: true }).selectOption('published');
  await form.getByLabel('Description', { exact: true }).fill('Monthly data entry for your business.');
  await form.getByLabel('Included work (one item per line)', { exact: true }).fill('Monthly data entry');
  await form.getByLabel('Billing', { exact: true }).selectOption('monthly');
  await form.getByLabel('Portal uploads', { exact: true }).selectOption('yes');
  // One fixed monthly price (owner decision 11 Nov 2026): no price per file anywhere.
  assert.equal(await form.getByLabel('Price per file (₹)', { exact: true }).count(), 0, 'no price per file');
  assert.equal(await form.getByRole('radiogroup', { name: 'Monthly pricing' }).count(), 0, 'no fixed / per file choice');
  // A monthly package has the same price methods as a one-time one; this one is typed by hand.
  const priceMethod = form.getByLabel('Price method', { exact: true });
  assert.equal(await priceMethod.inputValue(), 'automatic');
  await priceMethod.selectOption('manual');
  await form.getByLabel('Main price (₹)', { exact: true }).fill('900');
  await form.getByLabel('Normal price (₹)', { exact: true }).fill('700');
  const top = async texts => form.evaluate((el, list) => list.map(text => { const node = [...el.querySelectorAll('legend, label span, h2, span')].find(n => n.textContent.trim().startsWith(text)); return node ? node.getBoundingClientRect().top + scrollY : NaN; }), texts);
  // A typed (manual) package shows no category field; it keeps the category chosen above.
  const fixedOrder = await top(['Package name', 'How customers buy', 'Billing *', 'Updates a month', 'Billing cycles and discount', 'Main price', 'Included work', '2. Offer', '3. Website display', 'When published', 'Show on pages', '4. Page design']);
  assert.ok(fixedOrder.every((y, i) => i === 0 || y > fixedOrder[i - 1]), 'name, purchase settings, updates, cycles, prices, included work, offer, website display, page design: ' + fixedOrder);
  // Updates a month: unlimited by default, or a number that opens again every month.
  const uploads = form.getByLabel('Updates a month', { exact: true });
  assert.equal(await uploads.inputValue(), 'unlimited');
  await uploads.selectOption('limited');
  await form.getByLabel('Number of updates a month', { exact: true }).fill('3');
  await form.getByRole('group', { name: 'Billing cycles' }).getByRole('checkbox').nth(1).check();
  await form.getByLabel('Quarterly discount %', { exact: true }).fill('10');
  await page.screenshot({ path: path.join(folder, 'admin-monthly-package.png'), fullPage: true });
  const monthlySaved = await save('Publish');
  assert.deepEqual([monthlySaved.package.billing, monthlySaved.package.monthly.uploadsPerMonth, monthlySaved.package.regularPrice, monthlySaved.package.discountedPrice], ['monthly', 3, 900, 700]);
  assert.equal('pricing' in monthlySaved.package.monthly, false, 'no fixed / per file field');
  assert.equal(monthlySaved.package.category, 'data_services', 'saved with the new category');
  // Without portal uploads there is no updates count: the team posts work updates instead.
  await form.getByLabel('Portal uploads', { exact: true }).selectOption('no');
  assert.equal(await form.getByLabel('Updates a month', { exact: true }).count(), 0);
  await form.getByLabel('Portal uploads', { exact: true }).selectOption('yes');
  // An offer must be below the normal monthly price.
  await page.getByRole('button', { name: '+ Add offer', exact: true }).click();
  await form.getByLabel('Offer name', { exact: true }).fill('Monthly launch');
  await form.getByLabel('Offer status', { exact: true }).selectOption('published');
  await form.getByLabel('Offer price (₹)', { exact: true }).fill('700');
  await page.getByRole('button', { name: 'Publish changes', exact: true }).click();
  await page.getByText('Must be below the normal price (₹700).', { exact: true }).waitFor();
  // "Manual" above is remembered for the next new package; the steps below start from the default (automatic).
  await page.evaluate(() => localStorage.removeItem('package-price-mode'));

  // 12. An older package keeps its stored service references when saved: the field left the form only.
  await editor('GBP Setup');
  // A typed (manual) package shows no category; its own category is kept, not shown.
  assert.equal(await form.getByLabel('Project category', { exact: true }).count(), 0, 'a typed package shows no category');
  assert.equal(api.store.packages['gbp'].category, 'standard_websites', 'its own category is kept');
  await form.getByLabel('Description', { exact: true }).fill('GBP description updated.');
  await save('Publish changes');
  assert.deepEqual([api.store.packages.gbp.description, api.store.packages.gbp.linkedPlanIds], ['GBP description updated.', [OLD_REF]]);
  // 13. Price from category and add-ons (owner decision 10 Nov 2026), with category and add-on changes made in popups
  // from the package form. A saved package keeps its saved prices; only an add-on added later takes today's price.
  const ONE = '0'.repeat(23) + '1';
  const made = await context.request.patch(origin + '/api/packages', { data: { creating: true, item: { ...pkg(''), name: 'Frozen Pack', category: 'standard_websites', regularPrice: 13000, discountedPrice: 12000,
    billing: 'one_time', portalUploads: true, paymentOptions: ['full'], design: api.store.packages['business-starter'].design, services: [{ featureId: ONE, quantity: 1 }] } } });
  assert.equal(made.status(), 200, await made.text());
  assert.deepEqual(api.store.packages['frozen-pack'].pricing, { categoryBasePrice: 10000, services: [{ featureId: ONE, name: 'SEO setup', unitPrice: 3000, isQuantityBased: false, quantity: 1 }] });
  api.store.categories[0].basePrice = 99999; api.store.addOns[0].unitPrice = 7000; // the portal's prices change afterwards
  await editor('Frozen Pack');
  const parts = form.getByRole('group', { name: 'Add-on services', exact: true });
  const mainPrice = () => form.getByLabel('Main price (₹)', { exact: true }).innerText();
  assert.equal(await mainPrice(), '₹13,000', 'a saved package keeps the prices it was saved with');
  await form.getByText('(saved price; today ₹7,000)', { exact: false }).waitFor();
  await parts.getByRole('checkbox', { name: /^Extra page/ }).check();
  assert.equal(await mainPrice(), '₹13,500', 'only the new add-on takes today\'s price');
  // Edit category in a popup: the key is fixed, a questionnaire category cannot be archived, the base price is saved by the portal.
  await form.getByRole('button', { name: 'Edit category', exact: true }).first().click();
  const editCategory = page.getByRole('dialog', { name: 'Edit project category', exact: true });
  assert.equal(await editCategory.getByRole('textbox', { name: /^Permanent key/ }).isEditable(), false, 'the key never changes');
  assert.equal(await editCategory.getByRole('checkbox', { name: /^Archived/ }).isDisabled(), true, 'the questionnaire category stays active');
  await editCategory.getByLabel('Base price (INR)', { exact: true }).fill('12000');
  await editCategory.getByRole('button', { name: 'Save category', exact: true }).click();
  await editCategory.waitFor({ state: 'detached' });
  const categoryCall = api.store.categorySaves.at(-1);
  assert.deepEqual([categoryCall.category, categoryCall.basePrice, categoryCall.status, 'creating' in categoryCall], ['standard_websites', 12000, 'active', false]);
  assert.equal(api.store.categories[0].basePrice, 12000);
  assert.equal(await mainPrice(), '₹13,500', 'the new base price does not reach the saved package');
  // "Update to current prices" takes every price afresh, and can be undone before saving.
  await form.getByRole('button', { name: 'Update to current prices', exact: true }).click();
  assert.equal(await mainPrice(), '₹19,500', 'base 12,000 + SEO 7,000 + 1 extra page 500');
  await form.getByText('On save, the base price and every add-on take today', { exact: false }).waitFor();
  await form.getByRole('button', { name: 'Keep the saved prices', exact: true }).click();
  assert.equal(await mainPrice(), '₹13,500');
  // A package priced from its category and add-ons may be monthly too (owner decision 11 Nov 2026): its parts make the monthly price.
  await form.getByLabel('Billing', { exact: true }).selectOption('monthly');
  await form.getByText('The prices below are for one month; every billing period is worked out from them, with its discount.', { exact: true }).waitFor();
  assert.equal(await mainPrice(), '₹13,500', 'the same parts, now the price of a month');
  await form.getByLabel('Billing', { exact: true }).selectOption('one_time');
  // No sideways scroll with the price builder filled, at any width.
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `no horizontal scroll in the price builder at ${width}`);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  // A saved add-on deleted in the portal stays in the package as it was saved, marked as no longer offered.
  await parts.getByRole('button', { name: 'Edit SEO setup', exact: true }).click();
  const editAddOn = page.getByRole('dialog', { name: 'Edit add-on service', exact: true });
  await editAddOn.getByRole('button', { name: 'Delete add-on', exact: true }).click();
  await editAddOn.waitFor({ state: 'detached' });
  assert.equal(api.store.addOns.some(row => row.name === 'SEO setup'), false);
  await form.getByText('No longer offered; kept as saved.', { exact: false }).waitFor();
  assert.equal(await mainPrice(), '₹13,500', 'a deleted add-on does not change a saved package');
  api.store.addOns.unshift({ id: ONE, name: 'SEO setup', unitPrice: 7000, description: 'Basics', isHidden: false, isQuantityBased: false, compatibleWith: [] });

  // A new package in another category: add-ons are made, changed and deleted from its popups.
  await page.goto(origin + '/admin/packages');
  await page.getByRole('button', { name: 'New package +', exact: true }).click();
  await form.getByLabel('Project category', { exact: true }).selectOption('seo_services');
  assert.equal(await mainPrice(), '₹5,000', 'the base price of the chosen category');
  assert.deepEqual(await form.getByRole('group', { name: 'Add-on services', exact: true }).getByRole('checkbox').evaluateAll(boxes => boxes.map(box => box.closest('label').innerText.replace(/\s+/g, ' ').trim())),
    ['SEO setup · ₹7,000', 'Extra page · ₹500 each', 'SEO audit · ₹800'], 'an add-on for one category is offered in that category');
  await form.getByRole('button', { name: '+ New add-on', exact: true }).click();
  const newAddOn = page.getByRole('dialog', { name: 'New add-on service', exact: true });
  await newAddOn.getByLabel('Add-on name', { exact: false }).fill('Logo design');
  await newAddOn.getByLabel('Price (₹)', { exact: false }).fill('2000');
  await newAddOn.getByRole('button', { name: 'Create add-on', exact: true }).click();
  await newAddOn.waitFor({ state: 'detached' });
  const created = api.store.addOnCalls.at(-1);
  assert.deepEqual([created.action, created.body.category, created.body.price, created.body.sellingPrice, created.body.compatibleWith, created.body.serviceName], ['create', 'feature_upgrades', 2000, 2000, [], 'Logo design']);
  const partsNow = form.getByRole('group', { name: 'Add-on services', exact: true });
  assert.equal(await partsNow.getByRole('checkbox', { name: /^Logo design/ }).isChecked(), true, 'a new add-on is ticked at once');
  assert.equal(await mainPrice(), '₹7,000');
  assert.match(await form.getByLabel('Included work (one item per line)', { exact: true }).inputValue(), /Logo design/);
  await partsNow.getByRole('button', { name: 'Edit Logo design', exact: true }).click();
  const changeAddOn = page.getByRole('dialog', { name: 'Edit add-on service', exact: true });
  await changeAddOn.getByLabel('Price (₹)', { exact: false }).fill('2500');
  await changeAddOn.getByRole('button', { name: 'Save add-on', exact: true }).click();
  await changeAddOn.waitFor({ state: 'detached' });
  assert.equal(api.store.addOnCalls.at(-1).action, 'update');
  assert.equal(await mainPrice(), '₹7,500', 'an add-on not yet saved in a package takes its current price');
  await partsNow.getByRole('button', { name: 'Edit Logo design', exact: true }).click();
  await page.getByRole('dialog', { name: 'Edit add-on service', exact: true }).getByRole('button', { name: 'Delete add-on', exact: true }).click();
  await page.getByRole('dialog', { name: 'Edit add-on service', exact: true }).waitFor({ state: 'detached' });
  assert.equal(await mainPrice(), '₹5,000', 'a deleted add-on leaves the form');
  assert.doesNotMatch(await form.getByLabel('Included work (one item per line)', { exact: true }).inputValue(), /Logo design/);
  // The portal's refusal to delete a service customers already bought is shown as it is.
  await form.getByRole('button', { name: '+ New add-on', exact: true }).click();
  const bought = page.getByRole('dialog', { name: 'New add-on service', exact: true });
  await bought.getByLabel('Add-on name', { exact: false }).fill('Bought service');
  await bought.getByLabel('Price (₹)', { exact: false }).fill('100');
  await bought.getByRole('button', { name: 'Create add-on', exact: true }).click();
  await bought.waitFor({ state: 'detached' });
  await form.getByRole('button', { name: 'Edit Bought service', exact: true }).click();
  const refused = page.getByRole('dialog', { name: 'Edit add-on service', exact: true });
  await refused.getByRole('button', { name: 'Delete add-on', exact: true }).click();
  await refused.getByText('cannot be deleted. Retire it instead', { exact: false }).waitFor();
  await refused.getByRole('button', { name: 'Cancel', exact: true }).click();
  // A price that changed while the form was open is refused on publish, with the portal's message.
  await form.getByRole('checkbox', { name: /^SEO audit/ }).check();
  await form.getByLabel('Package name', { exact: true }).fill('Stale Pack');
  await form.getByLabel('Status', { exact: true }).selectOption('published');
  await form.getByLabel('Description', { exact: true }).fill('Priced from its parts.');
  await form.getByLabel('Portal uploads', { exact: true }).selectOption('yes');
  assert.equal(await mainPrice(), '₹5,900', 'base 5,000 + Bought service 100 (ticked when made) + SEO audit 800');
  api.store.addOns.find(row => row.name === 'SEO audit').unitPrice = 900;
  await page.getByRole('button', { name: 'Publish', exact: true }).click();
  await page.getByText('The main price changed. Review the current category and add-on prices.', { exact: true }).waitFor();
  assert.equal(api.store.packages['stale-pack'], undefined, 'nothing was published');
  // 14. Price method (owner decision 10 Nov 2026): chosen when a package is made, remembered for the next new one, and kept by
  // a saved package. A typed (manual) package is made as before; a copy of it may be priced the other way.
  const typed = await context.request.patch(origin + '/api/packages', { data: { creating: true, item: { ...pkg(''), name: 'Typed Pack', category: 'standard_websites', regularPrice: 4000, discountedPrice: 3500,
    billing: 'one_time', portalUploads: true, paymentOptions: ['full'], design: api.store.packages['business-starter'].design } } });
  assert.equal(typed.status(), 200, await typed.text());
  const method = () => form.getByLabel('Price method', { exact: true });
  const remembered = () => page.evaluate(() => localStorage.getItem('package-price-mode'));
  await editor('Typed Pack');
  await form.getByText('Manual (typed prices)', { exact: true }).waitFor();
  assert.equal(await method().count(), 0, 'a saved package has no price-method choice');
  assert.equal(await form.getByRole('button', { name: 'Price from category and add-ons', exact: true }).count(), 0, 'a saved typed package is not switched');
  assert.equal(await form.getByLabel('Main price (₹)', { exact: true }).evaluate(node => node.tagName), 'INPUT', 'a typed package keeps its typed main price');
  await editor('Frozen Pack');
  await form.getByText('Automatic (from category and add-ons)', { exact: true }).waitFor();
  assert.equal(await method().count(), 0);
  // Duplicate a typed package: the copy is new, opens typed, and may be priced from its parts.
  await page.goto(origin + '/admin/packages');
  await page.locator('li').filter({ hasText: 'Typed Pack' }).getByRole('button', { name: 'Duplicate', exact: true }).click();
  assert.equal(await method().inputValue(), 'manual', 'a copy of a typed package opens typed');
  assert.equal(await form.getByLabel('Main price (₹)', { exact: true }).evaluate(node => node.tagName), 'INPUT');
  await method().selectOption('automatic');
  assert.equal(await form.getByLabel('Main price (₹)', { exact: true }).evaluate(node => node.tagName), 'P');
  assert.equal(await mainPrice(), '₹12,000', 'the category base price: this copy is priced from its parts');
  await form.getByRole('group', { name: 'Add-on services', exact: true }).waitFor();
  assert.equal(await remembered(), 'automatic');
  // The way chosen last is the way the next new package opens, also after switching to monthly and back.
  await method().selectOption('manual');
  assert.equal(await remembered(), 'manual');
  await page.goto(origin + '/admin/packages');
  await page.getByRole('button', { name: 'New package +', exact: true }).click();
  assert.equal(await method().inputValue(), 'manual', 'the next new package opens the way the last one was priced');
  assert.equal(await form.getByLabel('Main price (₹)', { exact: true }).evaluate(node => node.tagName), 'INPUT');
  await form.getByLabel('Billing', { exact: true }).selectOption('monthly');
  assert.equal(await method().inputValue(), 'manual', 'a monthly package chooses its price method too');
  await form.getByLabel('Billing', { exact: true }).selectOption('one_time');
  assert.equal(await method().inputValue(), 'manual', 'billing back to one-time keeps the chosen way');
  assert.equal(await form.getByLabel('Main price (₹)', { exact: true }).evaluate(node => node.tagName), 'INPUT');
  // Back to automatic for the steps that follow (blocked storage is covered by tests/package-price-mode.test.ts).
  await method().selectOption('automatic');
  assert.equal(await remembered(), 'automatic');
  // A category list that did not load says so instead of looking empty.
  const savedCategories = api.store.categories.splice(0);
  await page.goto(origin + '/admin/packages');
  await page.getByRole('button', { name: 'New package +', exact: true }).click();
  await form.getByText('The category list did not load from the portal. Reload the page; until then only a new category can be chosen.', { exact: true }).waitFor();
  api.store.categories.push(...savedCategories);
  // No sideways scroll in the admin form at any width.
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    const wide = await page.evaluate(() => [...document.querySelectorAll('body *')].filter(el => el.getBoundingClientRect().right > innerWidth + 1).slice(0, 6).map(el => el.tagName + '.' + String(el.className).slice(0, 40)));
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `no horizontal scroll in the package form at ${width}: ${JSON.stringify(wide)}`);
    assert.equal(await form.getByLabel('Description', { exact: true }).evaluate(el => getComputedStyle(el).resize), 'both', 'the description can still be manually resized');
    await page.screenshot({ path: path.join(folder, `admin-compact-package-${width}.png`), fullPage: true });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });

  assert.deepEqual(errors, []);
  console.log('PASS: one package form — drafts (name only, kept as typed, refused publish, published-package copy, discard, end offer), automatic IDs and offer links, page design, optional offer with required fields, package page in offer and package mode, sync and guards, offers only from Packages, older offers unchanged, desktop/mobile layout.');
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
  process.chdir(previous);
}
