const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');
global.PechaImages=require('../src/images');global.Folio=require('../src/folio');
const Engine=require('../src/engine'),{sample}=require('./native-style-fixture');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
  page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.argv[2]||'http://127.0.0.1:50886/');await page.locator('#pasteText').click();
  const upload=(name,buffer)=>page.locator('#openFile').setInputFiles({name,mimeType:'application/octet-stream',buffer});
  const base=Engine.defaultDoc();base.text='Old';base.counts={title:0,fancy:0};base.types.body.color='#3456ab';base.types.body.baseline=.5;base.dzog.enabled=false;base.yigo.enabled=false;
  await upload('blue-base.pecha',Buffer.from(JSON.stringify(base)));await page.waitForFunction(()=>document.querySelector('#text').value==='Old');
  await upload('styles.pxp',sample());
  await page.waitForFunction(()=>document.querySelector('#text').value.includes('{s}'));
  const imported=await page.locator('#text').inputValue();assert(imported.includes('{/s}'));assert(imported.includes('{#000000}'));
  await page.waitForFunction(()=>Array.from(document.querySelectorAll('#table text')).filter(n=>n.textContent.trim()==='Marked').length===2);
  const styles=selector=>page.locator(selector+' text').evaluateAll(ns=>ns.filter(n=>['Marked','Black','Plain'].includes(n.textContent.trim())).map(n=>[n.textContent.trim(),n.getAttribute('fill'),n.getAttribute('font-weight'),n.getAttribute('font-style'),n.getAttribute('text-decoration')]));
  const expected=[['Marked','#b03020','700','italic','underline line-through'],['Black','#000000','700','italic','underline'],['Plain','#000000',null,null,null]];
  const preview=await styles('#table');assert.equal(preview.length,6);
  for(const row of preview)assert.deepEqual(row,expected.find(e=>e[0]===row[0]));
  await page.evaluate(()=>window.dispatchEvent(new Event('beforeprint')));
  assert.deepEqual(await styles('#printRoot'),preview);
  const saving=page.waitForEvent('download');await page.locator('#saveDoc').click();
  const saved=fs.readFileSync(await(await saving).path());assert.equal(JSON.parse(saved).types.body.color,'#3456ab');assert.equal(JSON.parse(saved).text,imported);
  await upload('saved.pecha',saved);await page.waitForFunction(()=>document.querySelector('#toast').textContent==='Opened saved.pecha.');
  assert.equal(await page.locator('#text').inputValue(),imported);
  await upload('styles.pxa',sample('pxa'));await page.waitForFunction(()=>document.querySelector('#importMessages').textContent.includes('annotation-file'));
  assert.equal(await page.locator('#text').inputValue(),imported);
  assert.deepEqual(await styles('#table'),preview);
  if(process.env.QA_SCREENSHOT)await page.screenshot({path:process.env.QA_SCREENSHOT,fullPage:true});
  await page.getByText('Reuse text, layouts and annotations',{exact:true}).click();
  const downloading=page.waitForEvent('download');await page.locator('#exportRtf').click();
  const data=fs.readFileSync(await(await downloading).path()),text=data.toString();assert(text.includes('\\strike1'));assert(text.includes('\\strike0'));assert(text.includes('\\red0\\green0\\blue0'));
  await upload('roundtrip.rtf',data);await page.waitForFunction(()=>document.querySelector('#text').value.includes('font:'));
  // RTF changes the substituted family, but all tested text attributes survive.
  await page.waitForFunction(()=>document.querySelector('#text').value.includes('{/role'));
  assert.deepEqual(await styles('#table'),preview);
  assert.deepEqual(errors,[]);console.log('PASS: native strike/black upload, mixed attributes in body and annotations, custom default color, identical preview/print styles, Save/Open, PXA scope and RTF roundtrip');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
