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
let origin,browser,videoBytes;
const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,origin);
 if(url.pathname==='/editor.js'||url.pathname==='/editor.css'||url.pathname==='/server.css'){res.setHeader('Content-Type',url.pathname.endsWith('.js')?'text/javascript':'text/css');res.end(fs.readFileSync(path.join(dir,url.pathname.slice(1))));return;}
 if(url.pathname==='/fixture.svg'){res.setHeader('Content-Type','image/svg+xml');res.end('<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200"><rect width="900" height="1200" fill="#00243d"/><text x="40" y="100" fill="#66e4ee" font-size="40">Content QA image</text></svg>');return;}
 if(url.pathname==='/fixture.webm'){res.setHeader('Content-Type','video/webm');res.end(videoBytes);return;}
 if(url.pathname==='/api/media'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(await code.mediaRepo.list()));return;}
 if(url.pathname==='/api/website-content'||url.pathname==='/api/visuals'){
  let body='';for await(const chunk of req)body+=chunk;
  const request=new Request(url,{method:req.method,headers:req.headers,body});
  const response=await code.context.run(Boolean(req.headers.cookie?.includes('token=content-qa')),()=>(url.pathname==='/api/visuals'?code.VisualPATCH:code.PATCH)(request));
  res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
 }
 if(url.pathname==='/admin/content'||url.pathname==='/admin/visuals'){
  const page=url.searchParams.get('page'),section=url.searchParams.get('section'),settings=await code.settingsRepo.get();
  const content=(page==='about'?code.resolveAbout(settings):code.resolveServices(settings))[section];
  const ids=code.sectionVisualIds(page,section,content);const initialVisuals=Object.fromEntries(ids.filter(id=>settings.sectionVisuals?.[id]).map(id=>[id,settings.sectionVisuals[id]]));
  const props=url.pathname==='/admin/visuals'?{standalone:true,initial:settings.sectionVisuals??{},assets:await code.mediaRepo.list(),focusSlot:'home.hero'}:{page,section,initial:content,initialVisuals,assets:await code.mediaRepo.list(),links:[{label:'Website',options:[{label:'Contact',href:'/contact'},{label:'Work',href:'/work'},{label:'Services',href:'/services'},{label:'Packages',href:'/campaign/packages'}]}]};
  res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+globalCss+'</style><link rel="stylesheet" href="/editor.css"></head><body><div class="admin-shell" style="display:block"><main class="admin-main" style="max-width:1080px;margin:auto"><h1>'+page+' / '+section+'</h1><div id="editor"></div></main></div><script>window.__fixture='+JSON.stringify(props).replace(/</g,'\\u003c')+'</script><script src="/editor.js"></script></body></html>');return;
 }
 if(url.pathname==='/about'||url.pathname==='/services'||url.pathname==='/'){
  const element=await (url.pathname==='/about'?code.About():url.pathname==='/services'?code.Services():code.Home());res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+globalCss+'</style><link rel="stylesheet" href="/server.css"></head><body>'+code.renderToStaticMarkup(element)+'</body></html>');return;
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
 await p.getByRole('button',{name:'Match media ratio',exact:true}).click();await save();await p.reload();
 assert.equal(await p.getByLabel('Main heading',{exact:true}).inputValue(),'QA saved heading');assert.equal(await p.getByLabel('Frame height (px)',{exact:true}).inputValue(),'640');
 const pub=await editor.newPage();await pub.goto(origin+'/about');assert.match(await pub.locator('h1').innerText(),/QA saved heading/);assert.equal(await pub.locator('main .section-visual').first().evaluate(n=>getComputedStyle(n).aspectRatio),'480 / 640');console.log('PASS: text, image and matched frame ratio saved/reloaded on actual page source');
 await goto('about','leadership');await p.getByRole('button',{name:'Move Team members 1 down',exact:true}).click();await save();assert.equal((await code.settingsRepo.get()).pageContent.about.leadership.members[0].id,'sahilpreet');
 await p.getByRole('button',{name:'Add team member +',exact:true}).click();await p.getByLabel('Name',{exact:true}).last().fill('QA New Member');await save();await pub.reload();await pub.getByRole('heading',{name:'QA New Member',exact:true}).waitFor();
 p.once('dialog',dialog=>dialog.accept());await p.getByRole('button',{name:'Remove',exact:true}).last().click();await save();await pub.reload();assert.equal(await pub.getByRole('heading',{name:'QA New Member',exact:true}).count(),0);

 await goto('services','catalogue');await p.getByLabel('Title',{exact:true}).nth(1).fill('QA website service');await save();await pub.goto(origin+'/services');await pub.getByRole('heading',{name:'QA website service',exact:true}).click();assert.equal(await pub.getByText(defaults.services.catalogue.groups[0].items[0].description,{exact:true}).isVisible(),true);
 await p.getByRole('button',{name:'Add service +',exact:true}).first().click();await save();const added=(await code.settingsRepo.get()).pageContent.services.catalogue.groups[0].items.at(-1);await p.getByRole('button',{name:'New service',exact:true}).click();await p.getByRole('button',{name:'Choose image, GIF or MP4',exact:true}).click();await p.getByRole('button',{name:/Content QA image/}).click();await p.getByLabel('Frame proportions',{exact:true}).selectOption('1:1');await save();assert.ok((await code.settingsRepo.get()).sectionVisuals['services.item.'+added.id].assetId);await pub.goto(origin+'/services');await pub.getByRole('heading',{name:'New service',exact:true}).click();assert.equal(await pub.locator('main .section-visual-media').count(),1);

 // Exercise the crop controls against real persistence and public page wrappers.
 const setRange=async(label,value)=>p.getByRole('slider',{name:label,exact:true}).evaluate((node,value)=>{const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(node,String(value));node.dispatchEvent(new Event('input',{bubbles:true}));node.dispatchEvent(new Event('change',{bubbles:true}));},value);
 const rects=async(page,selector)=>page.locator(selector).evaluate(node=>{const f=node.getBoundingClientRect(),m=node.querySelector('.section-visual-media')?.getBoundingClientRect();return{width:f.width,height:f.height,media:m?{width:m.width,height:m.height,x:m.x-f.x,y:m.y-f.y}:null,radius:getComputedStyle(node).borderRadius}});
 await goto('about','leadership');await p.getByRole('button',{name:'Jasmeet Kaur',exact:true}).click();
 assert.equal(await p.getByLabel('Frame width (px)',{exact:true}).inputValue(),'280');assert.equal(await p.getByLabel('Frame height (px)',{exact:true}).inputValue(),'350');
 await p.getByRole('button',{name:'Choose image, GIF or MP4',exact:true}).click();await p.getByRole('button',{name:/Content QA image/}).click();
 await p.getByLabel('Frame width (px)',{exact:true}).fill('320');await p.getByLabel('Frame width (px)',{exact:true}).blur();assert.equal(await p.getByLabel('Frame height (px)',{exact:true}).inputValue(),'400');
 await p.getByLabel('Lock frame ratio',{exact:true}).uncheck();await p.getByLabel('Frame height (px)',{exact:true}).fill('360');await p.getByLabel('Frame height (px)',{exact:true}).blur();
 await setRange('Zoom',180);await p.getByLabel('Free positioning (allow empty space)',{exact:true}).check();
 const preview=p.locator('.visuals-preview .section-visual');const box=await preview.boundingBox();await p.mouse.move(box.x+box.width/2,box.y+box.height/2);await p.mouse.down();await p.mouse.move(box.x+box.width/2+45,box.y+box.height/2-30,{steps:5});await p.mouse.up();
 await save();let savedVisual=(await code.settingsRepo.get()).sectionVisuals['about.jasmeet'];assert.equal(savedVisual.frame.width,320);assert.equal(savedVisual.frame.height,360);assert.equal(savedVisual.crop.zoom,1.8);assert.ok(savedVisual.crop.x>10&&savedVisual.crop.y<0,'Drag updates frame-relative position');
 await pub.goto(origin+'/about');const director='[aria-label="Jasmeet Kaur profile"]';const live=await rects(pub,director),shown=await rects(p,'.visuals-preview .section-visual');assert.ok(Math.abs(live.width-320)<2,JSON.stringify({live,shown}));assert.ok(Math.abs(live.width/live.height-shown.width/shown.height)<.01,JSON.stringify({live,shown}));assert.ok(Math.abs(live.media.x/live.width-shown.media.x/shown.width)<.02);
 fs.mkdirSync(path.join(root,'test-results/page-content'),{recursive:true});await p.locator('.visual-frame-editor').screenshot({path:path.join(root,'test-results/page-content/frame-crop-desktop.png')});
 await p.reload();await p.getByRole('button',{name:'Jasmeet Kaur',exact:true}).click();assert.equal(await p.getByRole('slider',{name:'Zoom',exact:true}).inputValue(),'180');
 await p.getByRole('button',{name:'Pattern + media',exact:true}).click();const withPattern=await rects(p,'.visuals-preview .section-visual');assert.ok(Math.abs(withPattern.media.width-shown.media.width)<1,'Pattern must not shrink media');
 await p.getByRole('button',{name:'Mobile preview',exact:true}).click();await p.getByLabel('Use separate mobile dimensions',{exact:true}).check();await p.getByLabel('Lock frame ratio',{exact:true}).uncheck();await p.getByLabel('Frame width (px)',{exact:true}).fill('220');await p.getByLabel('Frame height (px)',{exact:true}).fill('300');await p.getByLabel('Frame height (px)',{exact:true}).blur();await save();await p.getByRole('button',{name:'Mobile preview',exact:true}).click();
 await pub.setViewportSize({width:390,height:1000});await pub.reload();const mobileLive=await rects(pub,director),mobilePreview=await rects(p,'.visuals-preview .section-visual');assert.ok(Math.abs(mobileLive.width-220)<2,JSON.stringify({mobileLive,mobilePreview}));assert.ok(Math.abs(mobileLive.height-300)<2);assert.ok(Math.abs(mobileLive.media.x/mobileLive.width-mobilePreview.media.x/mobilePreview.width)<.02);assert.equal(await pub.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await p.setViewportSize({width:390,height:1000});await p.reload();await p.getByRole('button',{name:'Jasmeet Kaur',exact:true}).click();await p.getByRole('button',{name:'Mobile preview',exact:true}).click();
 await p.locator('.visuals-preview').scrollIntoViewIfNeeded();const beforeTouch=await p.getByRole('slider',{name:'Horizontal position',exact:true}).inputValue(),touchBox=await p.locator('.visuals-preview .section-visual').boundingBox(),cdp=await editor.newCDPSession(p);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:touchBox.x+70,y:touchBox.y+70}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:touchBox.x+95,y:touchBox.y+80}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();assert.notEqual(await p.getByRole('slider',{name:'Horizontal position',exact:true}).inputValue(),beforeTouch,'Touch drag updates crop');
 await p.getByRole('button',{name:'Reset frame',exact:true}).click();assert.equal(await p.getByLabel('Use separate mobile dimensions',{exact:true}).isChecked(),false);assert.equal(await p.getByRole('slider',{name:'Zoom',exact:true}).inputValue(),'180');
 await p.getByRole('button',{name:'Desktop preview',exact:true}).click();assert.equal(await p.getByLabel('Frame width (px)',{exact:true}).inputValue(),'280');await p.getByLabel('Frame width (px)',{exact:true}).fill('320');await p.getByRole('button',{name:'Apply recommended',exact:true}).click();assert.equal(await p.getByLabel('Frame width (px)',{exact:true}).inputValue(),'280');assert.equal(await p.getByRole('slider',{name:'Zoom',exact:true}).inputValue(),'180');
 await p.getByLabel('Media fit',{exact:true}).selectOption('contain');const fitted=await rects(p,'.visuals-preview .section-visual');assert.ok(fitted.media.width<=fitted.width+.1&&fitted.media.height<=fitted.height+.1);assert.ok(Math.abs(fitted.media.width/fitted.media.height-.75)<.001,'Fit must retain the source ratio');
 await p.getByRole('button',{name:'Reset crop',exact:true}).click();assert.equal(await p.getByRole('slider',{name:'Zoom',exact:true}).inputValue(),'100');assert.equal(await p.getByLabel('Free positioning (allow empty space)',{exact:true}).isChecked(),false);await save();await pub.reload();await pub.locator('article').filter({has:pub.getByRole('heading',{name:'Jasmeet Kaur',exact:true})}).screenshot({path:path.join(root,'test-results/page-content/director-mobile.png')});
 // Videos use the same geometry, including on the homepage's special hero wrapper.
 await p.setViewportSize({width:1440,height:1000});await pub.setViewportSize({width:1440,height:1000});
 videoBytes=Buffer.from(await p.evaluate(async()=>{const canvas=document.createElement('canvas');canvas.width=640;canvas.height=360;const ctx=canvas.getContext('2d');ctx.fillStyle='#00243d';ctx.fillRect(0,0,640,360);const stream=canvas.captureStream(10),recorder=new MediaRecorder(stream,{mimeType:'video/webm'}),chunks=[];const done=new Promise(resolve=>{recorder.ondataavailable=e=>chunks.push(e.data);recorder.onstop=async()=>resolve(Array.from(new Uint8Array(await new Blob(chunks).arrayBuffer())));});recorder.start();await new Promise(resolve=>setTimeout(resolve,250));recorder.stop();const bytes=await done;stream.getTracks().forEach(t=>t.stop());return bytes;}));
 await code.mediaRepo.create({url:origin+'/fixture.webm',publicId:'video-qa',assetId:'video-fixture',assetFolder:'test',width:640,height:360,bytes:videoBytes.length,format:'webm',altText:'Crop QA video',kind:'video'});
 await p.goto(origin+'/admin/visuals');await p.getByRole('button',{name:'Choose image, GIF or MP4',exact:true}).click();await p.getByRole('button',{name:/Crop QA video/}).click();await p.getByRole('button',{name:'Match media ratio',exact:true}).click();await setRange('Zoom',150);
 const visualSave=p.waitForResponse(r=>r.url().endsWith('/api/visuals'));await p.getByRole('button',{name:'Save visual',exact:true}).click();assert.equal((await visualSave).status(),200);await p.reload();assert.equal(await p.getByRole('slider',{name:'Zoom',exact:true}).inputValue(),'150');await pub.goto(origin+'/');
 const heroLive=await rects(pub,'.hero-art .section-visual'),heroPreview=await rects(p,'.visuals-preview .section-visual');assert.ok(Math.abs(heroLive.width-430)<2,JSON.stringify({heroLive,heroPreview,config:(await code.settingsRepo.get()).sectionVisuals['home.hero']}));assert.ok(Math.abs(heroLive.width/heroLive.height-heroPreview.width/heroPreview.height)<.01);assert.equal(await pub.locator('.hero-art video').evaluate(v=>v.muted&&v.loop&&v.playsInline),true);
 await pub.locator('.hero-art video').evaluate(v=>v.readyState>=1?undefined:new Promise((resolve,reject)=>{v.addEventListener('loadedmetadata',resolve,{once:true});v.addEventListener('error',()=>reject(Error('Video fixture failed')),{once:true});}));assert.equal(await pub.locator('.hero-art video').evaluate(v=>v.videoWidth),640);
 await pub.setViewportSize({width:390,height:1000});await pub.reload();assert.equal(await pub.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);const heroMobile=await rects(pub,'.hero-art .section-visual');assert.ok(heroMobile.width<=358&&heroMobile.width>250);assert.ok(Math.abs(heroMobile.width/heroMobile.height-430/242)<.02);
 console.log('PASS: custom dimensions, ratio lock, drag, zoom, independent frame/crop resets, pattern layering, mobile sizing, video and standalone save');

 const anon=await browser.newContext();assert.equal((await anon.request.patch(origin+'/api/website-content',{data:{page:'about',section:'hero',content:defaults.about.hero}})).status(),401);
 assert.equal((await editor.request.patch(origin+'/api/website-content',{headers:{Origin:'https://untrusted.example'},data:{}})).status(),403);
 assert.equal((await editor.request.patch(origin+'/api/website-content',{data:{page:'services',section:'contact',content:{...defaults.services.contact,buttonHref:'javascript:alert(1)'}}})).status(),400);
 for(const[page,sections]of Object.entries(defaults))for(const section of Object.keys(sections)){await goto(page,section);await p.getByRole('button',{name:'Save changes',exact:true}).waitFor();}
 fs.mkdirSync(path.join(root,'test-results/page-content'),{recursive:true});
 for(const width of [1440,390]){await p.setViewportSize({width,height:1000});await goto('services','hero');assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Editor overflow');await p.screenshot({path:path.join(root,'test-results/page-content/editor-'+width+'.png'),fullPage:true});await pub.setViewportSize({width,height:1000});await pub.goto(origin+'/services');assert.equal(await pub.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Public page overflow');}
 assert.deepEqual(errors,[]);console.log('PASS: all sections render; team add/reorder; services save; API validation; desktop/mobile editor and public layout');
}finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));process.chdir(root);assert.ok(path.resolve(dataDir).startsWith(path.resolve(dir)+path.sep));assert.ok(path.basename(dataDir).startsWith('data-'));fs.rmSync(dataDir,{recursive:true,force:true});}
