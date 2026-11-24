// With Playwright and a docs server: node test/rtf-image-format.browser.cjs [URL]
const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');
global.PechaImages=require('../src/images');global.Folio=require('../src/folio');
const Engine=require('../src/engine'),Rtf=require('../src/rtf'),fixture=require('./rtf-picture-fixture');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
  page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.argv[2]||'http://127.0.0.1:8786/');await page.locator('#pasteText').click();
  const upload=(name,buffer)=>page.locator('#openFile').setInputFiles({name,mimeType:'application/octet-stream',buffer});
  const base=Engine.defaultDoc();base.counts={title:0,fancy:0};base.yigo.enabled=false;base.types.body.lines=4;base.types.body.lineHeight=.6;base.types.body.baseline=.4;
  await upload('base.pecha',Buffer.from(JSON.stringify(base)));
  await page.waitForFunction(()=>document.querySelector('#toast').textContent==='Opened base.pecha.');
  await upload('aligned-pictures.rtf',Buffer.from(fixture.sample()));
  await page.waitForFunction(()=>document.querySelectorAll('#table image').length===4);
  const geometry=()=>page.locator('#table image').evaluateAll(images=>images.map(im=>['x','y','width','height'].map(k=>+im.getAttribute(k))));
  const original=await geometry(),xs=original.map(g=>g[0]);
  assert(xs[1]>xs[0]&&xs[0]>xs[2]);assert(Math.abs(xs[0]-(xs[1]+xs[2])/2)<.01);assert.equal(xs[2],xs[3]);
  assert(original.every(g=>g[2]===72&&g[3]===36));
  await page.getByText('Reuse text, layouts and annotations',{exact:true}).click();
  const downloading=page.waitForEvent('download');await page.locator('#exportRtf').click();
  const data=fs.readFileSync(await(await downloading).path());
  const exported=Rtf.read(data,Engine).doc;
  assert.deepEqual(Engine.parseStream(exported.text,false).filter(r=>r.k==='image').map(r=>r.style.align),['c','r','l','j']);
  await upload('roundtrip.rtf',data);
  await page.waitForFunction(text=>document.querySelector('#text').value===text,exported.text);
  assert.deepEqual(await geometry(),original);
  await page.evaluate(()=>window.dispatchEvent(new Event('beforeprint')));
  const print=await page.locator('#printRoot image').evaluateAll(images=>images.map(im=>['x','y','width','height'].map(k=>+im.getAttribute(k))));
  assert.deepEqual(print,original);
  if(process.env.QA_SCREENSHOT)await page.screenshot({path:process.env.QA_SCREENSHOT,fullPage:true});
  assert.deepEqual(errors,[]);console.log('PASS: RTF file import, center/right/left/justify image positions, download/reimport geometry, print SVG, no JS errors');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
