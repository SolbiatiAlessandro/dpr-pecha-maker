const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');
global.PechaImages=require('../src/images');global.Folio=require('../src/folio');
const Engine=require('../src/engine'),{sample}=require('./native-font-fixture');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
  page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.argv[2]||'http://127.0.0.1:51525/');await page.locator('#pasteText').click();
  const upload=(name,buffer)=>page.locator('#openFile').setInputFiles({name,mimeType:'application/octet-stream',buffer});
  const base=Engine.defaultDoc();base.text='Old';base.counts={title:0,fancy:0};base.types.body.baseline=.5;base.dzog.enabled=false;base.yigo.enabled=false;
  await upload('base.pecha',Buffer.from(JSON.stringify(base)));await page.waitForFunction(()=>document.querySelector('#text').value==='Old');
  await upload('fonts.pxp',sample());
  await page.waitForFunction(()=>document.querySelector('#text').value.includes('family:Courier%20New'));
  await page.waitForFunction(()=>Array.from(document.querySelectorAll('#table text')).filter(n=>n.textContent.trim()==='Mono').length===2);
  await page.evaluate(()=>document.fonts.ready);
  const imported=await page.locator('#text').inputValue();
  assert((await page.locator('#importMessages').textContent()).includes('Unavailable fonts'));
  const styles=selector=>page.locator(selector+' text').evaluateAll(ns=>ns.filter(n=>['Arial','Mono','A','W','B','ཀཀྐཀ','C','ཀ','D'].includes(n.textContent.trim())).map(n=>[n.textContent.trim(),n.getAttribute('font-family'),+n.getAttribute('font-size')]));
  const preview=await styles('#table');assert.equal(preview.length,18);
  for(const [index,[text,family,size]] of preview.entries()){
   assert(family.includes(['Mono','W'].includes(text)?'Courier New':text.includes('ཀ')?'Jomolhari':'Arial'));
   assert.equal(size,index>=9?13.5:text.includes('ཀ')?21:28);
  }
  await page.evaluate(()=>window.dispatchEvent(new Event('beforeprint')));assert.deepEqual(await styles('#printRoot'),preview);
  if(process.env.QA_PDF)await page.pdf({path:process.env.QA_PDF,preferCSSPageSize:true,printBackground:true});
  const saving=page.waitForEvent('download');await page.locator('#saveDoc').click();
  const saved=fs.readFileSync(await(await saving).path());assert.equal(JSON.parse(saved).text,imported);
  await upload('saved.pecha',saved);await page.waitForFunction(()=>document.querySelector('#toast').textContent==='Opened saved.pecha.');
  assert.equal(await page.locator('#text').inputValue(),imported);
  await upload('fonts.pxa',sample('pxa'));await page.waitForFunction(()=>document.querySelector('#importMessages').textContent.includes('annotation-file'));
  assert.equal(await page.locator('#text').inputValue(),imported);assert.deepEqual(await styles('#table'),preview);
  if(process.env.QA_SCREENSHOT)await page.screenshot({path:process.env.QA_SCREENSHOT,fullPage:true});
  await page.getByText('Reuse text, layouts and annotations',{exact:true}).click();
  const downloading=page.waitForEvent('download');await page.locator('#exportRtf').click();
  const rtf=fs.readFileSync(await(await downloading).path());assert(rtf.toString().includes('Arial;'));assert(rtf.toString().includes('Courier New;'));
  await upload('roundtrip.rtf',rtf);await page.waitForFunction(()=>document.querySelector('#text').value.includes('{/role'));
  await page.waitForFunction(()=>Array.from(document.querySelectorAll('#table text')).some(n=>n.textContent==='Mono'));
  assert.deepEqual(await styles('#table'),preview);
  // Size-only selection keeps every imported family, including the temporary glyph font.
  await page.getByText('Format selected text',{exact:true}).click();await page.locator('#selectionSize').fill('32');
  await page.locator('#text').evaluate(n=>{n.focus();n.setSelectionRange(0,n.value.length);});await page.locator('#applySelection').click();
  await page.waitForFunction(()=>Array.from(document.querySelectorAll('#table text')).some(n=>n.textContent==='Mono'&&n.getAttribute('font-size')==='32'));
  const after=await styles('#table');assert.deepEqual(after.map(r=>r.slice(0,2)),preview.map(r=>r.slice(0,2)));
  // First nine rows are body; annotations keep their original sizes.
  assert.deepEqual(after.map(r=>r[2]).sort((a,b)=>a-b),[...preview.slice(0,9).map(()=>32),...preview.slice(9).map(r=>r[2])].sort((a,b)=>a-b));
  assert.deepEqual(errors,[]);console.log('PASS: native named families, one-glyph font/size scope and Tibetan stacks; browser preview/print, Save/Open, PXA, RTF roundtrip and size-only selection');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
