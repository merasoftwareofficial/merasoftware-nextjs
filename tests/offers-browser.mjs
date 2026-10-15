// End-to-end verification against a copied checkout and disposable MongoDB.
// Never uses the running website's settings, data or portal account.
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cpSync, existsSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { chromium } from 'playwright';
import { SignJWT } from 'jose';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
async function freePort() {
  const server = net.createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const value = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return value;
}
const database = new MongoMemoryServer();
let portal, app, browser;
let output = '';
try {
  const checkout = path.join(root, `work41-offers-${Date.now()}`);
  mkdirSync(checkout);
  cpSync(path.join(root, 'src'), path.join(checkout, 'src'), { recursive: true });
  for (const file of ['package.json', 'next.config.ts', 'postcss.config.mjs', 'tsconfig.json', 'next-env.d.ts']) {
    if (existsSync(path.join(root, file))) cpSync(path.join(root, file), path.join(checkout, file));
  }
  symlinkSync(path.join(root, 'node_modules'), path.join(checkout, 'node_modules'), 'junction');
  symlinkSync(path.join(root, 'public'), path.join(checkout, 'public'), 'junction');
  // Keep validation offline; external Google font fetching can stall compilation.
  const fontMock = path.join(checkout, 'font-mock.cjs');
  writeFileSync(fontMock, 'module.exports = new Proxy({}, { get() { return "@font-face { font-family: Geist; src: local(Arial); font-weight: 100 900; }"; } });');
  await database.start();
  const userId = 'a'.repeat(24);
  portal = http.createServer((request, response) => {
    response.setHeader('Content-Type', 'application/json');
    if (request.url === '/api/user-details') response.end(JSON.stringify({ success: true, data: { _id: userId, name: 'Offer Test Admin', email: 'offers@example.test', roles: ['admin'], isGuest: false } }));
    else { response.statusCode = 404; response.end('{}'); }
  });
  await new Promise(resolve => portal.listen(0, '127.0.0.1', resolve));
  const portalOrigin = `http://127.0.0.1:${portal.address().port}`;
  const tokenSecret = randomBytes(32).toString('hex');
  const appPort = await freePort();
  const origin = `http://127.0.0.1:${appPort}`;
  app = spawn(process.execPath, [path.join(root, 'node_modules/next/dist/bin/next'), 'dev', '--webpack', '-p', String(appPort), '-H', '127.0.0.1'], {
    cwd: checkout, windowsHide: true,
    env: { ...process.env, DATA_DRIVER: 'mongo', MONGODB_URI: database.getUri(), MONGODB_DB: 'offers_browser', PORTAL_API_URL: portalOrigin, PORTAL_URL: portalOrigin, TOKEN_SECRET_KEY: tokenSecret, INDEXNOW_KEY: '', PORT: String(appPort), NEXT_TELEMETRY_DISABLED: '1', NEXT_FONT_GOOGLE_MOCKED_RESPONSES: fontMock },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  app.stdout.on('data', bytes => { output += bytes.toString(); });
  app.stderr.on('data', bytes => { output += bytes.toString(); });
  browser = await chromium.launch({ headless: true });
  const publicContext = await browser.newContext();
  await publicContext.route('https://**', route => route.abort());
  const page = await publicContext.newPage();
  page.setDefaultTimeout(60000);
  const deadline = Date.now() + 180000;
  while (Date.now() < deadline) {
    if (app.exitCode !== null) throw Error(output.slice(-3000));
    try { await fetch(`${origin}/offer`, { signal: AbortSignal.timeout(5000) }); break; } catch { await new Promise(resolve => setTimeout(resolve, 500)); }
  }
  await page.goto(`${origin}/offer`, { waitUntil: 'networkidle', timeout: 180000 });
  assert.equal(await page.locator('main a[href="/offer/page"]').count(), 1);
  console.log('Public listing and existing offer loaded');
  const denied = await publicContext.request.patch(`${origin}/api/offers`, { data: { kind: 'terms', terms: ['No access'] } });
  assert.equal(denied.status(), 401);
  const token = await new SignJWT({ _id: userId, role: 'admin' }).setProtectedHeader({ alg: 'HS256' }).setExpirationTime('1h').sign(new TextEncoder().encode(tokenSecret));
  const admin = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await admin.route('https://**', route => route.abort());
  await admin.addCookies([{ name: 'token', value: token, url: origin }]);
  const editor = await admin.newPage();
  editor.setDefaultTimeout(60000);
  await editor.goto(`${origin}/admin/content?page=offers&section=details`, { waitUntil: 'networkidle', timeout: 180000 });
  console.log('Authenticated Offers manager loaded');
  await editor.getByRole('button', { name: 'New offer +', exact: true }).click();
  await editor.getByLabel('Offer name', { exact: true }).fill('Diwali Business Launch');
  await editor.getByLabel('URL slug', { exact: true }).fill('diwali-launch');
  await editor.getByLabel('Main heading', { exact: true }).fill('Launch your business');
  await editor.getByLabel('Highlighted heading text', { exact: true }).fill('with confidence.');
  await editor.getByLabel('Short description', { exact: true }).fill('A focused launch package for your business.');
  await editor.getByLabel('Main price (₹)', { exact: true }).fill('10000');
  await editor.getByLabel('Normal discount price (₹)', { exact: true }).fill('5000');
  await editor.getByLabel('Offer price (₹)', { exact: true }).fill('999');
  await editor.getByLabel("What's included", { exact: true }).fill('Business website\nGoogle profile setup\nSocial media launch post');
  await editor.getByLabel('Expires at (India time / IST)', { exact: true }).fill('2030-10-20T23:59');
  await editor.getByLabel('Offer-specific terms', { exact: true }).fill('Launch package term');
  await editor.getByRole('button', { name: 'Preview changes ↗', exact: true }).click();
  const preview = editor.getByRole('dialog', { name: 'Offer preview', exact: true });
  assert(await preview.getByRole('heading', { name: 'Launch your business with confidence.' }).isVisible());
  await editor.getByRole('button', { name: 'Close preview', exact: true }).click();
  async function save(label) {
    const saved = editor.waitForResponse(response => response.url() === `${origin}/api/offers` && response.request().method() === 'PATCH');
    await editor.getByRole('button', { name: label, exact: true }).click();
    const response = await saved;
    assert.equal(response.status(), 200, await response.text());
    return response.json();
  }
  const draft = await save('Save offer');
  console.log('Draft creation and unsaved preview passed');
  assert.equal(draft.endsAt, '2030-10-20T23:59:59+05:30');
  assert.equal((await page.goto(`${origin}/offer/diwali-launch`)).status(), 404);
  await editor.getByLabel('Status', { exact: true }).selectOption('published');
  const published = await save('Save & publish');
  console.log('Publishing saved successfully');
  await page.goto(`${origin}/offer`, { waitUntil: 'networkidle' });
  assert.equal(await page.locator('main a[href="/offer/diwali-launch"]').count(), 1);
  await page.locator('main a[href="/offer/diwali-launch"]').click();
  await page.getByRole('heading', { name: 'Launch your business with confidence.' }).waitFor();
  assert.equal(await page.getByRole('timer').count(), 1);
  const duplicate = await admin.request.patch(`${origin}/api/offers`, { data: { kind: 'offer', offer: published, creating: true } });
  assert.equal(duplicate.status(), 409);
  const invalid = await admin.request.patch(`${origin}/api/offers`, { data: { kind: 'offer', offer: { ...published, contactHref: 'javascript:alert(1)' }, creating: false } });
  assert.equal(invalid.status(), 400);
  const common = await admin.request.patch(`${origin}/api/offers`, { data: { kind: 'terms', terms: ['Common site term'] } });
  assert.equal(common.status(), 200);
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'T&C', exact: true }).click();
  const dialog = page.getByRole('dialog');
  assert((await dialog.innerText()).includes('Common site term'));
  assert((await dialog.innerText()).includes('Launch package term'));
  assert((await dialog.innerText()).includes('20 October 2030'));
  await page.keyboard.press('Escape');
  mkdirSync(path.join(root, 'test-results'), { recursive: true });
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 950 });
    await page.goto(`${origin}/offer`, { waitUntil: 'networkidle' });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: path.join(root, `test-results/offers-${width}.png`), fullPage: true });
  }
  await editor.getByLabel('Status', { exact: true }).selectOption('archived');
  await save('Save offer');
  assert.equal((await page.goto(`${origin}/offer/diwali-launch`)).status(), 404);
  await page.goto(`${origin}/offer`, { waitUntil: 'networkidle' });
  assert.equal(await page.locator('main a[href="/offer/diwali-launch"]').count(), 0);
  await editor.reload({ waitUntil: 'networkidle' });
  assert((await editor.locator('main').innerText()).includes('archived'));
  console.log('PASS: admin create/save/preview/publish/archive, persistent status, draft privacy, duplicate and unsafe-link validation, IST expiry, combined T&C and responsive listing.');
} catch (error) {
  console.error(output.slice(-3500));
  throw error;
} finally {
  if (browser) await browser.close();
  if (app?.pid) {
    if (process.platform === 'win32') await new Promise(resolve => { const stop = spawn('taskkill', ['/PID', String(app.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }); stop.on('exit', resolve); });
    else app.kill('SIGTERM');
  }
  if (portal) await new Promise(resolve => portal.close(resolve));
  await database.stop();
}
