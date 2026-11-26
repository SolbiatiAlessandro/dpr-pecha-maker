const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');
global.PechaImages=require('../src/images');global.Folio=require('../src/folio');
const E=require('../src/engine'),{sample,picture}=require('./rtf-image-scale-fixture'),{png}=require('./image-dpi-fixture');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const p=await browser.newPage({viewport:{width:1440,height:1050}}),errors=[];p.setDefaultTimeout(15000);p.on('pageerror',e=>errors.push(e.message));
  await p.goto(process.argv[2]);await p.locator('#pasteText').click();
  const upload=async(name,buffer)=>{await p.locator('#toast').evaluate(n=>n.textContent='');await p.locator('#openFile').setInputFiles({name,mimeType:'application/octet-stream',buffer});await p.waitForFunction(()=>document.querySelector('#toast').textContent.length>0);};
  const save=async()=>{const event=p.waitForEvent('download');await p.locator('#saveDoc').click();return fs.readFileSync(await(await event).path());};
  const geometry=(selector='#table')=>p.locator(selector+' image').evaluateAll(ns=>ns.map(n=>['x','y','width','height'].map(k=>+n.getAttribute(k))));
  const dimensions=doc=>doc.images.map(i=>{const s=PechaImages.dimensions(doc,i);return [s.w,s.h];});
  const expected=[[36,72],[108,36],[72,18]],base=E.defaultDoc();base.text='OLD';base.counts={title:0,fancy:0};base.yigo.enabled=false;base.dzog.enabled=false;
  base.folio.start=23;base.pageNum.start=401;
  await upload('base.pecha',Buffer.from(JSON.stringify(base)));await upload('independent-scales.rtf',Buffer.from(sample()));
  await p.waitForFunction(()=>document.querySelectorAll('#table image').length===3);
  const original=await geometry();assert.deepEqual(original.map(g=>g.slice(2)),expected);
  // Compare right edges and centers, since each paragraph has a different width.
  assert(original[2][0]<original[0][0]);assert(original[0][0]+18<original[1][0]+108);
  assert(!(await p.locator('#importMessages').textContent()).includes('Nonuniform'));
  const saved=await save(),doc=JSON.parse(saved);assert.deepEqual(dimensions(doc),expected);assert.equal(doc.assets.length,1);
  assert.deepEqual(Buffer.from(doc.assets[0].data.split(',')[1],'base64'),png(96,96));
  await upload('saved.pecha',saved);assert.deepEqual(await geometry(),original);
  await p.getByText('Reuse text, layouts and annotations',{exact:true}).click();const event=p.waitForEvent('download');await p.locator('#exportRtf').click();const exported=fs.readFileSync(await(await event).path());
  await upload('roundtrip.rtf',exported);assert.deepEqual(await geometry(),original);
  await p.evaluate(()=>window.dispatchEvent(new Event('beforeprint')));assert.deepEqual(await geometry('#printRoot'),original);
  const tibetan=selector=>p.locator(selector+' text').evaluateAll(ns=>ns.map(n=>n.textContent).filter(s=>/[\u0f00-\u0fff]/.test(s)).sort());
  assert.deepEqual(await tibetan('#printRoot'),await tibetan('#table'));assert((await tibetan('#table')).some(s=>s.includes('ཀ')));
  assert((await p.locator('#table').textContent()).includes('401'));assert((await p.locator('#printRoot').textContent()).includes('401'));
  const pdf=await p.pdf({preferCSSPageSize:true,printBackground:true});assert.equal(pdf.subarray(0,5).toString(),'%PDF-');
  assert.equal((pdf.toString('latin1').match(/\/Type\s*\/Page\b/g)||[]).length,await p.locator('#printRoot .sheet-print').count());
  if(process.env.QA_PDF)fs.writeFileSync(process.env.QA_PDF,pdf);if(process.env.QA_SCREENSHOT)await p.screenshot({path:process.env.QA_SCREENSHOT,fullPage:true});
  await upload('base.pecha',Buffer.from(JSON.stringify(base)));
  const paste=rtf=>p.locator('#text').evaluate((t,rtf)=>{t.focus();t.setSelectionRange(0,t.value.length);const clipboardData=new DataTransfer();clipboardData.setData('text/rtf',rtf);t.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData}));},rtf);
  await paste(sample());await p.waitForFunction(()=>document.querySelectorAll('#table image').length===3);assert.deepEqual((await geometry()).map(g=>g.slice(2)),expected);
  await p.locator('#text').focus();await p.keyboard.press('Meta+z');assert.equal(await p.locator('#text').inputValue(),'OLD');await p.keyboard.press('Meta+Shift+z');
  await p.waitForFunction(()=>document.querySelectorAll('#table image').length===3);assert.deepEqual(dimensions(JSON.parse(await save())),expected);
  await upload('invalid-scale.rtf',Buffer.from('{\\rtf1 '+picture('\\picwgoal1440\\pichgoal720\\picscalex0\\picscaley-2')+'}'));
  assert((await p.locator('#importMessages').textContent()).includes('invalid RTF image scale'));assert.deepEqual((await geometry()).map(g=>g.slice(2)),[[72,36]]);
  assert.deepEqual(errors,[]);console.log('PASS: independent RTF scale axes and defaults, actual upload/Save/RTF, original PNG bytes, alignment, preview/print/PDF/Tibetan text, paste undo/redo and invalid-scale notice');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
