// A real browser check against the production build and a disposable MongoDB.
// All portal identities and image data are local fixtures; production settings are overridden.
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
import { randomBytes, createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { chromium } from 'playwright';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
async function port() {
  const server = net.createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const value = server.address().port; await new Promise(resolve => server.close(resolve)); return value;
}
async function main() {
  const database = new MongoMemoryServer({ instance: { launchTimeout: 60_000 } });
  let browser, portal, app;
  let output = '';
  try {
    await database.start();
    await mongoose.connect(database.getUri(), { dbName: 'portfolio_browser' });
    browser = await chromium.launch({ headless: true });
    const fixturePage = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await fixturePage.setContent('<body style="margin:0;background:#f3f6ed;font-family:Arial"><main style="padding:100px"><p>CLIENT WEBSITE</p><h1 style="font-size:80px">A clearer digital presence.</h1><p style="font-size:26px">Website development and ongoing support.</p></main></body>');
    const fixtureImage = await fixturePage.screenshot({ type: 'png' }); await fixturePage.close();
    const userId = '1'.repeat(24), projectId = '2'.repeat(24), serviceId = '3'.repeat(24);
    portal = http.createServer((req, res) => {
      if (req.url === '/fixture.png') { res.writeHead(200, { 'Content-Type': 'image/png' }); res.end(fixtureImage); return; }
      res.setHeader('Content-Type', 'application/json');
      if (req.url === '/api/user-details') res.end(JSON.stringify({ success: true, data: { _id: userId, name: 'Browser Admin', email: 'admin@portfolio.test', roles: ['admin'], isGuest: false } }));
      else if (req.url === '/api/portfolio-integration/sync') res.end(JSON.stringify({ queued: true, pending: 0, failed: 0, lastDelivery: new Date().toISOString() }));
      else { res.statusCode = 404; res.end('{}'); }
    });
    await new Promise(resolve => portal.listen(0, '127.0.0.1', resolve));
    const portalOrigin = `http://127.0.0.1:${portal.address().port}`;
    const imageId = new mongoose.Types.ObjectId();
    await mongoose.connection.db.collection('mediaassets').insertOne({ _id: imageId, url: `${portalOrigin}/fixture.png`, publicId: 'portfolio-browser-fixture', assetId: 'fixture', assetFolder: 'test', width: 1440, height: 1000, bytes: fixtureImage.length, format: 'png', altText: 'Portfolio browser fixture', sha256: createHash('sha256').update(fixtureImage).digest('hex'), kind: 'image', createdAt: new Date(), updatedAt: new Date() });
    const secret = randomBytes(32).toString('hex'), tokenSecret = randomBytes(32).toString('hex');
    const appPort = await port(); const origin = `http://127.0.0.1:${appPort}`;
    app = spawn(process.execPath, [path.join(root, 'node_modules/next/dist/bin/next'), 'start', '-p', String(appPort), '-H', '127.0.0.1'], {
      cwd: root, windowsHide: true,
      env: { ...process.env, DATA_DRIVER: 'mongo', MONGODB_URI: database.getUri(), MONGODB_DB: 'portfolio_browser', PORTAL_API_URL: portalOrigin, PORTAL_URL: portalOrigin, TOKEN_SECRET_KEY: tokenSecret, PORTFOLIO_INTEGRATION_SECRET: secret, VERCEL_ENV: 'preview', INDEXNOW_KEY: '', PORT: String(appPort) },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    app.stdout.on('data', bytes => { output += bytes.toString(); }); app.stderr.on('data', bytes => { output += bytes.toString(); });
    const deadline = Date.now() + 120_000;
    while (Date.now() < deadline) {
      if (app.exitCode !== null) throw new Error(`Next.js exited: ${output.slice(-2000)}`);
      try { const response = await fetch(`${origin}/work`, { signal: AbortSignal.timeout(3000) }); if (response.ok) break; } catch { /* Wait for startup. */ }
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    const integration = async sources => {
      const response = await fetch(`${origin}/api/portfolio/integration`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` }, body: JSON.stringify({ sources }) });
      assert.equal(response.status, 200, await response.text());
    };
    const source = { id: projectId, revision: 100, available: true, type: 'project', customerId: userId, customerName: 'Private source client', name: 'Imported browser project', category: 'websites', state: 'completed', linkedProjectId: '', url: '', captureAllowed: false };
    const denied = await fetch(`${origin}/api/portfolio/integration`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer wrong' }, body: JSON.stringify({ sources: [source] }) });
    assert.equal(denied.status, 401);
    await integration([{ ...source, privatePayment: 999 }, { ...source, id: serviceId, type: 'service', name: 'SEO support', linkedProjectId: projectId }]);
    assert.equal('privatePayment' in (await mongoose.connection.db.collection('portfolios').findOne({ _id: projectId })).source, false);
    const { SignJWT } = await import('jose');
    const token = await new SignJWT({ _id: userId, role: 'admin' }).setProtectedHeader({ alg: 'HS256' }).setExpirationTime('1h').sign(new TextEncoder().encode(tokenSecret));
    const admin = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await admin.addCookies([{ name: 'token', value: token, url: origin }]);
    const page = await admin.newPage(); page.setDefaultTimeout(30_000);
    await page.goto(`${origin}/admin/portfolio/${projectId}`);
    await page.getByLabel('Public title', { exact: true }).fill('Clearer business websites');
    await page.getByLabel('URL slug', { exact: true }).fill('clearer-business-websites');
    await page.getByLabel('Public client / brand name', { exact: true }).fill('Example Studio');
    await page.getByLabel('Category', { exact: true }).fill('Websites');
    await page.getByLabel('Short description', { exact: true }).fill('A responsive website with a clear message, useful content and a simple path to contact.');
    await page.getByLabel('The challenge', { exact: true }).fill('Make the business easier to discover and understand.');
    await page.getByLabel('What we built', { exact: true }).fill('A focused website with responsive layouts and ongoing SEO support.');
    await page.getByLabel('The result', { exact: true }).fill('A clear foundation for the next stage of growth.');
    await page.getByRole('button', { name: 'Add to services provided', exact: true }).click();
    await page.getByRole('button', { name: 'Choose image', exact: true }).click();
    await page.getByRole('tab', { name: 'Media Library', exact: true }).click();
    await page.getByRole('button', { name: /Portfolio browser fixture/ }).click();
    await page.getByLabel(/^Visibility/).selectOption('published');
    await page.getByLabel('Featured on homepage', { exact: true }).check();
    const saving = page.waitForResponse(response => response.url() === `${origin}/api/portfolio/${projectId}` && response.request().method() === 'PATCH');
    await page.getByRole('button', { name: 'Save changes', exact: true }).first().click();
    const savedResponse = await saving;
    assert.equal(savedResponse.status(), 200, await savedResponse.text());
    await page.getByRole('status').filter({ hasText: 'Saved.' }).waitFor();
    const hostile = await admin.request.patch(`${origin}/api/portfolio/${projectId}`, { headers: { Origin: 'https://untrusted.example' }, data: {} });
    assert.equal(hostile.status(), 403);
    const captureRequest = await admin.request.post(`${origin}/api/portfolio/${projectId}`, { data: { url: 'https://example.com' } });
    assert.equal(captureRequest.status(), 200);
    const claim = await fetch(`${origin}/api/portfolio/integration/captures`, { method: 'POST', headers: { Authorization: `Bearer ${secret}` } });
    const { job } = await claim.json(); assert.equal(job.id, projectId);
    await admin.request.post(`${origin}/api/portfolio/${projectId}`, { data: { url: 'https://example.org' } });
    const stale = await fetch(`${origin}/api/portfolio/integration/captures`, { method: 'PUT', headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ id: projectId, token: job.token, error: 'Old capture failed' }) });
    assert.equal(stale.status, 409);
    const afterCapture = await mongoose.connection.db.collection('portfolios').findOne({ _id: projectId });
    assert.equal(afterCapture.cover.assetId, String(imageId));
    await page.goto(`${origin}/work/clearer-business-websites`);
    await page.getByRole('heading', { name: 'Clearer business websites', exact: true }).waitFor();
    assert.equal(await page.getByText('Private source client').count(), 0);
    await page.getByRole('button', { name: /♡ Like/ }).click();
    await page.getByRole('button', { name: /♡ Like/ }).and(page.locator('[aria-pressed="true"]')).waitFor();
    const results = path.join(root, 'test-results'); mkdirSync(results, { recursive: true });
    await page.screenshot({ path: path.join(results, 'portfolio-detail-desktop.png'), fullPage: true });
    const visitor = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const mobile = await visitor.newPage(); await mobile.goto(`${origin}/work`);
    await mobile.getByRole('heading', { name: 'Clearer business websites', exact: true }).waitFor();
    const signedOutReaction = await visitor.request.put(`${origin}/api/portfolio/${projectId}/reactions`, { data: { reaction: 'like', active: true } });
    assert.equal(signedOutReaction.status(), 401);
    await mobile.screenshot({ path: path.join(results, 'portfolio-list-mobile.png'), fullPage: true });
    const overflow = await mobile.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    assert.equal(overflow, false, 'Mobile portfolio overflows horizontally');
    await integration([{ ...source, revision: 200, name: 'Changed source title' }]);
    await mobile.reload(); await mobile.getByRole('heading', { name: 'Clearer business websites', exact: true }).waitFor();
    await page.goto(`${origin}/admin/portfolio/${projectId}`);
    await page.getByLabel(/^Visibility/).selectOption('hidden');
    const hiding = page.waitForResponse(response => response.url() === `${origin}/api/portfolio/${projectId}` && response.request().method() === 'PATCH');
    await page.getByRole('button', { name: 'Save changes', exact: true }).first().click();
    const hiddenResponse = await hiding;
    assert.equal(hiddenResponse.status(), 200, await hiddenResponse.text());
    await page.getByRole('status').filter({ hasText: 'Saved.' }).waitFor();
    await integration([{ ...source, revision: 300 }]);
    const hidden = await visitor.request.get(`${origin}/work/clearer-business-websites`);
    assert.equal(hidden.status(), 404);
    console.log('PASS: admin import/edit/publish, media selection, linked services, login reactions, mobile layout, sync preservation and hide/404. Screenshots: test-results/.');
  } catch (error) { console.error(output.slice(-2000)); throw error; }
  finally {
    if (browser) await browser.close();
    if (app && app.exitCode === null) { app.kill(); await new Promise(resolve => { app.once('exit', resolve); setTimeout(resolve, 5000); }); }
    if (portal) await new Promise(resolve => portal.close(resolve));
    await mongoose.disconnect(); await database.stop();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
