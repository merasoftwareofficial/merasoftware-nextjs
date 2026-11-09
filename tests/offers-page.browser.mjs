// Browser check for the /offers page grid (components/campaign/offers-grid.tsx, package-card.tsx `ended`).
// Renders the real components with fixture cards and a local /api/time. Checks: running offer first with its
// countdown, expired cards after it with "Expired", the struck offer price and the normal price, no
// countdown; a running offer whose countdown ends turns into its expired card without a reload; one card
// height; no text under 16px; no sideways scroll; the empty message.
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium } from 'playwright';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = file => path.join(root, file).replaceAll('\\', '/');
const folder = path.join(root, 'test-results', `offers-page-${Date.now()}`);
mkdirSync(folder, { recursive: true });

const OFFER_SECONDS = 8;
const pkg = (id, name, regularPrice, discountedPrice, offer = null) => ({
  id, name, description: `${name} description.`, status: 'published', category: 'standard_websites', regularPrice, discountedPrice, offerExtraPrice: 0,
  offerSlug: offer ? offer.slug : '', inclusions: ['One', 'Two', 'Three'], terms: [`${name} term.`], linkedPlanIds: [], order: 0, pages: ['one-time-packages'], quoteKey: 'k-' + id,
  quote: offer ? { regularPrice, discountAmount: regularPrice - offer.offerPrice, finalPrice: offer.offerPrice, offer, terms: [`${name} term.`, 'Offer term.'] }
    : { regularPrice: discountedPrice, discountAmount: 0, finalPrice: discountedPrice, offer: null, terms: [`${name} term.`] },
});
const clientEntry = `
import React from 'react';import{createRoot}from'react-dom/client';
import{OffersGrid}from'@/components/campaign/offers-grid';
import '${src('src/app/globals.css')}';
fetch('/cards').then(r=>r.json()).then(cards=>createRoot(document.getElementById('app')).render(<main style={{padding:'0 16px',maxWidth:1180,margin:'auto'}}><OffersGrid title="Offers" emptyMessage="No offers available right now. Please check back soon." cards={cards} categories={[{category:'standard_websites',label:'Standard Website',status:'active'}]}/></main>));
`;
await build({ stdin: { contents: clientEntry, resolveDir: root, sourcefile: 'offers-page-fixture.tsx', loader: 'tsx' }, outfile: path.join(folder, 'client.js'), bundle: true, platform: 'browser', conditions: ['style', 'browser'], jsx: 'automatic', tsconfig: path.join(root, 'tsconfig.json'), plugins: [{ name: 'browser-fixtures', setup(builder) {
  builder.onResolve({ filter: /^@\/components\/link$/ }, () => ({ path: 'link', namespace: 'test' }));
  builder.onLoad({ filter: /^link$/, namespace: 'test' }, () => ({ contents: `import React from 'react';export default function Link(props){return <a {...props}/>}`, loader: 'tsx', resolveDir: root }));
} }] });

let cards = [];
const server = http.createServer((request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const json = body => { response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify(body)); };
  if (url.pathname === '/api/time') return json({ now: Date.now() });
  if (url.pathname === '/cards') return json(cards);
  if (url.pathname === '/client.js' || url.pathname === '/client.css') { response.setHeader('Content-Type', url.pathname.endsWith('css') ? 'text/css' : 'text/javascript'); return response.end(readFileSync(path.join(folder, url.pathname.slice(1)))); }
  response.setHeader('Content-Type', 'text/html');
  response.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/client.css"></head><body><div id="app"></div><script src="/client.js"></script></body></html>');
});
const order = page => page.$$eval('[data-package-card]', list => list.map(card => `${card.dataset.packageCard}:${card.dataset.offerState}`));
const heights = page => page.$$eval('[data-package-card]', list => list.map(card => Math.round(card.getBoundingClientRect().height)));
let browser;
try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const load = async () => { await page.goto(origin); await page.waitForSelector('main h1'); await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(600); };

  const running = { slug: 'diwali', status: 'published', title: 'Diwali Offer', offerPrice: 3499, endsAt: new Date(Date.now() + 3 * 86400000).toISOString() };
  const ended = (slug, title, offerPrice, daysAgo) => ({ slug, title, offerPrice, endsAt: new Date(Date.now() - daysAgo * 86400000).toISOString() });
  cards = [
    { item: pkg('all-in-one', 'All-in-One Startup', 25000, 20000, running), ended: null },
    { item: pkg('google-profile', 'Google Business Profile', 4000, 3500), ended: ended('google-launch', 'Google Launch Offer', 1999, 1) },
    { item: pkg('social-setup', 'Social Media Setup', 4000, 3500), ended: ended('social-week', 'Social Week', 2499, 6) },
  ];
  await load();
  assert.equal(await page.locator('main p').first().innerText(), 'OFFERS');
  assert.deepEqual(await order(page), ['all-in-one:running', 'google-profile:expired', 'social-setup:expired']);
  const live = page.locator('[data-package-card="all-in-one"]');
  for (const text of [/Diwali Offer/, /₹3,499/, /Offer ends in/, /View offer →/]) assert.match(await live.innerText(), text);
  const google = page.locator('[data-package-card="google-profile"]');
  const text = await google.innerText();
  for (const want of [/Offer ended/i, /Google Launch Offer/, /Expired/i, /₹3,500/, /Offer price ₹1,999 · ended \d+ \w+ \d{4}/, /View package →/]) assert.match(text, want);
  assert.doesNotMatch(text, /Offer ends in|% OFF|View offer/);
  assert.equal(await google.locator('del', { hasText: '₹1,999' }).count(), 1, 'offer price struck through');
  assert.equal(await google.getByRole('timer').count(), 0);
  // Its terms are the package's own, not the ended offer's.
  await google.getByRole('button', { name: 'Terms & exclusions' }).click();
  const dialog = page.getByRole('dialog', { name: 'Terms & exclusions' });
  assert.match(await dialog.innerText(), /Google Business Profile term\./); assert.doesNotMatch(await dialog.innerText(), /Offer term\./);
  await page.keyboard.press('Escape');
  // The whole card opens the package page.
  const box = await google.locator('h3 + p').boundingBox();
  assert.equal(await page.evaluate(([x, y]) => document.elementFromPoint(x, y).closest('a')?.getAttribute('href'), [box.x + 8, box.y + 6]), '/package/google-profile');

  const small = await page.evaluate(() => [...document.querySelectorAll('main *')].filter(el => [...el.childNodes].some(node => node.nodeType === 3 && node.textContent.trim()) && el.getClientRects().length && parseFloat(getComputedStyle(el).fontSize) < 16).map(el => `${el.tagName} "${el.textContent.trim().slice(0, 30)}" ${getComputedStyle(el).fontSize}`));
  assert.deepEqual(small, [], 'text under 16px');
  for (const width of [1440, 800, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 }); await page.waitForTimeout(300);
    if (width > 540) assert.equal(new Set(await heights(page)).size, 1, `${width}px: ${await heights(page)}`);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${width}px scrolls sideways`);
    assert.equal(await page.$$eval('[data-package-card]', list => list.filter(card => card.scrollHeight > card.clientHeight + 1).length), 0, `${width}px: content cut off`);
    await page.screenshot({ path: path.join(folder, `offers-${width}.png`), fullPage: true });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });

  // The running offer ends while the page is open: its card turns expired at once and goes first among the
  // expired ones (latest end), with its offer price and the normal price.
  cards[0] = { item: pkg('all-in-one', 'All-in-One Startup', 25000, 20000, { ...running, endsAt: new Date(Date.now() + OFFER_SECONDS * 1000).toISOString() }), ended: null };
  await load();
  assert.equal((await order(page))[0], 'all-in-one:running');
  await page.waitForTimeout((OFFER_SECONDS + 2) * 1000);
  assert.deepEqual(await order(page), ['all-in-one:expired', 'google-profile:expired', 'social-setup:expired']);
  const now = await live.innerText();
  for (const want of [/Diwali Offer/, /Expired/i, /₹20,000/, /Offer price ₹3,499/]) assert.match(now, want);
  assert.doesNotMatch(now, /Offer ends in/);
  await page.screenshot({ path: path.join(folder, 'offers-ended-live-1440.png'), fullPage: true });

  // No offers at all: the admin's empty message.
  cards = [];
  await load();
  assert.equal(await page.locator('[data-package-card]').count(), 0);
  assert.equal(await page.getByText('No offers available right now. Please check back soon.').count(), 1);
  assert.deepEqual(errors, []);
  console.log(`PASS offers page (screenshots in ${path.relative(root, folder)})`);
} finally {
  await browser?.close(); server.close();
}
