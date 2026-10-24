// Production React components in an isolated browser harness. Navigation/auth and
// transport are fixtures; real backend persistence/concurrency lives in its replica-set suite.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import http from 'node:http';

test('reserve login continuation, stale quotes, retries, expired history and server-clock countdown', async () => {
  const bundle = await build({ bundle: true, write: false, platform: 'browser', jsx: 'automatic', tsconfig: 'tsconfig.json', define: { 'process.env.NODE_ENV': '"production"' },
    stdin: { contents: `import React from 'react';import{createRoot}from'react-dom/client';import{ReserveOffer,MyOffers}from'./src/components/offer-reservations';import{LoginForm}from'./src/app/login/login-form';
      fetch('/fixture').then(r=>r.json()).then(s=>createRoot(document.getElementById('root')).render(location.pathname==='/account/offers'?<MyOffers serverNow={s.now}/>:location.pathname==='/login'?<LoginForm next={new URLSearchParams(location.search).get('next')||'/'} portalApiUrl={location.origin} portalUrl={location.origin}/>:<ReserveOffer slug="test-offer" quoteKey={s.quoteKey} endsAt={s.endsAt} signedIn={s.signedIn} serverNow={s.now}/>));`, loader: 'tsx', resolveDir: process.cwd() },
    plugins: [{ name: 'navigation-fixture', setup(builder) {
      builder.onResolve({ filter: /^@\/components\/link$/ }, () => ({ path: 'link', namespace: 'fixture' }));
      builder.onLoad({ filter: /^link$/, namespace: 'fixture' }, () => ({ contents: `import React from 'react';export default function Link(props){return <a {...props}/>}`, loader: 'tsx', resolveDir: process.cwd() }));
      builder.onResolve({ filter: /^@\/components\/loading\/navigation$/ }, () => ({ path: 'navigation', namespace: 'fixture' }));
      builder.onLoad({ filter: /^navigation$/, namespace: 'fixture' }, () => ({ contents: `export const useNavigate=()=>({push:p=>location.assign(p),assign:p=>location.assign(p),refresh:()=>{},pending:false});export const useTask=()=>({busy:false,track:fn=>fn()});` }));
    } }],
  });
  const now = Date.parse('2026-10-24T12:00:00Z');
  let signedIn = false, quoteKey = 'version-1', rows = [], posts = 0, failNext = false;
  const row = () => ({ id: 'reservation-1', offerSlug: 'test-offer', title: 'Reserved website', reservedPrice: 5000, regularPrice: 10000,
    terms: ['Agreed scope'], reservedAt: new Date(now).toISOString(), expiresAt: new Date(now + 72 * 3600000).toISOString(), status: 'reserved', projectId: null, confirmationStatus: 'pending' });
  const server = http.createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/app.js') { res.setHeader('Content-Type', 'application/javascript'); return res.end(bundle.outputFiles[0].contents); }
    if (req.url === '/api/time') return res.end(JSON.stringify({ now }));
    if (req.url === '/fixture') return res.end(JSON.stringify({ signedIn, quoteKey, now: new Date(now).toISOString(), endsAt: new Date(now + 3600000).toISOString() }));
    if (req.url === '/api/signin') { signedIn = true; return res.end(JSON.stringify({ success: true, data: {} })); }
    if (req.url === '/api/offer-reservations') {
      if (!signedIn) { res.statusCode = 401; return res.end(JSON.stringify({ error: 'Sign in' })); }
      if (req.method === 'POST') {
        posts++; if (failNext) { failNext = false; res.statusCode = 503; return res.end(JSON.stringify({ error: 'Temporary outage' })); }
        let raw = ''; for await (const chunk of req) raw += chunk;
        if (JSON.parse(raw).quoteKey !== quoteKey) { res.statusCode = 409; return res.end(JSON.stringify({ error: 'Offer changed' })); }
        if (!rows.length) rows = [row()];
        return res.end(JSON.stringify({ reservation: rows[0], serverNow: new Date(now).toISOString() }));
      }
      return res.end(JSON.stringify({ reservations: rows, serverNow: new Date(now).toISOString() }));
    }
    res.setHeader('Content-Type', 'text/html'); res.end('<div id="root"></div><script src="/app.js"></script>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  const errors = [];
  try {
    const page = await browser.newPage(); page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin + '/offer/test-offer');
    await page.getByRole('button', { name: 'Reserve offer', exact: true }).click();
    await page.waitForURL('**/login?next=*');
    assert.equal(new URL(page.url()).searchParams.get('next'), '/offer/test-offer');
    await page.getByLabel('Email address').fill('member@example.test');
    await page.getByLabel('Password', { exact: true }).fill('test-password');
    await page.getByRole('button', { name: 'Sign in →', exact: true }).click();
    await page.waitForURL('**/offer/test-offer');
    await page.getByText('Reserved', { exact: true }).waitFor();
    assert.equal(posts, 1, 'Login automatically performs the pending POST once');
    await page.reload(); await page.getByText('Reserved', { exact: true }).waitFor(); assert.equal(posts, 1);
    // Expired rows remain grey on My Offers, even with a badly wrong device clock/timezone.
    rows = [{ ...row(), expiresAt: new Date(now - 1000).toISOString(), status: 'expired' }];
    await page.addInitScript(() => { Date.now = () => 0; });
    await page.goto(origin + '/account/offers'); await page.getByText('Expired', { exact: true }).waitFor();
    assert.equal(await page.locator('article').evaluate(node => getComputedStyle(node).backgroundColor), 'rgb(243, 244, 246)');
    assert.match(await page.locator('article').innerText(), /IST/);
    await page.close();
    const stale = await browser.newPage(); stale.on('pageerror', error => errors.push(error.message));
    signedIn = false; rows = []; quoteKey = 'version-1';
    await stale.goto(origin + '/offer/test-offer'); await stale.getByRole('button', { name: 'Reserve offer', exact: true }).click(); await stale.waitForURL('**/login?next=*');
    quoteKey = 'version-2'; signedIn = true;
    await stale.goto(origin + '/offer/test-offer');
    await stale.getByRole('alert').filter({ hasText: 'Please review' }).waitFor(); assert.equal(posts, 1, 'Changed quote needs a fresh click');
    failNext = true; await stale.getByRole('button', { name: 'Reserve offer', exact: true }).click();
    await stale.getByRole('alert').filter({ hasText: 'Temporary outage' }).waitFor();
    await stale.getByRole('button', { name: 'Reserve offer', exact: true }).click(); await stale.getByText('Reserved', { exact: true }).waitFor();
    assert.equal(posts, 3);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
});
