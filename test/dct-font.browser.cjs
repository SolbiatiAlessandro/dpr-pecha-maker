const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');
global.PechaImages=require('../src/images');global.Folio=require('../src/folio');
const E=require('../src/engine'),{wrap}=require('./dct-alignment-fixture');
const fixture=wrap([65,21,97,17,33,66,21,115],'Ansi');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
  const p=await browser.newPage({viewport:{width:1440,height:1100}}),errors=[];p.setDefaultTimeout(15000);p.on('pageerror',e=>errors.push(e.message));
  const url=process.argv[2];await p.goto(url);await p.locator('#pasteText').click();
  const upload=async(name,buffer)=>{await p.locator('#openFile').setInputFiles({name,mimeType:'application/octet-stream',buffer});if(name.endsWith('.dct'))await p.locator('#dctDialog').waitFor({state:'visible'});};
  const base=E.defaultDoc();base.text='Keep me';base.counts={title:0,fancy:0};base.yigo.enabled=false;
  await upload('base.pecha',Buffer.from(JSON.stringify(base)));await p.waitForFunction(()=>document.querySelector('#text').value==='Keep me');
  await upload('fonts.dct',fixture);assert.equal(await p.locator('#dctLatinFont').inputValue(),'family:Times%20New%20Roman');
  await p.locator('#dctLatinFont').selectOption('custom');await p.locator('#dctImport').click();assert(await p.locator('#dctDialog').evaluate(e=>e.open));assert.equal(await p.locator('#text').inputValue(),'Keep me');
  await p.locator('#dctLatinFontName').fill('Courier New');await p.locator('#dctLatinSize').fill('22');
  await p.locator('#dctDiacriticOptions summary').click();await p.locator('#dctDiacriticFont').selectOption('custom');await p.locator('#dctDiacriticFontName').fill('bad;font');await p.locator('#dctDiacriticOptions summary').click();await p.locator('#dctImport').click();assert(await p.locator('#dctDiacriticOptions').evaluate(e=>e.open));assert.equal(await p.locator('#text').inputValue(),'Keep me');
  await p.locator('#dctDiacriticFontName').fill('Trebuchet MS');await p.locator('#dctDiacriticSize').fill('26');
  const buttonBox=await p.locator('#dctImport').boundingBox();assert(buttonBox.y>=0&&buttonBox.y+buttonBox.height<=1100,'Import stays visible with both custom fields expanded');
  if(process.env.QA_SCREENSHOT)await p.screenshot({path:process.env.QA_SCREENSHOT,fullPage:true});
  await p.locator('#dctImport').click();await p.waitForFunction(()=>document.querySelector('#text').value.includes('Trebuchet%20MS'));
  const text=await p.locator('#text').inputValue(),runs=E.parseStream(text,false).filter(r=>r.k==='text');assert.deepEqual(runs.map(r=>[r.s,r.style.font]),[['A','family:Courier%20New'],['ā','family:Trebuchet%20MS'],['ཀ','jomolhari'],['B','family:Courier%20New'],['ś','family:Trebuchet%20MS']]);
  await p.waitForFunction(()=>Array.from(document.querySelectorAll('#table text')).some(n=>n.textContent==='ā'));
  const styles=selector=>p.locator(selector+' text').evaluateAll(ns=>ns.filter(n=>['A','ā','ཀ','B','ś'].includes(n.textContent)).map(n=>[n.textContent,n.getAttribute('font-family'),n.getAttribute('font-size')]));
  const preview=await styles('#table');assert(preview.some(([s,f,z])=>s==='A'&&f.includes('Courier New')&&z==='22'));assert(preview.some(([s,f,z])=>s==='ā'&&f.includes('Trebuchet MS')&&z==='26'));await p.evaluate(()=>window.dispatchEvent(new Event('beforeprint')));assert.deepEqual(await styles('#printRoot'),preview);
  const savedPrefs=await p.evaluate(()=>localStorage.getItem('dpr-pecha-maker-dct-import'));
  const saving=p.waitForEvent('download');await p.locator('#saveDoc').click();const saved=fs.readFileSync(await(await saving).path());await upload('saved.pecha',saved);await p.waitForFunction(()=>document.querySelector('#toast').textContent==='Opened saved.pecha.');assert.equal(await p.locator('#text').inputValue(),text);
  await upload('cancel.dct',fixture);assert.equal(await p.locator('#dctDiacriticFont').inputValue(),'family:Trebuchet%20MS');await p.locator('#dctLatinFont').selectOption('serif');await p.locator('#dctCancel').click();assert.equal(await p.locator('#text').inputValue(),text);assert.equal(await p.evaluate(()=>localStorage.getItem('dpr-pecha-maker-dct-import')),savedPrefs);
  await upload('bad.dct',Buffer.from('not a DCT'));await p.locator('#dctLatinFont').selectOption('serif');await p.locator('#dctImport').click();await p.waitForFunction(()=>document.querySelector('#toast').textContent.startsWith('Could not read bad.dct:'));assert.equal(await p.locator('#text').inputValue(),text);assert.equal(await p.evaluate(()=>localStorage.getItem('dpr-pecha-maker-dct-import')),savedPrefs);
  await p.reload();await p.locator('#pasteText').click();await upload('remembered.dct',fixture);assert.equal(await p.locator('#dctLatinFont').inputValue(),'family:Courier%20New');assert.equal(await p.locator('#dctDiacriticFont').inputValue(),'family:Trebuchet%20MS');await p.keyboard.press('Escape');
  // Old saved substitute choices remain explicit choices rather than being overwritten by new defaults.
  await p.evaluate(()=>localStorage.setItem('dpr-pecha-maker-dct-import',JSON.stringify({latinFont:'serif',tibetanSize:28,latinSize:18})));await p.reload();await p.locator('#pasteText').click();await upload('old-preferences.dct',fixture);assert.equal(await p.locator('#dctLatinFont').inputValue(),'serif');await p.locator('#dctCancel').click();
  assert.deepEqual(errors,[]);console.log('PASS: DCT named font dialog, native Latin default, independent faces/sizes, hidden validation, preview/print, Save/Open, cancel/failure retention and preference reload/migration');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
