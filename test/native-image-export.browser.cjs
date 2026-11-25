const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');
global.PechaImages=require('../src/images');global.Folio=require('../src/folio');
const E=require('../src/engine'),P=require('../src/pxp'),{sample}=require('./native-image-export-fixture');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const p=await browser.newPage({viewport:{width:1440,height:1050}}),errors=[];p.setDefaultTimeout(15000);p.on('pageerror',e=>errors.push(e.message));await p.goto(process.argv[2]);await p.locator('#pasteText').click();
  const upload=async(name,buffer,page=p)=>{await page.locator('#toast').evaluate(n=>n.textContent='');await page.locator('#openFile').setInputFiles({name,mimeType:'application/octet-stream',buffer});await page.waitForFunction(()=>document.querySelector('#toast').textContent.length>0);};
  const save=async(page=p)=>{const event=page.waitForEvent('download');await page.locator('#saveDoc').click();return fs.readFileSync(await(await event).path());};
  const sizes=selector=>p.locator(selector+' image').evaluateAll(ns=>ns.map(n=>[+n.getAttribute('width'),+n.getAttribute('height')]));
  for(const extension of ['pxp','pxc']){
   const d=sample(E);await upload('source.pecha',Buffer.from(JSON.stringify(d)));await p.waitForFunction(()=>document.querySelector('#table').textContent.includes('Second'));
   const before=JSON.parse(await save()),sourceSizes=await sizes('#table');assert(sourceSizes.length>=4);
   if(!await p.locator('#exportPxp').isVisible())await p.getByText('Reuse text, layouts and annotations',{exact:true}).click();
   const event=p.waitForEvent('download');await p.locator(extension==='pxp'?'#exportPxp':'#exportPxc').click();const dl=await event,bytes=fs.readFileSync(await dl.path());assert.equal(dl.suggestedFilename(),extension==='pxp'?'pecha-document.pxp':'pecha-content.pxc');
   const parsed=P.parse(bytes);assert(parsed.imageBlock);assert.equal(parsed.nonBody.values.YigoImageEn,'1');
   const notes=await p.locator('#exportMessages').textContent();assert(notes.includes('resolution metadata')&&notes.includes('96-DPI reference'));assert.deepEqual(JSON.parse(await save()),before);
   if(process.env.QA_EXPORT_SCREENSHOT&&extension==='pxp'){await p.locator('#exportMessages').scrollIntoViewIfNeeded();await p.screenshot({path:process.env.QA_EXPORT_SCREENSHOT,fullPage:true});}
   await upload('roundtrip.'+extension,bytes);await p.waitForFunction(()=>document.querySelector('#table').textContent.includes('Second'));
   assert.deepEqual(await sizes('#table'),sourceSizes);const saved=await save(),got=JSON.parse(saved);assert.equal(got.assets.length,3);assert.equal(got.images.length,5);assert.equal(got.images.find(im=>im.id==='native-inline-1').space,.04);assert.equal(got.images.find(im=>im.id==='native-inline-1').above,.2);assert(got.images.find(im=>im.id==='native-inline-1').addTibetan);assert(got.images.find(im=>im.id==='native-inline-3').ignoreDpi);
   assert.equal(got.folio.start,23);assert.equal(got.pageNum.start,401);assert(got.text.includes('བོད'));assert(got.text.includes('Café'));
   await p.evaluate(()=>window.dispatchEvent(new Event('beforeprint')));assert.deepEqual(await sizes('#printRoot'),sourceSizes);
   const sheets=await p.locator('#printRoot .sheet-print').count(),pdf=await p.pdf({preferCSSPageSize:true,printBackground:true});assert.equal(pdf.subarray(0,5).toString(),'%PDF-');assert(pdf.length>5000);assert.equal((pdf.toString('latin1').match(/\/Type\s*\/Page\b/g)||[]).length,sheets);
   if(process.env.QA_PDF&&extension==='pxp')fs.writeFileSync(process.env.QA_PDF,pdf);
   await upload('saved.pecha',saved);assert.deepEqual(await sizes('#table'),sourceSizes);
   if(process.env.QA_SCREENSHOT&&extension==='pxp')await p.screenshot({path:process.env.QA_SCREENSHOT,fullPage:true});
  }
  for(const [kind,message] of [['page','page images'],['missing','image reference']]){
   // Isolate rejection checks from the repeated download/print roundtrips above.
   const q=await browser.newPage();q.setDefaultTimeout(15000);q.on('pageerror',e=>errors.push(e.message));
   try{
    await q.goto(process.argv[2]);await q.locator('#pasteText').click();const bad=sample(E);if(kind==='page'){bad.images[0].kind='page';bad.text=bad.text.replaceAll('{image:line}','');}else bad.text='{image:missing}';
    await upload('unsupported.pecha',Buffer.from(JSON.stringify(bad)),q);const before=JSON.parse(await save(q));let downloads=0;q.on('download',()=>downloads++);
    await q.getByText('Reuse text, layouts and annotations',{exact:true}).click();
    for(const button of (kind==='page'?['#exportPxc']:['#exportPxp','#exportPxc'])){await q.locator(button).click();await q.waitForFunction(message=>document.querySelector('#exportMessages').textContent.includes(message),message);assert.equal(downloads,0);}
    assert.deepEqual(JSON.parse(await save(q)),before);
   }finally{await q.close();}
  }
  assert.deepEqual(errors,[]);console.log('PASS: PXP/PXC PNG downloads, resolution variants, repeated placements, yi-go, notes/counters/Tibetan, source preservation, preview/print/PDF geometry, Save/Open and no-download page/missing image rejection');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
