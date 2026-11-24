const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');
global.PechaImages=require('../src/images');global.Folio=require('../src/folio');
const E=require('../src/engine');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
  const p=await browser.newPage({viewport:{width:1440,height:1050}}),errors=[];p.setDefaultTimeout(15000);p.on('pageerror',e=>errors.push(e.message));
  await p.goto(process.argv[2]);await p.locator('#pasteText').click();
  const upload=(name,buffer)=>p.locator('#openFile').setInputFiles({name,mimeType:'application/octet-stream',buffer});
  const base=E.defaultDoc();base.counts={title:0,fancy:0};base.yigo.enabled=false;base.text='{font:family:Verdana b 24 #b03020}Red{font:serif /b 16}End Tail';
  await upload('mixed.pecha',Buffer.from(JSON.stringify(base)));await p.waitForFunction(()=>document.querySelector('#text').value.includes('Red'));
  await p.locator('#selectionFormatting summary').click();assert.equal(await p.locator('#selectionFont option[value="jomolhari"]').count(),1);assert.equal(await p.locator('#selectionFont option[value="family:Verdana"]').textContent(),'Verdana');assert(await p.locator('#selectionFontName').isHidden());
  const select=word=>p.locator('#text').evaluate((t,word)=>{t.focus();const start=t.value.indexOf(word);t.setSelectionRange(start,start+word.length);},word);
  const runs=()=>p.locator('#text').inputValue().then(s=>E.parseStream(s,false).filter(r=>r.k==='text'));
  await select('Red');await p.locator('#selectionFont').selectOption('family:Courier%20New');await p.locator('#applySelection').click();
  let r=await runs();assert.equal(r[0].style.font,'family:Courier%20New');assert.equal(r[0].style.bold,true);assert.equal(r[0].style.size,24);assert.equal(r[0].style.color,'#b03020');assert.equal(r.at(-1).style.font,'serif');
  await p.waitForFunction(()=>Array.from(document.querySelectorAll('#table text')).some(n=>n.textContent==='Red'&&n.getAttribute('font-family').includes('Courier New')));
  const attrs=selector=>p.locator(selector+' text').evaluateAll(ns=>ns.filter(n=>n.textContent==='Red').map(n=>[n.getAttribute('font-family'),n.getAttribute('font-size'),n.getAttribute('font-weight'),n.getAttribute('fill')]));
  await p.evaluate(()=>window.dispatchEvent(new Event('beforeprint')));assert.deepEqual(await attrs('#printRoot'),await attrs('#table'));
  await select('End');await p.locator('#selectionFont').selectOption('custom');assert(await p.locator('#selectionFontName').isVisible());
  const before=await p.locator('#text').inputValue();await p.locator('#selectionFontName').fill('bad;font');await p.locator('#applySelection').click();assert.equal(await p.locator('#text').inputValue(),before);assert((await p.locator('#toast').textContent()).includes('Enter a font name'));
  await p.locator('#selectionFontName').fill('Trebuchet MS');await p.locator('#applySelection').click();r=await runs();assert.equal(r.find(x=>x.s==='End').style.font,'family:Trebuchet%20MS');assert.equal(r.at(-1).style.font,'serif');assert.equal(await p.locator('#selectionFont option[value="family:Trebuchet%20MS"]').count(),1);
  const saving=p.waitForEvent('download');await p.locator('#saveDoc').click();const saved=fs.readFileSync(await(await saving).path());await upload('saved.pecha',saved);await p.waitForFunction(()=>document.querySelector('#toast').textContent==='Opened saved.pecha.');assert.equal(await p.locator('#selectionFont option[value="family:Trebuchet%20MS"]').count(),1);
  await p.locator('#selectionFont').selectOption('');await p.locator('#selectionSize').fill('30');await p.locator('#text').evaluate(t=>{t.focus();t.select();});await p.locator('#applySelection').click();r=await runs();assert(r.every(x=>x.style.size===30));assert.equal(r.find(x=>x.s==='Red').style.font,'family:Courier%20New');assert.equal(r.find(x=>x.s==='End').style.font,'family:Trebuchet%20MS');
  if(process.env.QA_SCREENSHOT){await p.locator('#selectionFont').selectOption('custom');await p.locator('#selectionFontName').fill('Trebuchet MS');await p.screenshot({path:process.env.QA_SCREENSHOT,fullPage:true});}
  await p.getByText('Reuse text, layouts and annotations',{exact:true}).click();const exporting=p.waitForEvent('download');await p.locator('#exportRtf').click();const rtf=fs.readFileSync(await(await exporting).path());assert(rtf.toString().includes('Courier New'));assert(rtf.toString().includes('Trebuchet MS'));
  await upload('font-roundtrip.rtf',rtf);await p.waitForFunction(()=>document.querySelector('#text').value.includes('Trebuchet%20MS'));assert.equal(await p.locator('#selectionFont option[value="family:Trebuchet%20MS"]').count(),1);
  await p.locator('#selectionSize').fill('');await p.locator('#selectionFont').selectOption('jomolhari');await p.locator('#text').evaluate(t=>{t.focus();t.setSelectionRange(t.value.length,t.value.length);});await p.locator('#applySelection').click();assert((await p.locator('#text').inputValue()).endsWith('{font:jomolhari}'));
  assert.deepEqual(errors,[]);console.log('PASS: named-font choices, imported families, custom-name validation, selected attribute preservation/restoration, size-only edits, preview/print, Save/Open, RTF and caret insertion');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
