// Browser check for a package's customize page (components/packages/package-builder.tsx, src/docs/package.md §3).
// Renders the real builder with a one-time and a monthly per-file package; /api/package-quote and
// /api/package-starts are local fixtures that answer like the portal backend (helpers/salesPackages.js
// quoteChoice, helpers/packageStart.js). Checks: the choices shown come from the package's settings, every
// price comes from the quote, the request carries the choice, a visitor is sent to sign in and comes back to
// the same choice, the phone bar, and no sideways scroll at 1440, 390 and 320 px. "Get this package" sends the
// request and goes on to the payment inside the "Your package" card (as the portal does): the wallet part shown before
// paying, the UPI QR and reference for the rest, what the purchase sends (the quote's key and amount, never a price
// of its own), and the link to open the project in the portal.
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium } from 'playwright';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = file => path.join(root, file).replaceAll('\\', '/');
const folder = path.join(root, 'test-results', `package-builder-${Date.now()}`);
mkdirSync(folder, { recursive: true });

const ONE_TIME = { id: 'business-starter', name: 'Business Starter', billing: 'one_time', portalUploads: true, paymentOptions: ['full', 'installments_3'], inclusions: ['Website', 'Hosting setup'] };
// A monthly package: one fixed monthly price (₹600), 2 updates a month in the portal (src/docs/monthlypackage.md).
const MONTHLY = { id: 'data-entry', name: 'Data Entry', billing: 'monthly', portalUploads: true, inclusions: ['Monthly data entry'],
  monthly: { billingOptions: [{ billingCycle: 'monthly', discountPercent: 0 }, { billingCycle: 'quarterly', discountPercent: 10 }], maxTenureMonths: 6, uploadsPerMonth: 2 } };
const clientEntry = `
import React from 'react';import{createRoot}from'react-dom/client';
import{PackageBuilder}from'@/components/packages/package-builder';
import{initialPackageChoice}from'@/lib/package-choice';
import '${src('src/app/globals.css')}';
const params=new URLSearchParams(location.search);const item=JSON.parse(params.get('pkg'));const signedIn=params.get('signed')==='1';
const query=Object.fromEntries(params.entries());
createRoot(document.getElementById('app')).render(<main style={{padding:'0 16px',maxWidth:1180,margin:'auto'}}><PackageBuilder item={item} terms={['Taxes extra.']} initial={initialPackageChoice(item,query)} signedIn={signedIn} countries={params.get('emptyCountries')==='1'?[]:[{code:'+91',label:'India',digits:10}]} path={'/package/'+item.id+'/customize'} portalUrl="https://portal.example.test"/></main>);
`;
await build({ stdin: { contents: clientEntry, resolveDir: root, sourcefile: 'package-builder-fixture.tsx', loader: 'tsx' }, outfile: path.join(folder, 'client.js'), bundle: true, platform: 'browser', conditions: ['style', 'browser'], jsx: 'automatic', tsconfig: path.join(root, 'tsconfig.json'), plugins: [{ name: 'browser-fixtures', setup(builder) {
  builder.onResolve({ filter: /^@\/components\/loading\/navigation$/ }, () => ({ path: 'navigation', namespace: 'test' }));
  builder.onLoad({ filter: /^navigation$/, namespace: 'test' }, () => ({ contents: `export const useNavigate=()=>({push:href=>{window.__pushed=href}});export const onLeaveClick=()=>{};export const quietFetch=(...args)=>window.fetch(...args);export const InlineLoader=()=><span className="inline-loader" aria-hidden="true"><i/><i/><i/></span>;`, loader: 'tsx', resolveDir: root }));
} }] });

// The backend's own maths (servicePlanPricing.js / projectInstallments.js), for the two fixture packages.
function quote(body) {
  const { packageId, choice } = body;
  if (packageId === ONE_TIME.id) {
    const total = 9999;
    const parts = choice.paymentOption === 'installments_3' ? [[30, 2999.7, null], [30, 2999.7, 50], [40, 3999.6, 90]].map(([percentage, amount, progressThreshold], i) => ({ installmentNumber: i + 1, percentage, amount, progressThreshold })) : [];
    return { packageId, quoteKey: 'qk-' + packageId, billing: 'one_time', paymentOption: choice.paymentOption, installments: parts, regularPrice: total, discountAmount: 0, finalPrice: total, dueNow: parts[0]?.amount ?? total, offer: null };
  }
  const months = { monthly: 1, quarterly: 3 }[choice.billingCycle];
  const discount = choice.billingCycle === 'quarterly' ? 10 : 0;
  const perMonth = 600;
  const cyclePrice = Math.round(perMonth * months * (1 - discount / 100));
  const totalCycles = choice.tenureMonths / months;
  return { packageId, quoteKey: 'qk-' + packageId, billing: 'monthly', regularPrice: cyclePrice * totalCycles, discountAmount: 0, finalPrice: cyclePrice * totalCycles, dueNow: cyclePrice, offer: null,
    monthly: { billingCycle: choice.billingCycle, cycleMonths: months, tenureMonths: choice.tenureMonths, totalCycles, uploadsPerMonth: 2, perMonthPrice: perMonth, discountPercent: discount, cyclePrice, totalPrice: cyclePrice * totalCycles } };
}
const quotes = [], requests = [], purchases = [];
let balance = 0, purchaseApproved = false, needsPhone = false;
const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const json = (body, status = 200) => { response.statusCode = status; response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify(body)); };
  const body = async () => { let raw = ''; for await (const chunk of request) raw += chunk; return JSON.parse(raw || '{}'); };
  if (url.pathname === '/api/time') return json({ now: Date.now() });
  if (url.pathname === '/api/package-quote') { const input = await body(); quotes.push(input); return json({ quote: quote(input) }); }
  if (url.pathname === '/api/package-purchase' && request.method === 'GET') return json({ walletBalance: balance, upiId: 'shop@bank', payeeName: 'Test Shop' });
  if (url.pathname === '/api/package-purchase') { const input = await body(); purchases.push(input); return json({ orderId: 'o1', approved: purchaseApproved }, 201); }
  if (url.pathname === '/api/package-starts' && request.method === 'GET') return json({ requests: [], enabled: true });
  // The request takes a moment, as the real one does, so the button's loader can be seen.
  if (url.pathname === '/api/package-starts') { const input = await body(); requests.push(input); await new Promise(resolve => setTimeout(resolve, 400)); if (needsPhone && !input.phone) return json({ error: 'Add your mobile number to start your project' }, 428); return json({ request: { id: 'r1', packageId: input.packageId, kind: input.kind, status: 'requested', choice: input.choice } }); }
  if (url.pathname === '/client.js' || url.pathname === '/client.css') { response.setHeader('Content-Type', url.pathname.endsWith('css') ? 'text/css' : 'text/javascript'); return response.end(readFileSync(path.join(folder, url.pathname.slice(1)))); }
  response.setHeader('Content-Type', 'text/html');
  response.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/client.css"></head><body><div id="app"></div><script src="/client.js"></script></body></html>');
});
let browser;
try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const open = async (item, extra = '') => { await page.goto(`${origin}/?pkg=${encodeURIComponent(JSON.stringify(item))}${extra}`); await page.waitForSelector('[aria-label="Your package"]'); };
  const side = page.getByRole('complementary', { name: 'Your package' });
  const sideways = async () => page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);

  // The actual signed-out page passes an empty country list until sign-in.
  await open(ONE_TIME, '&emptyCountries=1');
  await side.getByRole('button', { name: 'Sign in to proceed →' }).waitFor();
  assert.deepEqual(errors, [], 'a visitor can customize a package without a country list');

  // One-time: only the offered ways to pay; the installments and due-now amount come from the quote.
  await open(ONE_TIME, '&signed=1');
  await side.getByText('Pay once').waitFor();
  // The ways to pay sit in the "Your package" card; the left holds what is included and a link to the terms.
  assert.equal(await side.getByRole('button', { name: /3 installments/ }).count(), 1, 'the payment choice is in the side card');
  assert.equal(await page.getByText('Taxes extra.').isVisible(), false, 'terms are not written out on the page');
  await page.getByRole('button', { name: 'Terms & exclusions' }).click();
  assert.match(await page.getByRole('dialog', { name: 'Terms & exclusions' }).innerText(), /Taxes extra./);
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('button', { name: /2 installments/ }).count(), 0, 'not offered by this package');
  await page.getByRole('button', { name: /3 installments/ }).click();
  await side.getByText('Due at the start').waitFor();
  assert.match(await side.innerText(), /₹2,999\.7[\s\S]*₹9,999 in total/);
  assert.match(await side.innerText(), /at 50% progress/);
  await page.screenshot({ path: path.join(folder, 'one-time.png') });
  assert.deepEqual(quotes.at(-1), { packageId: 'business-starter', choice: { paymentOption: 'installments_3' } });
  // The wallet and what UPI will pay are in the card before paying; nothing in the wallet, so the button goes on to UPI.
  await side.getByText('Wallet balance: ₹0').waitFor();
  assert.match(await side.innerText(), /Paid from wallet[\s\S]*₹0[\s\S]*To pay by UPI[\s\S]*₹2,999\.7/);
  await side.getByRole('button', { name: 'Continue to UPI' }).click();
  // While the request is sent the button shows the site's three-dot loader and "Processing…", never "Sending…".
  const working = side.getByRole('button', { name: /Processing…/ });
  await working.waitFor();
  assert.equal(await working.locator('.inline-loader').count(), 1, 'the three-dot loader is in the button');
  assert.equal(await side.getByRole('button', { name: /Sending/ }).count(), 0);
  assert.equal(await sideways(), false);

  // The UPI step opens in the same card (no popup): the QR, the payee and the reference.
  // The customer is not shown a "request received" note; the request carries kind buy (the team is told, the customer is not).
  await side.getByRole('heading', { name: 'Pay ₹2,999.7 by UPI' }).waitFor();
  assert.equal(await page.locator('dialog[open]').count(), 0, 'no payment popup');
  assert.deepEqual(requests.at(-1), { packageId: 'business-starter', kind: 'buy', choice: { paymentOption: 'installments_3' } });
  assert.doesNotMatch(await side.innerText(), /Request received/);
  assert.equal(await side.locator('svg').count() > 0, true, 'the UPI QR is shown');
  assert.match(await side.innerText(), /shop@bank \(Test Shop\)/);
  const payButton = side.getByRole('button', { name: /I have paid ₹2,999\.7/ });
  assert.equal(await payButton.isDisabled(), true, 'a UPI payment needs its reference');
  await side.getByLabel(/UPI reference/).fill('12345');
  assert.equal(await payButton.isDisabled(), true, 'a short reference is refused');
  // Back returns to the choice and the bill; going on again asks for the UPI step.
  await side.getByRole('button', { name: 'Back' }).click();
  await side.getByText('Due at the start').waitFor();
  await side.getByRole('button', { name: 'Continue to UPI' }).click();
  await side.getByRole('heading', { name: 'Pay ₹2,999.7 by UPI' }).waitFor();
  await side.getByLabel(/UPI reference/).fill('123456789012');
  await payButton.click();
  await side.getByText('✓ Payment submitted').waitFor();
  assert.match(await side.innerText(), /Once our team confirms your UPI payment, your work will start within 4 to 24 hours/);
  assert.equal(purchases.length, 1);
  assert.deepEqual({ ...purchases[0], creationKey: typeof purchases[0].creationKey }, { packageId: 'business-starter', choice: { paymentOption: 'installments_3' },
    quoteKey: 'qk-business-starter', dueNow: 2999.7, creationKey: 'string', upiTransactionId: '123456789012' });
  assert.match(purchases[0].creationKey, /^[a-zA-Z0-9-]{16,80}$/);
  assert.equal(await side.getByRole('link', { name: /Open my project in the portal/ }).getAttribute('href'), 'https://portal.example.test/order-detail/o1');
  assert.equal(await side.getByRole('button', { name: /Proceed to pay|Continue to UPI|Sign in to proceed/ }).count(), 0, 'nothing left to buy again');

  // A wallet that covers the payment: no QR, no reference, and the project is created at once.
  balance = 20000; purchaseApproved = true;
  await open(ONE_TIME, '&signed=1');
  await side.getByText('Your wallet covers it').waitFor();
  assert.match(await side.innerText(), /Paid from wallet[\s\S]*₹9,999/);
  await side.getByRole('button', { name: 'Pay ₹9,999 from wallet' }).click();
  await side.getByText('✓ Payment received').waitFor();
  assert.equal(await side.locator('svg').count() > 0, false, 'no QR when the wallet pays');
  assert.match(await side.innerText(), /Your work will start within 4 to 24 hours/);
  assert.equal(purchases.length, 2);
  assert.equal(purchases[1].upiTransactionId, undefined);
  assert.equal(purchases[1].dueNow, 9999);
  assert.equal(await sideways(), false);
  balance = 0; purchaseApproved = false;

  // This page only buys: one button, "Proceed to pay", and no callback (a callback is asked for on the package page).
  const shots = process.env.SHOT_DIR;
  await open(ONE_TIME, '&signed=1');
  const get = side.getByRole('button', { name: /Proceed to pay →|Continue to UPI/ });
  await get.waitFor();
  assert.equal(await page.getByRole('button', { name: /callback/i }).count(), 0, 'no callback button on the customize page');
  assert.equal(await page.getByRole('dialog', { name: 'Arrange a callback for this package?' }).count(), 0, 'no callback dialog on the customize page');
  assert.equal(await page.getByText(/Get this package/).count(), 0, 'the button is not called Get this package here');
  if (shots) await side.screenshot({ path: path.join(shots, 'side-1440.png') });
  // A buy that failed for a missing phone shows its field and error beside Proceed to pay.
  needsPhone = true;
  await open(ONE_TIME, '&signed=1');
  await get.click();
  await side.getByRole('alert').getByText(/Add your mobile number/).waitFor();
  needsPhone = false;

  // Monthly: cycle and length (no files or updates to pick); the visitor signs in and comes back to the same choice.
  await open(MONTHLY);
  await side.getByText('Per month').waitFor();
  assert.equal(await page.getByLabel('Files per update').count(), 0, 'no per file choices');
  await page.getByRole('button', { name: /Quarterly/ }).click();
  await page.getByRole('button', { name: '6 months' }).click();
  await side.getByText('Every 3 months').waitFor();
  await page.waitForFunction(() => /₹1,620/.test(document.querySelector('[aria-label="Your package"]').innerText));
  assert.match(await side.innerText(), /Monthly price[\s\S]*₹600[\s\S]*10% period discount[\s\S]*₹1,620[\s\S]*2 payments, ₹3,240 in total/);
  assert.match(await side.innerText(), /2 updates a month in the portal/);
  assert.match(await side.innerText(), /Stop any time/);
  await side.getByRole('button', { name: 'Sign in to proceed →' }).click();
  const back = decodeURIComponent((await page.evaluate(() => window.__pushed)).replace('/login?next=', ''));
  assert.equal(back, '/package/data-entry/customize?cycle=quarterly&months=6');
  const intent = JSON.parse(await page.evaluate(() => sessionStorage.getItem('pending-package-start')));
  assert.equal(intent.packageId, 'data-entry'); assert.equal(intent.kind, 'buy');
  // Coming back signed in with that address: the same choice, sent once.
  await page.goto(`${origin}/?pkg=${encodeURIComponent(JSON.stringify(MONTHLY))}&signed=1&cycle=quarterly&months=6`);
  // The request goes out on return; the button then goes on to the payment (the same label before and after).
  await side.getByRole('button', { name: /Proceed to pay →|Continue to UPI/ }).waitFor();
  for (let i = 0; i < 50 && requests.at(-1)?.packageId !== 'data-entry'; i++) await page.waitForTimeout(100);
  assert.deepEqual(requests.at(-1), { packageId: 'data-entry', kind: 'buy', choice: { billingCycle: 'quarterly', tenureMonths: 6 } });

  // Phones: the bar keeps the price and the button in reach; nothing scrolls sideways.
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 800 });
    await open(MONTHLY);
    await page.locator('[class*="mobileBar"]').getByText(/₹600 \/ month/).waitFor();
    assert.equal(await sideways(), false, `no sideways scroll at ${width}px`);
    // On a phone the page has one button in the package card and one in the bar, and no callback.
    assert.equal(await page.getByRole('button', { name: /callback/i }).count(), 0, `no callback button at ${width}px`);
    await side.getByRole('button', { name: 'Sign in to proceed →' }).scrollIntoViewIfNeeded();
    if (shots) await side.screenshot({ path: path.join(shots, `side-${width}.png`) });
  }
  // The UPI step on a phone: inside the screen, QR and reference reachable, nothing scrolls sideways.
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 700 });
    await open(ONE_TIME, '&signed=1');
    await side.getByText('Wallet balance: ₹0').waitFor();
    await page.locator('[class*="mobileBar"]').getByRole('button').click();
    await side.getByRole('heading', { name: /by UPI/ }).waitFor();
    const box = await side.boundingBox();
    assert.ok(box.x >= 0 && box.x + box.width <= width, `the card fits a ${width}px screen`);
    await side.getByLabel(/UPI reference/).scrollIntoViewIfNeeded();
    assert.equal(await sideways(), false, `no sideways scroll with the UPI step at ${width}px`);
    assert.equal(await page.locator('[class*="mobileBar"]').count(), 0, 'the bar steps aside while the UPI step is open');
    await page.screenshot({ path: path.join(folder, `upi-${width}.png`) });
  }
  await page.screenshot({ path: path.join(folder, 'phone.png'), fullPage: true });
  assert.deepEqual(errors, []);
  console.log('PASS: package customize page — one-time options and installments from the quote, request with the choice, monthly cycle/length, sign-in keeps the choice, phone bar, no sideways scroll at 1440/390/320.');
} finally {
  await browser?.close();
  server.close();
}
