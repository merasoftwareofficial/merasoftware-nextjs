// The site's loader (src/components/loading/navigation.tsx): the three balls show for every process the user starts,
// above a modal dialog too, and go when it ends. Production NavigationProgress and Link in an isolated browser harness;
// next/navigation and next/link are fixtures (real Next routing is covered by account-navigation.browser.mjs).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import http from 'node:http';
import { build } from 'esbuild';
import { chromium } from 'playwright';

test('loader: balls for every changing request and page change, above a dialog, and gone when it ends', async () => {
  const bundle = await build({ bundle: true, write: false, outdir: 'out', platform: 'browser', jsx: 'automatic', tsconfig: 'tsconfig.json', conditions: ['style', 'browser'], define: { 'process.env.NODE_ENV': '"production"' },
    stdin: { contents: `import React from 'react';import{createRoot}from'react-dom/client';
      import{NavigationProgress,quietFetch}from'./src/components/loading/navigation';import Link from'./src/components/link';import './src/app/globals.css';
      window.quietFetch = quietFetch;
      createRoot(document.getElementById('root')).render(<><NavigationProgress /><Link id="go" href="/next">go to the next page</Link><Link id="same" href={location.pathname}>same page</Link></>);`,
      resolveDir: process.cwd(), loader: 'tsx' },
    plugins: [{ name: 'next-fixtures', setup(builder) {
      builder.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: 'nav', namespace: 'fixture' }));
      builder.onLoad({ filter: /^nav$/, namespace: 'fixture' }, () => ({ contents: `export const usePathname=()=>location.pathname;export const useSearchParams=()=>new URLSearchParams(location.search);export const useRouter=()=>({push:h=>location.assign(h),replace:h=>location.replace(h),refresh:()=>{}});` }));
      builder.onResolve({ filter: /^next\/link$/ }, () => ({ path: 'nextlink', namespace: 'fixture' }));
      builder.onLoad({ filter: /^nextlink$/, namespace: 'fixture' }, () => ({ contents: `import React from 'react';export default function NextLink({href,prefetch,...p}){return <a href={href} {...p}/>}`, loader: 'tsx', resolveDir: process.cwd() }));
    } }],
  });
  const js = bundle.outputFiles.find(file => file.path.endsWith('.js')).contents, css = bundle.outputFiles.find(file => file.path.endsWith('.css'))?.contents ?? '';
  const shell = '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"><style>body{background:#fff;margin:0}#d{position:fixed;left:250px;top:200px;margin:0;width:300px;height:200px;border:0;padding:0;background:rgb(0,255,0)!important}</style></head><body><div id="root"></div><dialog id="d"><button id="inside">inside the dialog</button></dialog><script src="/app.js"></script></body></html>';
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/app.js') { res.setHeader('Content-Type', 'application/javascript'); return res.end(js); }
    if (url.pathname === '/app.css') { res.setHeader('Content-Type', 'text/css'); return res.end(css); }
    const wait = Number(url.searchParams.get('ms') || 700);
    if (url.pathname === '/api/slow') return setTimeout(() => { res.setHeader('Content-Type', 'application/json'); res.end('{"ok":true}'); }, wait);
    if (url.pathname === '/api/fail') return setTimeout(() => { res.statusCode = 500; res.end('{"error":"no"}'); }, wait);
    if (url.pathname === '/api/drop') return setTimeout(() => req.socket.destroy(), wait);
    if (url.pathname === '/next') return setTimeout(() => { res.setHeader('Content-Type', 'text/html'); res.end(shell); }, 1500);
    res.setHeader('Content-Type', 'text/html'); res.end(shell);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  const errors = [];
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  try {
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } }); page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin);
    await page.locator('#go').waitFor();
    // What the screen shows: the balls layer is visible when it is faded in (opacity) and open in the top layer.
    const ballsNow = () => page.evaluate(() => { const e = document.querySelector('.page-loader'); if (!e) return { shown: false, popover: false, cls: 'not mounted yet' }; const s = getComputedStyle(e); return { shown: s.visibility === 'visible' && Number(s.opacity) > 0.9, popover: e.matches(':popover-open'), cls: e.className }; })
    const lineNow = () => page.evaluate(() => { const e = document.querySelector('.nav-progress'); return !!e && e.classList.contains('is-busy') && Number(getComputedStyle(e).opacity) > 0.9; });
    // While the page is swapped for the next one the old document cannot be read: nothing is showing then.
    const balls = () => ballsNow().catch(() => ({ shown: false, popover: false, cls: 'page is changing' }));
    const line = () => lineNow().catch(() => false);
    const until = async (read, want, label, ms = 3000) => { const end = Date.now() + ms; let last; while (Date.now() < end) { last = await read(); if (want(last)) return last; await sleep(40); } assert.fail(`${label}; last seen ${JSON.stringify(last)}`); };
    const pixel = async (x, y) => { const b64 = (await page.screenshot({ clip: { x, y, width: 1, height: 1 } })).toString('base64');
      const q = await browser.newPage(); const v = await q.evaluate(async b => { const i = new Image(); i.src = 'data:image/png;base64,' + b; await i.decode(); const c = document.createElement('canvas'); c.width = 1; c.height = 1; const g = c.getContext('2d'); g.drawImage(i, 0, 0); return [...g.getImageData(0, 0, 1, 1).data].slice(0, 3); }, b64); await q.close(); return v; };
    const idle = () => until(balls, state => !state.shown && !state.popover, 'the balls go when the work ends', 3000);
    const send = (path, init) => page.evaluate(([p, i]) => { window.__result = 'pending'; fetch(p, i).then(r => { window.__result = r.status; }, () => { window.__result = 'network error'; }); }, [path, init]);

    // 1. A request that changes something: the balls show while it waits and go with the answer.
    assert.equal((await balls()).shown, false, 'nothing is running: no balls');
    await send('/api/slow?ms=900', { method: 'POST' });
    const during = await until(balls, state => state.shown, 'a POST shows the balls');
    assert.equal(during.popover, true, 'they are in the top layer');
    await until(() => page.evaluate(() => window.__result), result => result === 200, 'the answer arrives');
    await idle();

    // 2. A request that fails, or whose connection drops, ends them too.
    for (const [path, expected] of [['/api/fail?ms=700', 500], ['/api/drop?ms=700', 'network error']]) {
      await send(path, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      await until(balls, state => state.shown, `${path} shows the balls`);
      await until(() => page.evaluate(() => window.__result), result => result === expected, `${path} ends`);
      await idle();
    }

    // 3. Reads, background reports and a quiet request stay silent.
    for (const [label, run] of [
      ['a GET', () => send('/api/slow?ms=900', { method: 'GET' })],
      ['a keepalive report', () => send('/api/slow?ms=900', { method: 'POST', keepalive: true })],
      ['a quiet request', () => page.evaluate(() => { window.__result = 'pending'; window.quietFetch('/api/slow?ms=900', { method: 'PATCH' }).then(r => { window.__result = r.status; }); })],
    ]) {
      await run(); await sleep(600);
      assert.equal((await balls()).shown, false, `${label} does not show the balls`);
      await until(() => page.evaluate(() => window.__result), result => result === 200, `${label} ends`);
    }

    // 4. Above a modal dialog: the dialog is on the page first, then the process starts.
    await page.evaluate(() => document.getElementById('d').showModal());
    assert.deepEqual(await pixel(400, 300), [0, 255, 0], 'the dialog shows its own colour when nothing runs');
    await send('/api/slow?ms=1500', { method: 'POST' });
    await until(balls, state => state.shown, 'the balls show with a dialog open');
    await sleep(300);
    const dimmed = await pixel(5, 5), over = await pixel(400, 300);
    assert.notDeepEqual(dimmed, [255, 255, 255], 'the screen outside the dialog is dimmed');
    assert.notDeepEqual(over, [0, 255, 0], 'the dialog itself is dimmed too: the balls layer is above it');
    assert.equal(await page.evaluate(() => { const b = document.getElementById('inside'); let hit = false; b.onclick = () => { hit = true; }; b.click(); return hit; }), true, 'the dialog still works under the balls');
    await until(() => page.evaluate(() => window.__result), result => result === 200, 'the answer arrives');
    await idle();
    assert.deepEqual(await pixel(400, 300), [0, 255, 0], 'the dialog shows its own colour again');

    // 5. A dialog that opens while the balls are up (the answer opens a popup): it must not cover them.
    await page.evaluate(() => document.getElementById('d').close());
    await send('/api/slow?ms=1800', { method: 'POST' });
    await until(balls, state => state.shown, 'the balls show before the dialog');
    await page.evaluate(() => document.getElementById('d').showModal());
    await sleep(250);
    assert.notDeepEqual(await pixel(400, 300), [0, 255, 0], 'a dialog opened later is still under the balls');
    await until(() => page.evaluate(() => window.__result), result => result === 200, 'the answer arrives');
    await idle();
    await page.evaluate(() => document.getElementById('d').close());

    // 6. Two at once keep the balls until the last one ends.
    await send('/api/slow?ms=600', { method: 'POST' });
    await page.evaluate(() => { window.__second = 'pending'; fetch('/api/slow?ms=1800', { method: 'POST' }).then(r => { window.__second = r.status; }); });
    await until(() => page.evaluate(() => window.__result), result => result === 200, 'the first ends');
    await sleep(700);
    assert.equal((await balls()).shown, true, 'the balls stay while the second request runs');
    await until(() => page.evaluate(() => window.__second), result => result === 200, 'the second ends');
    await idle();

    // 7. A page change shows the balls together with the top line, until the next page arrives. Read inside the page:
    // it is still this page while the next one is on its way, and Playwright's own calls wait for the new page.
    const readInPage = (id, after) => page.evaluate(async ([id, after]) => {
      // Next would handle a link to the page already open without leaving it; the fixture link is a plain one, so stop it after the loader's click handler has run.
      if (id === 'same') document.addEventListener('click', event => event.preventDefault(), { once: true });
      document.getElementById(id).click();
      await new Promise(resolve => setTimeout(resolve, after));
      const balls = document.querySelector('.page-loader'), line = document.querySelector('.nav-progress');
      return { balls: getComputedStyle(balls).visibility === 'visible' && Number(getComputedStyle(balls).opacity) > 0.9, popover: balls.matches(':popover-open'),
        line: line.classList.contains('is-busy') && Number(getComputedStyle(line).opacity) > 0.9, path: location.pathname };
    }, [id, after]);
    const same = await readInPage('same', 600);
    assert.deepEqual([same.balls, same.line], [false, false], 'a link to the page already open shows nothing');
    const change = await readInPage('go', 700);
    assert.equal(change.path, '/', 'still the old page while the next one is on its way');
    assert.deepEqual([change.balls, change.popover, change.line], [true, true, true], 'a page change shows the balls and the top line');
    await page.waitForURL('**/next', { timeout: 8000 }); await page.locator('#go').waitFor();
    await until(balls, state => !state.shown, 'the balls are gone on the new page', 3000);
  } finally { await browser.close(); server.close(); }
  assert.deepEqual(errors, []);
  console.log('PASS: loader — balls for every changing request and page change, above a dialog, silent for reads, reports and quiet requests, gone when the work ends.');
});
