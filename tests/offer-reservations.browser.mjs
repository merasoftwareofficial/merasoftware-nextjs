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
  let signedIn = false, quoteKey = 'version-1', rows = [], posts = 0, failNext = false, needPhone = false, sentPhone = null;
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
    assert.match(await page.locator('article').getAttribute('class'), /is-expired/);
    assert.match(await page.locator('article').innerText(), /IST/);
    // A payment submitted in time and awaiting approval is not shown as expired after the deadline.
    rows = [{ ...row(), projectId: 'project-1', expiresAt: new Date(now - 1000).toISOString(), status: 'under_review' }];
    await page.goto(origin + '/account/offers'); await page.getByText('Payment under review', { exact: true }).waitFor();
    assert.doesNotMatch(await page.locator('article').getAttribute('class'), /is-expired/);
    assert.equal(await page.getByText('Expired', { exact: true }).count(), 0);
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
    // Step 2: an older account without a phone is asked once, then the same click reserves.
    const phoneless = await browser.newPage(); phoneless.on('pageerror', error => errors.push(error.message));
    rows = []; needPhone = true; sentPhone = null;
    await phoneless.goto(origin + '/offer/test-offer');
    await phoneless.getByRole('button', { name: 'Reserve offer', exact: true }).click();
    await phoneless.getByRole('alert').filter({ hasText: 'mobile number' }).waitFor();
    assert.equal(await phoneless.getByRole('button', { name: 'Reserve offer', exact: true }).isDisabled(), true, 'Phone is required before retrying');
    await phoneless.getByLabel('Mobile number', { exact: true }).fill('98765 43210');
    await phoneless.getByRole('button', { name: 'Reserve offer', exact: true }).click();
    await phoneless.getByText('Reserved', { exact: true }).waitFor();
    assert.deepEqual(sentPhone, { countryCode: '+91', phone: '98765 43210' });
    // Signup sends the phone with the account.
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
    // A later eligible period offers a new reservation while retaining expired history.
    signedIn = true; needPhone = false;
    rows = [{ ...row(), id: 'old-period', periodEndsAt: new Date(now - 2 * 3600000).toISOString(), expiresAt: new Date(now - 1000).toISOString(), status: 'expired' }];
    const renew = await browser.newPage(); renew.on('pageerror', error => errors.push(error.message));
    await renew.goto(origin + '/offer/test-offer');
    await renew.getByText('Expired', { exact: true }).waitFor();
    await renew.getByRole('button', { name: 'Reserve offer', exact: true }).click();
    await renew.getByText('Reserved', { exact: true }).waitFor();
    assert.equal(rows.length, 2); assert.equal(rows[1].id, 'old-period');
    // A project-attached historical reservation cannot be renewed by the UI.
    rows = [{ ...rows[1], projectId: 'existing-project' }];
    await renew.reload(); await renew.getByText('Expired', { exact: true }).waitFor();
    assert.equal(await renew.getByRole('button', { name: 'Reserve offer', exact: true }).count(), 0);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
});
