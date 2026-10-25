// Production React components in an isolated browser harness: the offer card exactly as
// src/app/offer/[slug]/page.tsx composes it, My Offers and the login form. Navigation/auth and
// transport are fixtures; real backend persistence/concurrency lives in its replica-set suite.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import http from 'node:http';

test('offer card reserve flow: one main button, dialog, sign-in continuation, retries, history and a card that never grows', async () => {
  const bundle = await build({ bundle: true, write: false, outdir: 'out', platform: 'browser', jsx: 'automatic', tsconfig: 'tsconfig.json', conditions: ['style', 'browser'], define: { 'process.env.NODE_ENV': '"production"' },
    stdin: { contents: `import React from 'react';import{createRoot}from'react-dom/client';import{MyOffers}from'./src/components/offer-reservations';import{LoginForm}from'./src/app/login/login-form';
      import{PublicInteraction}from'./src/components/campaign/public-interaction/page-content';import{DEFAULT_OFFER,DEFAULT_UNIVERSAL_TERMS,resolvedTerms}from'./src/lib/offers';import './src/app/globals.css';
      fetch('/fixture').then(r=>r.json()).then(s=>{const offer={...DEFAULT_OFFER,slug:'test-offer',endsAt:s.endsAt,...(s.targets?{targets:s.targets}:{}),...(s.windowHours?{reserveWindowHours:s.windowHours}:{})};
      createRoot(document.getElementById('root')).render(location.pathname==='/account/offers'?<MyOffers serverNow={s.now}/>:location.pathname==='/login'?<LoginForm next={new URLSearchParams(location.search).get('next')||'/'} portalApiUrl={location.origin} portalUrl={location.origin}/>
      :<PublicInteraction key={s.signedIn?'member':'anonymous'} offer={offer} terms={resolvedTerms(offer,DEFAULT_UNIVERSAL_TERMS)} reservation={{slug:'test-offer',quoteKey:s.quoteKey,signedIn:s.signedIn,serverNow:s.now}}/>);});`, loader: 'tsx', resolveDir: process.cwd() },
    plugins: [{ name: 'navigation-fixture', setup(builder) {
      builder.onResolve({ filter: /^@\/components\/link$/ }, () => ({ path: 'link', namespace: 'fixture' }));
      builder.onLoad({ filter: /^link$/, namespace: 'fixture' }, () => ({ contents: `import React from 'react';export default function Link(props){return <a {...props}/>}`, loader: 'tsx', resolveDir: process.cwd() }));
      builder.onResolve({ filter: /^@\/components\/loading\/navigation$/ }, () => ({ path: 'navigation', namespace: 'fixture' }));
      builder.onLoad({ filter: /^navigation$/, namespace: 'fixture' }, () => ({ contents: `export const useNavigate=()=>({push:p=>location.assign(p),assign:p=>location.assign(p),refresh:()=>{},pending:false});export const useTask=()=>({busy:false,track:fn=>fn()});` }));
    } }],
  });
  const js = bundle.outputFiles.find(file => file.path.endsWith('.js')).contents, css = bundle.outputFiles.find(file => file.path.endsWith('.css'))?.contents ?? '';
  const now = Date.parse('2026-10-24T12:00:00Z');
  let signedIn = false, quoteKey = 'version-1', rows = [], posts = 0, failNext = false, needPhone = false, sentPhone = null, endsIn = 1, targets = null, windowHours = null;
  const row = () => ({ id: 'reservation-1', offerSlug: 'test-offer', title: 'Reserved website', reservedPrice: 5000, regularPrice: 10000,
    terms: ['Agreed scope'], reservedAt: new Date(now).toISOString(), expiresAt: new Date(now + 72 * 3600000).toISOString(), status: 'reserved', projectId: null, confirmationStatus: 'pending' });
  const server = http.createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/app.js') { res.setHeader('Content-Type', 'application/javascript'); return res.end(js); }
    if (req.url === '/app.css') { res.setHeader('Content-Type', 'text/css'); return res.end(css); }
    if (req.url === '/api/time') return res.end(JSON.stringify({ now }));
    if (req.url === '/fixture') return res.end(JSON.stringify({ signedIn, quoteKey, targets, windowHours, now: new Date(now).toISOString(), endsAt: new Date(now + endsIn * 3600000).toISOString() }));
    if (req.url === '/api/signin') { signedIn = true; return res.end(JSON.stringify({ success: true, data: {} })); }
    if (req.url === '/api/offer-reservations') {
      if (!signedIn) { res.statusCode = 401; return res.end(JSON.stringify({ error: 'Sign in' })); }
      if (req.method === 'POST') {
        posts++; if (failNext) { failNext = false; res.statusCode = 503; return res.end(JSON.stringify({ error: 'Temporary outage' })); }
        let raw = ''; for await (const chunk of req) raw += chunk;
        const sent = JSON.parse(raw);
        if (sent.quoteKey !== quoteKey) { res.statusCode = 409; return res.end(JSON.stringify({ error: 'Offer changed' })); }
        if (needPhone && !sent.phone) { res.statusCode = 428; return res.end(JSON.stringify({ error: 'Add your mobile number to reserve this offer' })); }
        sentPhone = sent.phone ? { countryCode: sent.countryCode, phone: sent.phone } : null;
        if (!rows.length) rows = [row()];
        else if (rows[0].status === 'expired' && rows[0].periodEndsAt && Date.parse(rows[0].periodEndsAt) < now) rows = [row(), ...rows];
        return res.end(JSON.stringify({ reservation: rows[0], serverNow: new Date(now).toISOString() }));
      }
      return res.end(JSON.stringify({ reservations: rows, serverNow: new Date(now).toISOString() }));
    }
    res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script src="/app.js"></script></body></html>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  const errors = [];
  const open = async (viewport = { width: 1280, height: 900 }) => {
    const page = await browser.newPage({ viewport }); page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin + '/offer/test-offer'); await page.getByRole('timer').waitFor(); return page;
  };
  const card = page => page.locator('section[aria-label]').filter({ has: page.getByRole('timer') });
  const main = page => card(page).locator('[class*="claim"]');
  const sticky = page => page.locator('[class*="sticky"]').getByRole('link').or(page.locator('[class*="sticky"]').getByRole('button'));
  const dialog = page => page.getByRole('dialog', { name: 'Reserve this price for 72 hours' });
  try {
    // 1. Logged out: Reserve explains first, then sign-in continues and reserves exactly once.
    const page = await open();
    assert.equal(await main(page).innerText(), 'Reserve price for 72 hours');
    assert.equal(await sticky(page).innerText(), 'Reserve price for 72 hours');
    assert(await card(page).getByRole('link', { name: 'Have a question? Enquire' }).isVisible(), 'enquiry stays available');
    await main(page).click();
    await dialog(page).getByText(/Reserving needs an account/).waitFor();
    await dialog(page).getByRole('button', { name: 'Continue to sign in' }).click();
    await page.waitForURL('**/login?next=*');
    assert.equal(new URL(page.url()).searchParams.get('next'), '/offer/test-offer');
    await page.getByLabel('Email address').fill('member@example.test');
    await page.getByLabel('Password', { exact: true }).fill('test-password');
    await page.getByRole('button', { name: 'Sign in →', exact: true }).click();
    await page.waitForURL('**/offer/test-offer');
    await main(page).filter({ hasText: /^Reserved · 7[12]h [0-9]+m left$/ }).waitFor();
    assert.equal(posts, 1, 'Login automatically performs the pending POST once');
    assert.equal(await main(page).getAttribute('href'), '/account/offers');
    assert.match(await sticky(page).innerText(), /^Reserved · /);
    await page.reload(); await main(page).filter({ hasText: /^Reserved/ }).waitFor(); assert.equal(posts, 1);
    // Expired rows remain grey on My Offers, even with a badly wrong device clock/timezone.
    rows = [{ ...row(), expiresAt: new Date(now - 1000).toISOString(), status: 'expired' }];
    await page.addInitScript(() => { Date.now = () => 0; });
    await page.goto(origin + '/account/offers'); await page.getByText('Expired', { exact: true }).waitFor();
    assert.match(await page.locator('article').getAttribute('class'), /is-expired/);
    assert.match(await page.locator('article').innerText(), /IST/);
    // A payment submitted in time and awaiting approval is not shown as expired after the deadline.
    rows = [{ ...row(), projectId: 'project-1', expiresAt: new Date(now - 1000).toISOString(), status: 'under_review' }];
    await page.goto(origin + '/account/offers'); await page.getByText('Payment under review', { exact: true }).waitFor();
    assert.doesNotMatch(await page.locator('article').getAttribute('class'), /is-expired/);
    assert.equal(await page.getByText('Expired', { exact: true }).count(), 0);
    await page.close();

    // 2. A changed quote while signing in needs a fresh confirmation; a failed request can be retried.
    signedIn = false; rows = []; quoteKey = 'version-1';
    const stale = await open();
    await main(stale).click(); await dialog(stale).getByRole('button', { name: 'Continue to sign in' }).click(); await stale.waitForURL('**/login?next=*');
    quoteKey = 'version-2'; signedIn = true;
    await stale.goto(origin + '/offer/test-offer');
    await dialog(stale).getByRole('alert').filter({ hasText: 'Please review' }).waitFor(); assert.equal(posts, 1, 'Changed quote needs a fresh click');
    failNext = true; await dialog(stale).getByRole('button', { name: 'Confirm reservation' }).click();
    await dialog(stale).getByRole('alert').filter({ hasText: 'Temporary outage' }).waitFor();
    await dialog(stale).getByRole('button', { name: 'Confirm reservation' }).click();
    await main(stale).filter({ hasText: /^Reserved/ }).waitFor();
    assert.equal(posts, 3);
    assert.equal(await dialog(stale).isVisible(), false, 'the dialog closes after reserving');

    // 3. An older account without a phone is asked once, inside the dialog.
    rows = []; needPhone = true; sentPhone = null;
    const phoneless = await open();
    await main(phoneless).click(); await dialog(phoneless).getByRole('button', { name: 'Confirm reservation' }).click();
    await dialog(phoneless).getByRole('alert').filter({ hasText: 'mobile number' }).waitFor();
    assert.equal(await dialog(phoneless).getByRole('button', { name: 'Confirm reservation' }).isDisabled(), true, 'Phone is required before retrying');
    await dialog(phoneless).getByLabel('Mobile number', { exact: true }).fill('98765 43210');
    await dialog(phoneless).getByRole('button', { name: 'Confirm reservation' }).click();
    await main(phoneless).filter({ hasText: /^Reserved/ }).waitFor();
    assert.deepEqual(sentPhone, { countryCode: '+91', phone: '98765 43210' });

    // 4. Signup sends the phone with the account.
    signedIn = false; let signupBody = null;
    const signupPage = await browser.newPage(); signupPage.on('pageerror', error => errors.push(error.message));
    await signupPage.route('**/api/signup', async route => { signupBody = JSON.parse(route.request().postData()); await route.fulfill({ json: { success: true } }); });
    await signupPage.route('**/api/signin', route => route.fulfill({ json: { success: false, message: 'stop here' } }));
    await signupPage.goto(origin + '/login');
    await signupPage.getByRole('button', { name: 'Create an account', exact: true }).click();
    await signupPage.getByLabel('Your name').fill('New member');
    await signupPage.getByLabel('Email address').fill('new@example.test');
    await signupPage.getByLabel('Mobile number', { exact: true }).fill('9876543210');
    await signupPage.getByLabel('Password', { exact: true }).fill('secret1');
    await signupPage.getByRole('button', { name: 'Create account →', exact: true }).click();
    await signupPage.getByRole('alert').filter({ hasText: 'stop here' }).waitFor();
    assert.deepEqual({ countryCode: signupBody.countryCode, phone: signupBody.phone }, { countryCode: '+91', phone: '9876543210' });

    // 5. A later eligible period offers a new reservation while retaining expired history.
    signedIn = true; needPhone = false;
    rows = [{ ...row(), id: 'old-period', periodEndsAt: new Date(now - 2 * 3600000).toISOString(), expiresAt: new Date(now - 1000).toISOString(), status: 'expired' }];
    const renew = await open();
    await main(renew).filter({ hasText: 'Reserve price for 72 hours' }).waitFor();
    await main(renew).click(); await dialog(renew).getByRole('button', { name: 'Confirm reservation' }).click();
    await main(renew).filter({ hasText: /^Reserved/ }).waitFor();
    assert.equal(rows.length, 2); assert.equal(rows[1].id, 'old-period');
    // A project-attached historical reservation cannot be renewed by the UI.
    rows = [{ ...rows[1], projectId: 'existing-project' }];
    await renew.reload(); await main(renew).filter({ hasText: 'Reservation expired' }).waitFor();
    assert.equal(await renew.getByRole('button', { name: 'Reserve price for 72 hours' }).count(), 0);

    // 6. Only live project offers inside their window show Reserve; the window is per offer.
    signedIn = false; rows = [];
    targets = ['service_plans'];
    const service = await open();
    assert.equal(await main(service).innerText(), 'Enquire about this offer');
    assert.equal(await service.getByRole('button', { name: /Reserve/ }).count(), 0, 'service-plan offers are never reserved');
    targets = null; endsIn = 30;
    const early = await open();
    assert.equal(await main(early).innerText(), 'Enquire about this offer', 'default window: 24 hours');
    assert(await card(early).getByText('Opens email', { exact: true }).isVisible());
    windowHours = 48;
    const wide = await open();
    assert.equal(await main(wide).innerText(), 'Reserve price for 72 hours', '48-hour window opens 30 hours before the end');

    // 7. The card keeps the same size in every state, on desktop and on a phone.
    for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
      const heights = {};
      const measure = async (name, setup, act) => {
        Object.assign(globalThis, {}); ({ signedIn, rows, needPhone, endsIn, windowHours, targets } = { signedIn: false, rows: [], needPhone: false, endsIn: 1, windowHours: null, targets: null, ...setup });
        const view = await open(viewport); if (act) await act(view);
        heights[name] = Math.round((await card(view).boundingBox()).height);
        assert.equal(await view.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${name}: no horizontal scroll`);
        await view.close();
      };
      await measure('normal', { endsIn: 72 });
      await measure('reserve open', {});
      await measure('phone asked', { signedIn: true, needPhone: true }, async view => { await main(view).click(); await dialog(view).getByRole('button', { name: 'Confirm reservation' }).click(); await dialog(view).getByLabel('Mobile number', { exact: true }).waitFor(); });
      await measure('reserved', { signedIn: true, rows: [row()] }, async view => { await main(view).filter({ hasText: /^Reserved/ }).waitFor(); });
      assert.equal(new Set(Object.values(heights)).size, 1, `${viewport.width}px card heights: ${JSON.stringify(heights)}`);
    }
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
});
