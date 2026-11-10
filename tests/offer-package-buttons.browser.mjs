// A package page WHILE ITS OFFER RUNS (owner decision 10 Nov 2026): the package's own buttons stay.
// normal: Get this package + Arrange a callback; Reserve window: Reserve + Get this package + Arrange a callback (the bar: Reserve + Get);
// reserved: Start my project + Arrange a callback. Nothing scrolls sideways at 1440, 390 and 320 px.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import http from 'node:http';
import { build } from 'esbuild';
import { chromium } from 'playwright';

test('package page with a running offer: Get this package, Reserve, Start my project and the callback', async () => {
  const bundle = await build({ bundle: true, write: false, outdir: 'out', platform: 'browser', jsx: 'automatic', tsconfig: 'tsconfig.json', conditions: ['style', 'browser'], define: { 'process.env.NODE_ENV': '"production"' },
    stdin: { contents: `import React from 'react';import{createRoot}from'react-dom/client';
      import{PublicInteraction}from'./src/components/campaign/public-interaction/page-content';import{DEFAULT_OFFER,DEFAULT_UNIVERSAL_TERMS}from'./src/lib/offers';import './src/app/globals.css';
      const state=location.hash.slice(1)||'normal';const offer={...DEFAULT_OFFER,slug:'p',status:'published',title:'Dynamic Website with Content Management',heading:'Website package',headingHighlight:'',description:'A package.',supportingLine:'',mainPrice:15000,discountPrice:9999,offerPrice:7999,endsAt:state==='normal'?'2030-01-01T00:00:00Z':new Date(Date.now()+10*3600000).toISOString()};
      createRoot(document.getElementById('root')).render(<PublicInteraction offer={offer} terms={DEFAULT_UNIVERSAL_TERMS} reservation={{slug:'p',quoteKey:'k',signedIn:true,serverNow:new Date().toISOString()}} pkg={{id:'p',name:offer.title,live:true,back:{href:'/',label:'Packages'},start:{signedIn:true,countries:undefined},packageTerms:[],customize:'/package/p/customize'}}/>);`,
      resolveDir: process.cwd(), loader: 'tsx' },
    plugins: [{ name: 'navigation-fixture', setup(builder) {
      builder.onResolve({ filter: /^@\/components\/link$/ }, () => ({ path: 'link', namespace: 'fixture' }));
      builder.onLoad({ filter: /^link$/, namespace: 'fixture' }, () => ({ contents: `import React from 'react';export default function Link(props){return <a {...props}/>}`, loader: 'tsx', resolveDir: process.cwd() }));
      builder.onResolve({ filter: /^@\/components\/loading\/navigation$/ }, () => ({ path: 'navigation', namespace: 'fixture' }));
      builder.onLoad({ filter: /^navigation$/, namespace: 'fixture' }, () => ({ contents: `export const useNavigate=()=>({push:p=>location.assign(p),assign:p=>location.assign(p),refresh:()=>{},pending:false});export const useTask=()=>({busy:false,track:fn=>fn()});export const InlineLoader=()=>null;` }));
    } }],
  });
  const js = bundle.outputFiles.find(file => file.path.endsWith('.js')).contents, css = bundle.outputFiles.find(file => file.path.endsWith('.css'))?.contents ?? '';
  const now = Date.now();
  let current = 'normal';
  const server = http.createServer((req, res) => {
    if (req.url === '/app.js') { res.setHeader('Content-Type', 'application/javascript'); return res.end(js); }
    if (req.url === '/app.css') { res.setHeader('Content-Type', 'text/css'); return res.end(css); }
    if (req.url.startsWith('/api/offer-reservations')) { res.setHeader('Content-Type', 'application/json'); const at = new Date(now).toISOString(), due = new Date(now + 72 * 3600000 - 1000).toISOString(); return res.end(JSON.stringify({ reservations: current === 'reserved' ? [{ id: 'r1', offerSlug: 'p', title: 'x', reservedPrice: 7999, regularPrice: 15000, terms: [], reservedAt: at, expiresAt: due, deadline: due, extendedUntil: null, status: 'reserved', projectId: null, confirmationStatus: 'sent' }] : [] })); }
    if (req.url === '/api/package-starts') { res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify({ enabled: true, requests: [] })); }
    if (req.url === '/api/time') { res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify({ now })); }
    res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script src="/app.js"></script></body></html>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  const errors = [];
  // state -> [card buttons in order, bar buttons in order]
  const expected = {
    normal: [['Get this package', 'Arrange a callback'], ['Get this package', 'Arrange a callback']],
    open: [[/^Reserve price for \d+ hours$/, 'Get this package', 'Arrange a callback'], ['Reserve price', 'Get this package']],
    reserved: [[/^Start my project/, 'Arrange a callback'], ['Start my project', 'Arrange a callback']],
  };
  try {
    for (const [state, [cardWant, barWant]] of Object.entries(expected)) {
      for (const [width, height] of [[1440, 900], [390, 800], [320, 700]]) {
        const page = await browser.newPage({ viewport: { width, height } }); page.on('pageerror', error => errors.push(error.message));
        current = state;
        await page.goto(`${origin}/#${state}`);
        const card = page.locator('section[aria-label]'), bar = page.locator('div[class*="sticky"]').first();
        await card.getByRole('button', { name: 'T&C' }).waitFor();
        const label = `${state} at ${width}px`;
        const names = async area => (await area.locator('a[href], button').evaluateAll(nodes => nodes.map(node => node.textContent.trim()))).filter(text => text && text !== 'T&C' && !text.startsWith('Have a question'));
        const match = (got, want) => got.length === want.length && want.every((w, i) => (w instanceof RegExp ? w.test(got[i]) : got[i] === w));
        const cardGot = await names(card), barGot = await names(bar);
        assert.ok(match(cardGot, cardWant), `card buttons ${JSON.stringify(cardGot)} at ${label}`);
        assert.ok(match(barGot, barWant), `bar buttons ${JSON.stringify(barGot)} at ${label}`);
        const boxes = await bar.locator('a[href], button').evaluateAll(nodes => nodes.map(node => { const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }));
        assert.ok(boxes.every(b => b.x >= 0 && b.x + b.w <= width), `bar buttons inside the screen at ${label}`);
        assert.ok(boxes.every(b => Math.abs(b.y - boxes[0].y) < 2), `bar buttons side by side at ${label}`);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `no sideways scroll at ${label}`);
        await page.close();
      }
    }
  } finally { await browser.close(); server.close(); }
  assert.deepEqual(errors, []);
  console.log('PASS: package page with a running offer — buttons per state, 1440/390/320.');
});
