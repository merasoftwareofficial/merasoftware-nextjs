// Browser check for the package cards on a Pricing & Packages page (components/campaign/staff-packages.tsx,
// package-card.tsx). Renders the real components with a fixture catalogue (the live one-time packages of
// 8 Nov 2026) and a local /api/time. Checks: one grid with offers first, the All / Offers running switch
// only while an offer runs, one card height side by side, 2-line description, one-line inclusions with
// "+N more", a running countdown, an ended offer returning to its place, terms in a popup, the whole card
// opening the package page, no sideways scroll.
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium } from 'playwright';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = file => path.join(root, file).replaceAll('\\', '/');
const folder = path.join(root, 'test-results', `package-cards-${Date.now()}`);
mkdirSync(folder, { recursive: true });

const OFFER_SECONDS = 8;
const pkg = (id, name, description, regularPrice, discountedPrice, inclusions, order, offer = null) => ({
  id, name, description, status: 'published', category: 'standard_websites', regularPrice, discountedPrice, offerExtraPrice: 0,
  offerSlug: offer ? offer.slug : '', inclusions, terms: [`${name} term.`], linkedPlanIds: [], order, pages: ['one-time-packages'], quoteKey: 'k-' + id,
  quote: offer ? { regularPrice, discountAmount: regularPrice - offer.offerPrice, finalPrice: offer.offerPrice, offer, terms: [`${name} term.`, 'Offer term.'] }
    : { regularPrice: discountedPrice, discountAmount: 0, finalPrice: discountedPrice, offer: null, terms: [`${name} term.`] },
});
const lines = (n, prefix) => Array.from({ length: n }, (_, i) => `${prefix} item ${i + 1}`);
const clientEntry = `
import React from 'react';import{createRoot}from'react-dom/client';
import{StaffPackages}from'@/components/campaign/staff-packages';
import '${src('src/app/globals.css')}';
fetch('/catalogue').then(r=>r.json()).then(items=>createRoot(document.getElementById('app')).render(<main style={{padding:'0 16px',maxWidth:1180,margin:'auto'}}><StaffPackages title="One-Time Packages" intro="Compare one-time packages." items={items} categories={[{category:'standard_websites',label:'Standard Website',status:'active'}]}/></main>));
`;
await build({ stdin: { contents: clientEntry, resolveDir: root, sourcefile: 'package-cards-fixture.tsx', loader: 'tsx' }, outfile: path.join(folder, 'client.js'), bundle: true, platform: 'browser', conditions: ['style', 'browser'], jsx: 'automatic', tsconfig: path.join(root, 'tsconfig.json'), plugins: [{ name: 'browser-fixtures', setup(builder) {
  builder.onResolve({ filter: /^@\/components\/link$/ }, () => ({ path: 'link', namespace: 'test' }));
  builder.onLoad({ filter: /^link$/, namespace: 'test' }, () => ({ contents: `import React from 'react';export default function Link(props){return <a {...props}/>}`, loader: 'tsx', resolveDir: root }));
} }] });

let catalogue = [];
const server = http.createServer((request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const json = body => { response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify(body)); };
  if (url.pathname === '/api/time') return json({ now: Date.now() });
  if (url.pathname === '/catalogue') return json(catalogue);
  if (url.pathname === '/client.js' || url.pathname === '/client.css') { response.setHeader('Content-Type', url.pathname.endsWith('css') ? 'text/css' : 'text/javascript'); return response.end(readFileSync(path.join(folder, url.pathname.slice(1)))); }
  response.setHeader('Content-Type', 'text/html');
  response.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/client.css"></head><body><div id="app"></div><script src="/client.js"></script></body></html>');
});
const heights = page => page.$$eval('[data-package-card]', cards => cards.map(card => Math.round(card.getBoundingClientRect().height)));
const order = page => page.$$eval('[data-package-card]', cards => cards.map(card => card.dataset.packageCard));
const ADMIN_ORDER = ['google-business-profile', 'social-media-setup', '13102001-0308', 'all-in-one', 'dynamic-website-with-content-management'];
let browser;
try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const load = async () => { await page.goto(origin); await page.waitForSelector('[data-package-card]'); await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(400); };
  const tabs = page.getByRole('group', { name: 'Show packages' });
  const allTab = page.getByRole('button', { name: /^All packages/ });
  const offersTab = page.getByRole('button', { name: /^Offers running/ });
  const offer = { slug: 'digital-dhamaka', status: 'published', title: 'Digital Growth Kit', mainPrice: 25000, discountPrice: 20000, offerPrice: 3499, endsAt: new Date(Date.now() + 3 * 86400000).toISOString() };
  const allInOne = (withOffer = offer) => pkg('all-in-one', 'All-in-One Startup', 'One complete package to build your business\'s digital presence.', 25000, 20000, lines(11, 'All-in-One'), 4, withOffer);
  catalogue = [
    pkg('google-business-profile', 'Google Business Profile Setup & Optimization', 'Get your business on Google Search & Maps to reach more local customers.', 4000, 3500, lines(5, 'Google'), 1),
    pkg('social-media-setup', 'Social Media Business Setup', 'Build your online presence to attract more customers and grow your business.', 4000, 3500, ['Professional Facebook Page to Attract Customers', 'Instagram Business Profile for Brand Growth', 'WhatsApp Business Setup for Products & Enquiries', 'Social Media Interlinking for Easy Customer Access', 'Meta Ads Manager Setup to Reach More Customers Through Ads'], 2),
    pkg('13102001-0308', 'Digital Growth kit', 'Everything that is required for a business startup is provided by us and is completely our responsibility. All you need to do is start our package.', 20000, 14999, lines(7, 'Growth'), 3),
    allInOne(),
    pkg('dynamic-website-with-content-management', 'Dynamic Website with Content Management', 'A special website that gives you full control of your website. You can manage content, images, and everything else on your site. You do not need to depend on your developer for any change.', 40000, 24999, lines(6, 'Dynamic'), 5),
  ];
  await load();

  // One grid: the offer first, then the others in the admin's order; the first row is full.
  assert.deepEqual(await order(page), ['all-in-one', ...ADMIN_ORDER.filter(id => id !== 'all-in-one')]);
  const tops = await page.$$eval('[data-package-card]', cards => cards.slice(0, 3).map(card => Math.round(card.getBoundingClientRect().top)));
  assert.equal(new Set(tops).size, 1, 'offer card shares its row with two packages');
  const offerCard = page.locator('[data-package-card="all-in-one"]');
  for (const text of [/Digital Growth Kit/, /86% OFF/, /₹3,499/, /Save ₹21,501/, /View offer →/]) assert.match(await offerCard.innerText(), text);
  const clock = async () => (await offerCard.getByRole('timer').innerText()).replace(/\s+/g, '');
  const first = await clock(); await page.waitForTimeout(1300);
  assert.match(first, /^(\d+d)?\d{2}h\d{2}m\d{2}s$/); assert.notEqual(await clock(), first, 'the countdown runs');

  // The switch: All packages (5) / Offers running (1) with the time left.
  assert.equal(await tabs.isVisible(), true);
  assert.match(await allTab.innerText(), /All packages\s*5/);
  assert.match(await offersTab.innerText(), /Offers running\s*1\s*· ends in \d+d \d{2}h/);
  assert.equal(await allTab.getAttribute('aria-pressed'), 'true');
  await offersTab.click();
  assert.equal(await offersTab.getAttribute('aria-pressed'), 'true');
  assert.deepEqual(await order(page), ['all-in-one']);
  await allTab.click();
  assert.equal((await order(page)).length, 5);

  // Inclusions: 5 shown, one line each, the rest counted.
  for (const [id, more] of [['all-in-one', 6], ['13102001-0308', 2], ['dynamic-website-with-content-management', 1], ['google-business-profile', 0]]) {
    const card = page.locator(`[data-package-card="${id}"]`);
    assert.equal(await card.locator('h4 + ul > li').count(), 5, id);
    assert.equal(await card.getByText(/more on the package page/).count(), more ? 1 : 0, id);
    if (more) assert.equal(await card.getByText(/more on the package page/).innerText(), `+ ${more} more on the package page`);
  }
  const items = await page.$$eval('[data-package-card] h4 + ul > li', rows => rows.map(li => ({ text: li.textContent, oneLine: li.clientHeight < parseFloat(getComputedStyle(li).lineHeight) * 1.5, cut: li.scrollWidth > li.clientWidth })));
  assert.ok(items.every(row => row.oneLine), 'every inclusion is one line');
  assert.ok(items.some(row => row.cut), 'a long inclusion is cut with an ellipsis');
  // Description: at most 2 lines, a long one is cut with an ellipsis.
  const desc = await page.$$eval('[data-package-card] h3 + p', rows => rows.map(p => ({ lines: Math.round(p.clientHeight / parseFloat(getComputedStyle(p).lineHeight)), cut: p.scrollHeight > p.clientHeight + 1, clamp: getComputedStyle(p).webkitLineClamp })));
  for (const row of desc) { assert.ok(row.lines <= 2, JSON.stringify(row)); assert.equal(row.clamp, '2'); }
  assert.ok(desc.some(row => row.cut), 'a long description is cut');

  // One height side by side (3 and 2 columns) by CSS alone, own height in one column, compact, no sideways scroll.
  for (const width of [1440, 1024, 800, 390, 320, 1440]) {
    await page.setViewportSize({ width, height: 1000 }); await page.waitForTimeout(300);
    const h = await heights(page);
    if (width > 540) assert.equal(new Set(h).size, 1, `${width}px: ${h}`);
    assert.ok(Math.max(...h) < 600, `${width}px: cards too tall (${h})`);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${width}px scrolls sideways`);
    const clipped = await page.$$eval('[data-package-card]', cards => cards.filter(card => card.scrollHeight > card.clientHeight + 1).length);
    assert.equal(clipped, 0, `${width}px: content cut off`);
    await page.screenshot({ path: path.join(folder, `cards-${width}.png`), fullPage: true });
  }
  assert.equal(await page.$$eval('[data-package-card]', cards => cards.filter(card => card.style.minHeight).length), 0, 'no height set by script');

  // Terms open in a popup; the card keeps its size. Clicking the card opens the package page.
  const before = await heights(page);
  await offerCard.getByRole('button', { name: 'Terms & exclusions' }).click();
  const dialog = page.getByRole('dialog', { name: 'Terms & exclusions' });
  assert.equal(await dialog.isVisible(), true); assert.match(await dialog.innerText(), /Offer term\./);
  assert.deepEqual(await heights(page), before);
  await page.keyboard.press('Escape');
  const box = await page.locator('[data-package-card="google-business-profile"] h3 + p').boundingBox();
  assert.equal(await page.evaluate(([x, y]) => document.elementFromPoint(x, y).closest('a')?.getAttribute('href'), [box.x + 8, box.y + 6]), '/package/google-business-profile');

  // An offer ending while "Offers running" is open: the switch goes, every package shows, the card is back in its place.
  catalogue[3] = allInOne({ ...offer, endsAt: new Date(Date.now() + OFFER_SECONDS * 1000).toISOString() });
  await load();
  await offersTab.click();
  assert.deepEqual(await order(page), ['all-in-one']);
  await page.waitForTimeout((OFFER_SECONDS + 2) * 1000);
  assert.equal(await tabs.count(), 0);
  assert.deepEqual(await order(page), ADMIN_ORDER);
  const ended = page.locator('[data-package-card="all-in-one"]');
  assert.match(await ended.innerText(), /₹20,000/); assert.doesNotMatch(await ended.innerText(), /OFF|Offer ends/);
  assert.equal(new Set(await heights(page)).size, 1, 'one height after the offer ended');

  // No offer at all: no switch, the grid starts with the packages.
  catalogue[3] = allInOne(null);
  await load();
  assert.equal(await tabs.count(), 0);
  assert.deepEqual(await order(page), ADMIN_ORDER);
  await page.screenshot({ path: path.join(folder, 'cards-no-offer-1440.png'), fullPage: true });
  assert.deepEqual(errors, []);
  console.log(`PASS package cards (screenshots in ${path.relative(root, folder)})`);
} finally {
  await browser?.close(); server.close();
}
