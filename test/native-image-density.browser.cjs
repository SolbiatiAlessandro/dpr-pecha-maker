const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright'),fixture=require('./image-dpi-fixture');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const p=await browser.newPage({viewport:{width:1440,height:1050}}),errors=[];p.setDefaultTimeout(15000);p.on('pageerror',e=>errors.push(e.message));await p.goto(process.argv[2]);await p.locator('#pasteText').click();
  const upload=async(name,buffer)=>{await p.locator('#toast').evaluate(el=>el.textContent='');await p.locator('#openFile').setInputFiles({name,mimeType:'application/octet-stream',buffer});await p.waitForFunction(()=>document.querySelector('#toast').textContent.length>0);};
  const save=async()=>{const event=p.waitForEvent('download');await p.locator('#saveDoc').click();return fs.readFileSync(await(await event).path());};
  const sizes=selector=>p.locator(selector+' image').evaluateAll(ns=>ns.map(n=>[+n.getAttribute('width'),+n.getAttribute('height'),n.getAttribute('preserveAspectRatio')]));
  for(const old of [false,true])for(const extension of ['pxp','pxc'])for(const [name,image,x,y,warning] of [
   ['conflict',fixture.png(96,48),96,48,'overrides'],
   ['missing',fixture.png(300,600,{omitDensity:true}),72,72,'72 DPI'],
   ['relative',fixture.png(300,600,{unit:0}),72,72,'72 DPI'],
   ['zero',fixture.png(96,0),96,96,'both axes'],
   ['fractional',fixture.png(300,150),299,150,'overrides']
  ]){
   await upload(name+'.'+extension,fixture.native(300,600,old,image));
   assert((await p.locator('#importMessages').textContent()).includes(warning));
   await p.locator('#text').fill('ཀ་ {image:native-inline-0} after{page}ཁ་');
   const count=old?2:3,w=96*72/x,h=48*72/y;
   await p.waitForFunction(({count,w,h})=>{const ns=[...document.querySelectorAll('#table image')];return ns.length===count&&ns.every(n=>Math.abs(+n.getAttribute('width')-w)<.01&&Math.abs(+n.getAttribute('height')-h)<.01);},{count,w,h});
   const preview=await sizes('#table');assert(preview.every(a=>a[2]==='none'));
   await p.evaluate(()=>window.dispatchEvent(new Event('beforeprint')));assert.deepEqual(await sizes('#printRoot'),preview);
   const saved=await save(),doc=JSON.parse(saved);assert(doc.images.every(im=>im.dpi===x&&(im.dpiY??im.dpi)===y));assert.equal(doc.assets[0].data,'data:image/png;base64,'+image.toString('base64'));
   await upload('saved.pecha',saved);assert.deepEqual(await sizes('#table'),preview);
  }
  // Keep an illustrative mismatch visible and verify actual PNG download and PDF output.
  const image=fixture.png(96,48);await upload('conflicting-table.pxp',fixture.native(300,600,false,image));
  await p.locator('#text').fill('ཀ་ {image:native-inline-0} after{page}ཁ་');await p.waitForFunction(()=>document.querySelectorAll('#table image').length===3);
  await p.getByText('Images',{exact:true}).click();assert.equal(await p.locator('#f_images_0_dpi').inputValue(),'96');assert.equal(await p.locator('#f_images_0_dpiY').inputValue(),'48');
  const event=p.waitForEvent('download');await p.locator('#exportImage').click();assert.deepEqual(fs.readFileSync(await(await event).path()),image);
  await p.locator('#f_images_0_ignoreDpi').check();await p.waitForFunction(()=>+document.querySelector('#table image[data-image-id="native-inline-0"]').getAttribute('height')===36);
  await p.locator('#f_images_0_ignoreDpi').uncheck();await p.waitForFunction(()=>+document.querySelector('#table image[data-image-id="native-inline-0"]').getAttribute('height')===72);
  await p.evaluate(()=>window.dispatchEvent(new Event('beforeprint')));assert.deepEqual(await sizes('#printRoot'),await sizes('#table'));
  const sheets=await p.locator('#printRoot .sheet-print').count();const pdf=await p.pdf({preferCSSPageSize:true,printBackground:true});assert.equal(pdf.subarray(0,5).toString(),'%PDF-');assert(pdf.length>5000);assert.equal((pdf.toString('latin1').match(/\/Type\s*\/Page\b/g)||[]).length,sheets);
  if(process.env.QA_PDF)fs.writeFileSync(process.env.QA_PDF,pdf);
  if(process.env.QA_SCREENSHOT)await p.screenshot({path:process.env.QA_SCREENSHOT,fullPage:true});
  assert.deepEqual(errors,[]);console.log('PASS: PXP/PXC image versions1.0/1.1, PNG/table conflicts, absent/relative/zero/fractional density, inline/page/yi-go geometry, preview/print/PDF, Save/Open, original PNG download and Ignore DPI');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
