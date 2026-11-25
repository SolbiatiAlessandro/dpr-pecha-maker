const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');
global.PechaImages=require('../src/images');global.Folio=require('../src/folio');
const E=require('../src/engine'),P=require('../src/pxp'),{sample}=require('./native-page-image-export-fixture');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const p=await browser.newPage({viewport:{width:1440,height:1100}}),errors=[];p.setDefaultTimeout(15000);p.on('pageerror',e=>errors.push(e.message));await p.goto(process.argv[2]);await p.locator('#pasteText').click();
  const upload=async(name,buffer)=>{await p.locator('#toast').evaluate(n=>n.textContent='');await p.locator('#openFile').setInputFiles({name,mimeType:'application/octet-stream',buffer});await p.waitForFunction(()=>document.querySelector('#toast').textContent.length>0);};
  const save=async()=>{const event=p.waitForEvent('download');await p.locator('#saveDoc').click();return fs.readFileSync(await(await event).path());};
  const fixed=(selector,prefix)=>p.locator(selector+' image').evaluateAll((ns,prefix)=>ns.filter(n=>n.dataset.imageId.startsWith(prefix)).sort((a,b)=>+a.dataset.imageId.split('-').at(-1)-+b.dataset.imageId.split('-').at(-1)).map(n=>[+n.dataset.imageId.split('-').at(-1),...['x','y','width','height'].map(a=>+n.getAttribute(a))]),prefix);
  const d=sample(E);await upload('source.pecha',Buffer.from(JSON.stringify(d)));await p.waitForFunction(()=>document.querySelectorAll('#table image[data-image-id^="page-"]').length===6);
  const before=JSON.parse(await save()),geometry=await fixed('#table','page-');assert.equal(geometry.length,6);
  await p.getByText('Reuse text, layouts and annotations',{exact:true}).click();const event=p.waitForEvent('download');await p.locator('#exportPxp').click();const download=await event,bytes=fs.readFileSync(await download.path());assert.equal(download.suggestedFilename(),'pecha-document.pxp');
  const parsed=P.parse(bytes),block=Buffer.from(parsed.imageBlock).toString('latin1');assert(block.includes('PageImageInfoCount=6'));assert(block.includes('pageNbr=3'));assert(!block.includes('pageNbr=401'));
  assert((await p.locator('#exportMessages').textContent()).includes('one-based'));assert.deepEqual(JSON.parse(await save()),before);
  await upload('roundtrip.pxp',bytes);await p.waitForFunction(()=>document.querySelectorAll('#table image[data-image-id^="native-page-"]').length===6);assert.deepEqual(await fixed('#table','native-page-'),geometry);
  const saved=await save(),got=JSON.parse(saved);assert.equal(got.images.filter(p=>p.kind==='page').length,6);assert.deepEqual(got.images.filter(p=>p.kind==='page').map(p=>p.anchor),PechaImages.anchors);assert.equal(got.assets.length,3);assert.equal(got.pageNum.start,401);assert.equal(got.folio.start,23);assert(got.text.includes('བོད'));assert.equal(got.yigo.image,'native-yigo');
  const text=await p.locator('#table').textContent();assert(text.includes('401')&&text.includes('402')&&text.includes('403'));
  await p.evaluate(()=>window.dispatchEvent(new Event('beforeprint')));assert.deepEqual(await fixed('#printRoot','native-page-'),geometry);
  const sheets=await p.locator('#printRoot .sheet-print').count();assert(sheets>=2);const pdf=await p.pdf({preferCSSPageSize:true,printBackground:true});assert.equal(pdf.subarray(0,5).toString(),'%PDF-');assert(pdf.length>5000);assert.equal((pdf.toString('latin1').match(/\/Type\s*\/Page\b/g)||[]).length,sheets);
  const boxes=[...pdf.toString('latin1').matchAll(/\/MediaBox\s*\[0 0 ([\d.]+) ([\d.]+)\]/g)];assert(boxes.length>0);assert(boxes.every(m=>Math.abs(+m[1]-1008)<1&&Math.abs(+m[2]-612)<1));
  if(process.env.QA_PDF)fs.writeFileSync(process.env.QA_PDF,pdf);
  await upload('saved.pecha',saved);assert.deepEqual(await fixed('#table','native-page-'),geometry);
  if(process.env.QA_SCREENSHOT)await p.screenshot({path:process.env.QA_SCREENSHOT,fullPage:true});
  // Content export includes placements on current pages without changing the source.
  const contentEvent=p.waitForEvent('download');await p.locator('#exportPxc').click();const contentBytes=fs.readFileSync(await(await contentEvent).path());assert(Buffer.from(P.parse(contentBytes).imageBlock).toString('latin1').includes('PageImageInfoCount=6'));assert((await p.locator('#exportMessages').textContent()).includes('current web page count'));assert.deepEqual(await fixed('#table','native-page-'),geometry);
  // Exercise the minimum-offset note and native-reader clamp through actual uploads.
  const clamped=sample(E);clamped.images.find(p=>p.kind==='page').down=-.5;clamped.images.find(p=>p.kind==='page').inward=0;
  await upload('offsets.pecha',Buffer.from(JSON.stringify(clamped)));const next=p.waitForEvent('download');await p.locator('#exportPxp').click();const adjusted=fs.readFileSync(await(await next).path());assert((await p.locator('#exportMessages').textContent()).includes('below 0.01'));
  await upload('adjusted.pxp',adjusted);const im=P.readImages(P.parse(adjusted).imageBlock).images.find(p=>p.kind==='page');assert.equal(im.down,.01);assert.equal(im.inward,.01);
  const b=Buffer.from(adjusted),needle=Buffer.from('yAdj_float=0.010000\nxAdj_float=0.010000'),at=b.indexOf(needle);assert(at>0);const external=Buffer.concat([b.subarray(0,at),Buffer.from('yAdj_float=-0.500000\nxAdj_float=0.000000'),b.subarray(at+needle.length)]);
  await upload('external.pxp',external);assert((await p.locator('#importMessages').textContent()).includes('below 0.01'));assert.equal(await p.locator('#table image[data-image-id="native-page-0"]').count(),1);
  assert.deepEqual(errors,[]);console.log('PASS: full PXP six page anchors and assignments, shared assets, native export/import, exact preview/print geometry, Tibetan/counters/yi-go, PDF and Save/Open, PXC inclusion and offset-clamp notes');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
