// Focused browser QA runs actual editor, public-page and save-route source.
// Next shell/auth are local fixtures; JSON persistence is real and isolated.
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright';
await import('./page-content-browser-build.mjs');
const root=process.cwd(),dir=path.join(root,'.next','content-focused-qa');
const dataDir=fs.mkdtempSync(path.join(dir,'data-'));process.env.DATA_DRIVER='json';process.chdir(dataDir);
const code=(await import(pathToFileURL(path.join(dir,'server.cjs')).href)).default;
const defaults=JSON.parse(fs.readFileSync(path.join(root,'src/lib/page-content-defaults.json'),'utf8'));
const globalCss=['src/app/brand-colors.css','src/app/globals.css'].map(f=>fs.readFileSync(path.join(root,f),'utf8').replace(/@import[^;]+;/g,'')).join('\n');
let origin,browser;
const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,origin);
 if(url.pathname==='/editor.js'||url.pathname==='/editor.css'||url.pathname==='/server.css'){res.setHeader('Content-Type',url.pathname.endsWith('.js')?'text/javascript':'text/css');res.end(fs.readFileSync(path.join(dir,url.pathname.slice(1))));return;}
 if(url.pathname==='/fixture.svg'){res.setHeader('Content-Type','image/svg+xml');res.end('<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200"><rect width="900" height="1200" fill="#00243d"/><text x="40" y="100" fill="#66e4ee" font-size="40">Content QA image</text></svg>');return;}
 if(url.pathname==='/api/media'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(await code.mediaRepo.list()));return;}
 if(url.pathname==='/api/website-content'){
  let body='';for await(const chunk of req)body+=chunk;
  const request=new Request(url,{method:req.method,headers:req.headers,body});
  const response=await code.context.run(Boolean(req.headers.cookie?.includes('token=content-qa')),()=>code.PATCH(request));
  res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
 }
 if(url.pathname==='/admin/content'){
  const page=url.searchParams.get('page'),section=url.searchParams.get('section'),settings=await code.settingsRepo.get();
  const content=(page==='about'?code.resolveAbout(settings):code.resolveServices(settings))[section];
  const ids=code.sectionVisualIds(page,section,content);const initialVisuals=Object.fromEntries(ids.filter(id=>settings.sectionVisuals?.[id]).map(id=>[id,settings.sectionVisuals[id]]));
  const props={page,section,initial:content,initialVisuals,assets:await code.mediaRepo.list(),links:[{label:'Website',options:[{label:'Contact',href:'/contact'},{label:'Work',href:'/work'},{label:'Services',href:'/services'},{label:'Packages',href:'/campaign/packages'}]}]};
  res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+globalCss+'</style><link rel="stylesheet" href="/editor.css"></head><body><div class="admin-shell" style="display:block"><main class="admin-main" style="max-width:1080px;margin:auto"><h1>'+page+' / '+section+'</h1><div id="editor"></div></main></div><script>window.__fixture='+JSON.stringify(props).replace(/</g,'\\u003c')+'</script><script src="/editor.js"></script></body></html>');return;
 }
 if(url.pathname==='/about'||url.pathname==='/services'){
  const element=await (url.pathname==='/about'?code.About():code.Services());res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+globalCss+'</style><link rel="stylesheet" href="/server.css"></head><body>'+code.renderToStaticMarkup(element)+'</body></html>');return;
 }
 res.statusCode=404;res.end('Not found');
}catch(error){console.error(error);res.statusCode=500;res.end(error.message);}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port;
await code.mediaRepo.create({url:origin+'/fixture.svg',publicId:'content-qa',assetId:'fixture',assetFolder:'test',width:900,height:1200,bytes:1000,format:'svg',altText:'Content QA image',kind:'image'});
try{
 browser=await chromium.launch();const editor=await browser.newContext({viewport:{width:1440,height:1000}});await editor.addCookies([{name:'token',value:'content-qa',url:origin}]);const p=await editor.newPage();const errors=[];p.on('pageerror',e=>{errors.push(e.message);console.error('Browser error: '+e.message)});p.on('console',m=>{if(m.type()==='error')console.error(m.text())});
 const goto=(page,section)=>p.goto(origin+'/admin/content?page='+page+'&section='+section);
 const save=async()=>{const wait=p.waitForResponse(r=>r.url().endsWith('/api/website-content'));await p.getByRole('button',{name:'Save changes',exact:true}).click();const r=await wait;assert.equal(r.status(),200,await r.text());await p.getByText('Section saved. Changes are live on the website.',{exact:true}).waitFor();};
 await goto('about','hero');assert.equal(await p.getByLabel('Main heading',{exact:true}).inputValue(),defaults.about.hero.heading);
 await p.getByLabel('Main heading',{exact:true}).fill('QA saved heading');
 await p.getByRole('button',{name:'Choose image, GIF or MP4',exact:true}).click();await p.getByRole('button',{name:/Content QA image/}).click();
 await p.getByLabel('Frame size',{exact:true}).selectOption('source');await save();await p.reload();
 assert.equal(await p.getByLabel('Main heading',{exact:true}).inputValue(),'QA saved heading');assert.equal(await p.getByLabel('Frame size',{exact:true}).inputValue(),'source');
 const pub=await editor.newPage();await pub.goto(origin+'/about');assert.match(await pub.locator('h1').innerText(),/QA saved heading/);assert.equal(await pub.locator('main .section-visual').first().evaluate(n=>getComputedStyle(n).aspectRatio),'900 / 1200');console.log('PASS: text, image and original proportions saved/reloaded on actual page source');
 await goto('about','leadership');await p.getByRole('button',{name:'Move Team members 1 down',exact:true}).click();await save();assert.equal((await code.settingsRepo.get()).pageContent.about.leadership.members[0].id,'sahilpreet');
 await p.getByRole('button',{name:'Add team member +',exact:true}).click();await p.getByLabel('Name',{exact:true}).last().fill('QA New Member');await save();await pub.reload();await pub.getByRole('heading',{name:'QA New Member',exact:true}).waitFor();
 p.once('dialog',dialog=>dialog.accept());await p.getByRole('button',{name:'Remove',exact:true}).last().click();await save();await pub.reload();assert.equal(await pub.getByRole('heading',{name:'QA New Member',exact:true}).count(),0);

 await goto('services','catalogue');await p.getByLabel('Title',{exact:true}).nth(1).fill('QA website service');await save();await pub.goto(origin+'/services');await pub.getByRole('heading',{name:'QA website service',exact:true}).click();assert.equal(await pub.getByText(defaults.services.catalogue.groups[0].items[0].description,{exact:true}).isVisible(),true);
 await p.getByRole('button',{name:'Add service +',exact:true}).first().click();await save();const added=(await code.settingsRepo.get()).pageContent.services.catalogue.groups[0].items.at(-1);await p.getByRole('button',{name:'New service',exact:true}).click();await p.getByRole('button',{name:'Choose image, GIF or MP4',exact:true}).click();await p.getByRole('button',{name:/Content QA image/}).click();await p.getByLabel('Frame size',{exact:true}).selectOption('square');await save();assert.ok((await code.settingsRepo.get()).sectionVisuals['services.item.'+added.id].assetId);await pub.goto(origin+'/services');await pub.getByRole('heading',{name:'New service',exact:true}).click();assert.equal(await pub.locator('main .section-visual-media').count(),1);

 const anon=await browser.newContext();assert.equal((await anon.request.patch(origin+'/api/website-content',{data:{page:'about',section:'hero',content:defaults.about.hero}})).status(),401);
 assert.equal((await editor.request.patch(origin+'/api/website-content',{headers:{Origin:'https://untrusted.example'},data:{}})).status(),403);
 assert.equal((await editor.request.patch(origin+'/api/website-content',{data:{page:'services',section:'contact',content:{...defaults.services.contact,buttonHref:'javascript:alert(1)'}}})).status(),400);
 for(const[page,sections]of Object.entries(defaults))for(const section of Object.keys(sections)){await goto(page,section);await p.getByRole('button',{name:'Save changes',exact:true}).waitFor();}
 fs.mkdirSync(path.join(root,'test-results/page-content'),{recursive:true});
 for(const width of [1440,390]){await p.setViewportSize({width,height:1000});await goto('services','hero');assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Editor overflow');await p.screenshot({path:path.join(root,'test-results/page-content/editor-'+width+'.png'),fullPage:true});await pub.setViewportSize({width,height:1000});await pub.goto(origin+'/services');assert.equal(await pub.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Public page overflow');}
 assert.deepEqual(errors,[]);console.log('PASS: all sections render; team add/reorder; services save; API validation; desktop/mobile editor and public layout');
}finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));process.chdir(root);assert.ok(path.resolve(dataDir).startsWith(path.resolve(dir)+path.sep));assert.ok(path.basename(dataDir).startsWith('data-'));fs.rmSync(dataDir,{recursive:true,force:true});}
