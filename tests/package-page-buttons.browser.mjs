// The package page's two buttons (production PublicInteraction in an isolated browser harness; transport is a fixture):
// in the white card "Get this package" and "Arrange a callback" sit one above the other, in the sticky bottom bar side by side,
// and nothing scrolls sideways at 1440, 390 and 320 px.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import path from 'node:path';
import http from 'node:http';
import { build } from 'esbuild';
import { chromium } from 'playwright';

test('package page: card buttons one above the other, sticky bar buttons side by side', async () => {
  const bundle = await build({ bundle: true, write: false, outdir: 'out', platform: 'browser', jsx: 'automatic', tsconfig: 'tsconfig.json', conditions: ['style', 'browser'], define: { 'process.env.NODE_ENV': '"production"' },
    stdin: { contents: `import React from 'react';import{createRoot}from'react-dom/client';
      import{PublicInteraction}from'./src/components/campaign/public-interaction/page-content';import{DEFAULT_OFFER,DEFAULT_UNIVERSAL_TERMS}from'./src/lib/offers';import './src/app/globals.css';
      const offer={...DEFAULT_OFFER,slug:'p',title:'Dynamic Website with Content Management',heading:'Website package',headingHighlight:'',description:'A package.',supportingLine:'',mainPrice:15000,discountPrice:9999,offerPrice:9999,endsAt:'2030-01-01T00:00:00Z'};
      createRoot(document.getElementById('root')).render(<PublicInteraction offer={offer} terms={DEFAULT_UNIVERSAL_TERMS} pkg={{id:'p',name:offer.title,live:false,back:{href:'/',label:'Packages'},start:{signedIn:true,countries:undefined},packageTerms:[],customize:'/package/p/customize'}}/>);`,
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
  let callbackAsked = false;
  const server = http.createServer((req, res) => {
    if (req.url === '/app.js') { res.setHeader('Content-Type', 'application/javascript'); return res.end(js); }
    if (req.url === '/app.css') { res.setHeader('Content-Type', 'text/css'); return res.end(css); }
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/api/time') return res.end(JSON.stringify({ now }));
    if (req.url === '/api/package-starts') return res.end(JSON.stringify({ enabled: true, requests: callbackAsked
      ? [{ id: 'r1', packageId: 'p', kind: 'callback', title: 'x', price: 9999, requestedAt: new Date(now).toISOString(), status: 'requested' }] : [] }));
    res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script src="/app.js"></script></body></html>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  const shots = process.env.SHOT_DIR;
  const errors = [];
  try {
    for (const asked of [false, true]) {
      callbackAsked = asked;
      for (const [width, height] of [[1440, 900], [390, 800], [320, 700]]) {
        const page = await browser.newPage({ viewport: { width, height } }); page.on('pageerror', error => errors.push(error.message));
        await page.goto(origin);
        const card = page.locator('section[aria-label]');
        const cardGet = card.getByRole('link', { name: 'Get this package' });
        const cardCall = card.getByRole('button', { name: asked ? 'Callback requested · our team will contact you' : 'Arrange a callback' });
        const bar = page.locator('div[class*="sticky"]').first();
        const barGet = bar.getByRole('link', { name: 'Get this package' });
        const barCall = bar.getByRole('button', { name: asked ? 'Callback requested ✓' : 'Arrange a callback' });
        await cardGet.waitFor(); await cardCall.waitFor(); await barGet.waitFor(); await barCall.waitFor();
        const label = `${width}px${asked ? ' after a callback' : ''}`;

        const g = await cardGet.boundingBox(), c = await cardCall.boundingBox();
        assert.ok(c.y >= g.y + g.height - 1, `card: Callback is below Get this package at ${label}`);
        assert.ok(Math.abs(c.x - g.x) < 2 && Math.abs(c.width - g.width) < 2, `card: both buttons have the same left edge and width at ${label}`);

        const bg = await barGet.boundingBox(), bc = await barCall.boundingBox(), box = await bar.boundingBox();
        assert.ok(Math.abs(bg.y - bc.y) < 2 && bc.x > bg.x + bg.width - 1, `bar: the two buttons are side by side, Get this package on the left at ${label}`);
        assert.ok(bg.x >= 0 && bc.x + bc.width <= width, `bar: both buttons are inside the screen at ${label}`);
        assert.ok(box.height <= 110, `bar stays a bar (${Math.round(box.height)}px high) at ${label}`);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `no sideways scroll at ${label}`);
        assert.equal(await barCall.isDisabled(), asked, `the bar's callback button is disabled once a callback is asked (${label})`);
        assert.equal(await cardCall.isDisabled(), asked);
        if (shots) await page.screenshot({ path: path.join(shots, `package-page-${width}${asked ? '-asked' : ''}.png`) });
        await page.close();
      }
    }
  } finally { await browser.close(); server.close(); }
  assert.deepEqual(errors, []);
  console.log('PASS: package page — card buttons stacked, sticky bar buttons side by side, 1440/390/320, before and after a callback.');
});
