import assert from 'node:assert/strict';
import http from 'node:http';
import { build } from 'esbuild';
import { chromium } from 'playwright';

// Actual hook/provider, isolated UI data and transport. No API, secrets or send.
const result = await build({
  absWorkingDir: process.cwd(), bundle: true, write: false, jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"' },
  stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
    import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
    import {CommunicationLiveProvider,useCommunicationRefresh} from './src/lib/communication-live';
    window.sources=[];window.calls=[];window.pending=[];window.delay=false;window.version=1;
    const nativeTimer=window.setTimeout.bind(window);window.setTimeout=(fn,delay,...args)=>nativeTimer(fn,delay===5000?50:delay,...args);
    class Events{constructor(url,options){this.url=url;this.options=options;this.closed=false;window.sources.push(this)}close(){this.closed=true}}
    window.EventSource=Events;
    window.emit=message=>window.sources.filter(source=>!source.closed).forEach(source=>source.onmessage?.({data:JSON.stringify(message)}));
    window.visible=value=>{Object.defineProperty(document,'hidden',{configurable:true,value:!value});document.dispatchEvent(new Event('visibilitychange'))};
    function Panel({id,active,fallback=100}){
      const [value,setValue]=useState(0),[draft,setDraft]=useState('');
      useCommunicationRefresh(async signal=>{window.calls.push(id);const next=window.version;if(window.delay)await new Promise(resolve=>window.pending.push(resolve));if(!signal.aborted)setValue(next)},active,fallback);
      return <section><span data-testid={id}>{value}</span><input aria-label={'draft-'+id} value={draft} onChange={event=>setDraft(event.target.value)}/></section>
    }
    function App(){const [b,setB]=useState(true),[enabled,setEnabled]=useState(true);return <CommunicationLiveProvider url={enabled?'http://isolated.test/updates':null}>
      <button onClick={()=>setB(!b)}>Toggle B</button><button onClick={()=>setEnabled(!enabled)}>Toggle feed</button>
      <Panel id='a' active/><Panel id='b' active={b}/><Panel id='once' active fallback={0}/>
    </CommunicationLiveProvider>}
    createRoot(document.getElementById('root')).render(<App/>);
  ` },
});
const server = http.createServer((req, res) => {
  res.setHeader('Content-Type', req.url === '/app.js' ? 'application/javascript' : 'text/html');
  res.end(req.url === '/app.js' ? result.outputFiles[0].text : '<div id="root"></div><script src="/app.js"></script>');
});
let browser;
try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.waitForFunction(() => window.sources.length === 1 && window.calls.length >= 2);
  assert.equal(await page.evaluate(() => window.sources[0].options.withCredentials), true);
  await page.evaluate(() => window.emit({ type: 'ready' }));
  await page.waitForTimeout(350);
  const count = () => page.evaluate(() => window.calls.length);
  let before = await count(); await page.waitForTimeout(250);
  assert.equal(await count(), before, 'connected feed stops fallback polling');
  await page.getByLabel('draft-a').fill('Unsaved message');
  await page.getByRole('button', { name: 'Toggle B', exact: true }).click();
  const bBefore = await page.evaluate(() => window.calls.filter(id => id === 'b').length);
  before = await count();
  await page.evaluate(() => { window.version = 2; for (let i = 0; i < 20; i++) window.emit({ type: 'changed', resources: [{ domain: 'communication' }] }); });
  await page.waitForFunction(() => document.querySelector('[data-testid=a]').textContent === '2');
  assert.equal(await count(), before + 2, 'burst coalesces and refreshes only active panels');
  assert.equal(await page.evaluate(() => window.calls.filter(id => id === 'b').length), bBefore);
  assert.equal(await page.getByLabel('draft-a').inputValue(), 'Unsaved message');
  before = await count();
  await page.evaluate(() => window.emit({ type: 'changed', resources: [{ domain: 'orders' }] }));
  await page.waitForTimeout(300); assert.equal(await count(), before, 'unrelated resource does not reload communication');
  await page.evaluate(() => { window.delay = true; window.emit({ type: 'resync' }); });
  await page.waitForFunction(() => window.pending.length === 2);
  await page.evaluate(() => window.emit({ type: 'resync' }));
  await page.waitForTimeout(250);
  assert.equal(await page.evaluate(() => window.pending.length), 2, 'one pending read per active panel');
  before = await count();
  await page.evaluate(() => { window.version = 3; window.delay = false; window.pending.splice(0).forEach(resolve => resolve()); });
  await page.waitForFunction(() => document.querySelector('[data-testid=a]').textContent === '3');
  assert.equal(await count(), before + 2, 'pending invalidation schedules one trailing read per panel');
  await page.evaluate(() => window.visible(false));
  assert.equal(await page.evaluate(() => window.sources.every(source => source.closed)), true);
  before = await count(); await page.waitForTimeout(250); assert.equal(await count(), before);
  await page.evaluate(() => window.visible(true));
  await page.waitForFunction(() => window.sources.some(source => !source.closed));
  await page.evaluate(() => { window.version = 4; window.emit({ type: 'ready' }); });
  await page.waitForFunction(() => document.querySelector('[data-testid=a]').textContent === '4');
  await page.evaluate(() => window.sources.find(source => !source.closed).onerror());
  before = await count(); await page.waitForFunction(n => window.calls.length > n, before);
  await page.waitForFunction(() => window.sources.some(source => !source.closed));
  await page.evaluate(() => window.emit({ type: 'ready' }));
  await page.waitForTimeout(350); before = await count(); await page.waitForTimeout(250);
  assert.equal(await count(), before, 'reconnected feed stops fallback again');
  await page.evaluate(() => window.visible(false));
  await page.getByRole('button', { name: 'Toggle feed', exact: true }).click();
  await page.evaluate(() => { window.version = 5; window.visible(true); });
  await page.waitForFunction(() => document.querySelector('[data-testid=once]').textContent === '5', null, { timeout: 3000 });
  assert.deepEqual(errors, []);
  console.log('PASS shared credentialed feed, active-only/burst/pending refresh, drafts, visibility, reconnect and unavailable fallback.');
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
