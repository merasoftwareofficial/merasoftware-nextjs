import { build } from 'esbuild';
import { chromium } from 'playwright';
import http from 'node:http';
import assert from 'node:assert/strict';
const fixture = await build({bundle:true,write:false,jsx:'automatic',loader:{'.js':'jsx'},stdin:{resolveDir:process.cwd(),loader:'jsx',contents:`
import React from 'react';import {createRoot} from 'react-dom/client';
import Website from './src/app/admin/settings/business-settings.jsx';
import Portal from '../frontend/src/components/admin/BusinessSettings.js';
const Component=location.search.includes('portal')?Portal:Website;
createRoot(document.getElementById('root')).render(<Component contactEndpoint="/contacts" invoiceEndpoint="/invoice"/>);
`},plugins:[{name:'react',setup(b){b.onResolve({filter:new RegExp('^react($|/)')},a=>({path:import.meta.resolve(a.path).replace('file:///','')}));}}]});
let contacts={name:'Admin',loginEmail:'admin@example.test',contactEmail:'team@example.test',whatsappNumbers:['+919256537003','+919356393094'],countries:[{code:'+91',label:'India',digits:10}]};
let invoice={businessName:'Mera Software',tagline:'Digital Solutions',addressLines:['Near New Bus Stand','Majitha, Punjab 143601'],email:'contact@example.test',phone:'+91 9653013530',websiteUrl:'https://example.test',termsUrl:'https://example.test/terms',legalName:'',pan:'',gstin:''};
let fail=false;
const server=http.createServer(async(req,res)=>{
 if(req.url==='/app.js'){res.setHeader('Content-Type','text/javascript');res.end(fixture.outputFiles[0].text);return;}
 if(['/contacts','/invoice'].includes(req.url)){
  let body='';for await(const part of req)body+=part;
  if(req.method==='PATCH'&&req.url==='/contacts'&&fail){res.statusCode=400;res.end(JSON.stringify({success:false,message:'Test save failure'}));return;}
  if(body){if(req.url==='/contacts')contacts={...contacts,...JSON.parse(body)};else invoice={...invoice,...JSON.parse(body)};}
  res.setHeader('Content-Type','application/json');res.end(JSON.stringify({success:true,data:req.url==='/contacts'?contacts:invoice}));return;
 }
 res.setHeader('Content-Type','text/html');res.end('<html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script src="/app.js"></script></html>');
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage();page.setDefaultTimeout(8000);const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});
 const base='http://127.0.0.1:'+server.address().port;
 for(const panel of ['website','portal']){
  await page.setViewportSize({width:1280,height:1000});await page.goto(base+'/?'+panel);
  await page.getByLabel('Invoice address',{exact:true}).waitFor();
  assert.equal(await page.locator('form').count(),1);
  assert.equal(await page.getByRole('button',{name:'Save changes',exact:true}).count(),1);
  await page.getByLabel('Invoice address',{exact:true}).fill(panel+' address\nMajitha, Punjab');
  await page.getByRole('button',{name:'Save changes',exact:true}).click();
  await page.getByText('All changes saved.',{exact:true}).waitFor();
  assert.equal(invoice.addressLines[0],panel+' address');
  await page.screenshot({path:'test-results/settings-'+panel+'-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:'test-results/settings-'+panel+'-mobile.png',fullPage:true});
 }
 await page.goto(base+'/?website');assert.equal(await page.getByLabel('Invoice address',{exact:true}).inputValue(),'portal address\nMajitha, Punjab');
 fail=true;await page.getByLabel('Team contact email').fill('retained@example.test');await page.getByRole('button',{name:'Save changes',exact:true}).click();
 await page.getByRole('alert').filter({hasText:'Some changes were saved'}).waitFor();assert.equal(await page.getByLabel('Team contact email').inputValue(),'retained@example.test');
 fail=false;await page.getByRole('button',{name:'Save changes',exact:true}).click();await page.getByText('All changes saved.',{exact:true}).waitFor();
 assert.equal(contacts.contactEmail,'retained@example.test');assert.deepEqual(errors,[]);
 console.log('PASS: both panels, one form/save, shared saved data, mobile overflow, partial failure and retry.');
}finally{await browser.close();await new Promise(r=>server.close(r));}

