// Runs the real Next.js pages in an isolated source copy with disposable MongoDB
// and a local portal fixture. No production database, credentials or mail are used.
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, writeFileSync, symlinkSync, unlinkSync, rmSync } from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const folder = path.join(root, 'test-results', `account-navigation-${Date.now()}`);
mkdirSync(folder, { recursive: true });
// Webpack's Next.js dev entries must be on the same Windows drive as node_modules.
const workspace = mkdtempSync(path.join(path.dirname(root), 'merasoftware-account-check-'));
cpSync(path.join(root, 'src'), path.join(workspace, 'src'), { recursive: true });
for (const name of ['package.json', 'tsconfig.json', 'next.config.ts', 'postcss.config.mjs']) cpSync(path.join(root, name), path.join(workspace, name));
symlinkSync(path.join(root, 'node_modules'), path.join(workspace, 'node_modules'), 'junction');
symlinkSync(path.join(root, 'public'), path.join(workspace, 'public'), 'junction');
const secret = randomBytes(32).toString('hex');
const identities = ['member', 'moderator', 'editor', 'admin', 'customer'];
const ids = Object.fromEntries(identities.map((role, index) => [role, String(index + 1).repeat(24)]));
const db = new MongoMemoryServer();
let app, portal, browser, logs = '';
try {
  await db.start();
  await mongoose.connect(db.getUri(), { dbName: 'account_navigation' });
  await mongoose.connection.db.collection('users').insertMany(identities.map(role => ({
    _id: new mongoose.Types.ObjectId(ids[role]), portalUserId: ids[role], email: `${role}@account.test`,
    username: role, displayName: `Test ${role}`, role: role === 'customer' ? 'member' : role,
    banned: false, createdAt: new Date(), updatedAt: new Date(),
  })));
  await mongoose.connection.db.collection('subscribers').insertOne({
    email: 'member@account.test', userId: ids.member, token: 'account-test-token',
    emailStatus: 'active', categories: [], offers: true, createdAt: new Date(), updatedAt: new Date(),
  });
  portal = http.createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/api/user-details') {
      const token = /(?:^|;\s*)token=([^;]+)/.exec(req.headers.cookie || '')?.[1];
      const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
      const role = identities.find(role => ids[role] === payload._id);
      res.end(JSON.stringify({ success: true, data: { _id: ids[role], name: `Test ${role}`, email: `${role}@account.test`, roles: [role], activeRole: role, role, isGuest: false } }));
    } else if (req.url === '/api/offer-reservations') res.end(JSON.stringify({ reservations: [] }));
    else if (req.url === '/api/userLogout') {
      res.setHeader('Set-Cookie', 'token=; Path=/; Max-Age=0');
      res.end(JSON.stringify({ success: true }));
    } else res.end(JSON.stringify({ success: true, data: [] }));
  });
  await new Promise(resolve => portal.listen(0, '127.0.0.1', resolve));
  const portalUrl = `http://127.0.0.1:${portal.address().port}`;
  const probe = http.createServer();
  await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  const origin = `http://127.0.0.1:${port}`;
  app = spawn(process.execPath, [path.join(root, 'node_modules/next/dist/bin/next'), 'dev', '--webpack', '-p', String(port), '-H', '127.0.0.1'], {
    cwd: workspace, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, NEXT_BUILD_DIR: '.next', DATA_DRIVER: 'mongo', MONGODB_URI: db.getUri(), MONGODB_DB: 'account_navigation', TOKEN_SECRET_KEY: secret, PORTAL_API_URL: portalUrl, PORTAL_URL: portalUrl, VERCEL_ENV: 'preview', INDEXNOW_KEY: '', VAPID_PUBLIC_KEY: '', VAPID_PRIVATE_KEY: '' },
  });
  app.stdout.on('data', chunk => { logs += chunk; });
  app.stderr.on('data', chunk => { logs += chunk; });
  const ready = new Promise((resolve, reject) => {
    const timer = setInterval(() => {
      if (/Ready in/.test(logs)) { clearInterval(timer); resolve(); }
      else if (app.exitCode !== null) { clearInterval(timer); reject(new Error(logs)); }
    }, 300);
    setTimeout(() => { clearInterval(timer); reject(new Error(`Startup timeout: ${logs.slice(-2000)}`)); }, 60_000).unref();
  });
  await ready;
  browser = await chromium.launch({ headless: true });
  const anonymous = await browser.newPage();
  anonymous.setDefaultTimeout(60_000);
  await anonymous.goto(`${origin}/account`, { timeout: 120_000 });
  assert.equal(new URL(anonymous.url()).pathname, '/login');
  assert.equal(new URL(anonymous.url()).searchParams.get('next'), '/account');
  await anonymous.goto(`${origin}/subscribe/manage?token=account-test-token`, { timeout: 120_000 });
  await anonymous.getByText('member@account.test', { exact: true }).waitFor();
  assert.equal(await anonymous.getByRole('navigation', { name: 'My Account', exact: true }).count(), 0);
  await anonymous.close();
  console.log('PASS signed-out account redirects to login; valid notification token works without login');

  for (const role of identities) {
    const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    const token = await new SignJWT({ _id: ids[role] }).setProtectedHeader({ alg: 'HS256' }).setExpirationTime('1h').sign(new TextEncoder().encode(secret));
    await context.addCookies([{ name: 'token', value: token, url: origin }]);
    const page = await context.newPage();
    page.setDefaultTimeout(60_000);
    await page.goto(`${origin}/account`, { timeout: 120_000 });
    assert.match(await page.locator('meta[name="robots"]').getAttribute('content'), /noindex/);
    assert.equal(await page.locator('main h1').innerText(), 'My Account.');
    assert.equal(await page.locator('main a[href="/community/write"]').count(), 1);
    const trigger = page.locator('.session-trigger');
    await trigger.focus(); await page.keyboard.press('Enter');
    const menu = page.locator('.session-dropdown');
    await menu.waitFor();
    assert.equal(await menu.getByRole('link', { name: 'My Account', exact: true }).count(), 1);
    assert.equal(await menu.getByRole('link', { name: 'Control Panel', exact: true }).count(), ['moderator', 'editor', 'admin'].includes(role) ? 1 : 0);
    assert.equal(await menu.getByRole('link', { name: 'Portal admin panel', exact: true }).count(), role === 'admin' ? 1 : 0);
    assert.equal(await menu.getByRole('link', { name: 'My Portal', exact: true }).count(), role === 'customer' ? 1 : 0);
    assert.equal(await menu.locator('a[href="/account/posts"]').count(), 0);
    await page.keyboard.press('Tab');
    assert.equal(await menu.locator('a').first().evaluate(el => el === document.activeElement), true);
    await page.keyboard.press('Escape');
    assert.equal(await menu.count(), 0);
    assert.equal(await trigger.evaluate(el => el === document.activeElement), true);
    if (role === 'admin') {
      await page.screenshot({ path: path.join(folder, 'account-desktop.png'), fullPage: true });
      await trigger.focus(); await page.keyboard.press('Enter');
      await menu.waitFor();
      await page.screenshot({ path: path.join(folder, 'dropdown-admin.png') });
      await page.keyboard.press('Escape');
    }

    if (role === 'member') {
      for (const target of ['/account/posts', '/account/offers', '/account/saved', '/subscribe/manage']) {
        await page.goto(`${origin}${target}`, { timeout: 120_000 });
        assert.equal(await page.getByRole('navigation', { name: 'My Account', exact: true }).locator('a[aria-current="page"]').getAttribute('href'), target);
        if (target === '/account/posts') assert.equal(await page.locator('main a[href="/community/write"]').count(), 1);
      }
      await mongoose.connection.db.collection('blogs').insertOne({ title: 'Own draft', slug: 'own-draft', excerpt: 'Test draft', authorId: ids.member, authorName: 'Test member', type: 'community', status: 'draft', visibility: 'public', tags: [], createdAt: new Date(), updatedAt: new Date() });
      await page.goto(`${origin}/account/posts`);
      await page.getByRole('heading', { name: 'Own draft', exact: true }).waitFor();
      assert.equal(await page.locator('main a[href="/community/write"]').count(), 1);
      await page.goto(`${origin}/subscribe/manage?token=invalid-fixture`);
      assert.equal(await page.getByRole('navigation', { name: 'My Account', exact: true }).count(), 0);
      assert.equal(new URL(page.url()).pathname, '/subscribe/manage');
      await page.goto(`${origin}/members/member`);
      assert.equal(await page.getByRole('navigation', { name: 'My Account', exact: true }).count(), 0);
      await page.goto(`${origin}/account`);
      await page.setViewportSize({ width: 375, height: 812 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.screenshot({ path: path.join(folder, 'account-mobile.png'), fullPage: true });
      await trigger.tap({ force: true }).catch(() => trigger.click());
      await menu.waitFor();
      const bounds = await menu.boundingBox();
      assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 375);
      await page.screenshot({ path: path.join(folder, 'dropdown-mobile.png') });
      console.log('PASS account links, empty/nonempty posts, token flow, public profile and mobile layout');
    }
    console.log(`PASS ${role}: dropdown visibility and keyboard navigation`);
    await context.close();
  }
  console.log(`Screenshots: ${folder}`);
} catch (error) {
  writeFileSync(path.join(folder, 'server.log'), logs);
  throw error;
} finally {
  await browser?.close();
  if (app) { app.kill(); await new Promise(resolve => app.exitCode !== null ? resolve() : app.once('exit', resolve)); }
  await new Promise(resolve => portal ? portal.close(resolve) : resolve());
  await mongoose.disconnect();
  await db.stop();
  if (path.dirname(workspace) !== path.dirname(root) || !path.basename(workspace).startsWith('merasoftware-account-check-')) throw new Error('Unexpected fixture cleanup path');
  // Unlink directory junctions explicitly before removing generated fixture files.
  unlinkSync(path.join(workspace, 'node_modules'));
  unlinkSync(path.join(workspace, 'public'));
  rmSync(workspace, { recursive: true, force: true });
}
