import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import http from 'node:http';

test('countdowns share the server clock despite wrong device time and timezone', async () => {
  const { outputFiles } = await build({ bundle: true, write: false, platform: 'browser', jsx: 'automatic', tsconfig: 'tsconfig.json', define: { 'process.env.NODE_ENV': '"production"' },
    stdin: { contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {useServerTime} from './src/components/use-server-time';import {formatIndiaDateTime} from './src/lib/date-time';function Clock({id}){const now=useServerTime();return <p id={id}>{now===null?'Loading':formatIndiaDateTime(now)}</p>}createRoot(document.getElementById('root')).render(<><Clock id="first"/><Clock id="second"/></>);`, loader: 'tsx', resolveDir: process.cwd() },
  });
  const fixedTime = Date.parse('2026-10-17T18:45:00Z');
  let samples = 0;
  const server = http.createServer((req, res) => {
    if (req.url === '/api/time') { samples++; res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify({ now: fixedTime })); }
    if (req.url === '/app.js') { res.setHeader('Content-Type', 'application/javascript'); return res.end(outputFiles[0].contents); }
    res.setHeader('Content-Type', 'text/html'); res.end('<div id="root"></div><script src="/app.js"></script>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true });
  try {
    for (const timezoneId of ['UTC', 'Asia/Kolkata', 'America/New_York']) {
      const page = await browser.newPage({ timezoneId });
      await page.addInitScript(() => { Date.now = () => 0; });
      const before = samples;
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      await page.waitForFunction(() => document.querySelector('#first').textContent.includes('IST'));
      const expected = '18 Oct 2026, 12:15 am IST';
      assert.equal(await page.locator('#first').innerText(), expected);
      assert.equal(await page.locator('#second').innerText(), expected);
      assert.equal(samples - before, 1, 'Both consumers use one server clock sample');
      await page.close();
    }
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
});
