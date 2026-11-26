const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');
global.PechaImages=require('../src/images');global.Folio=require('../src/folio');
const Engine=require('../src/engine'),Documents=require('../src/documents'),Rtf=require('../src/rtf'),TABLE=require('../src/legacy-table');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1100}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000);
  await page.goto(process.argv[2]||'http://127.0.0.1:52878/');await page.locator('#pasteText').click();
  const doc=Engine.defaultDoc();doc.counts={title:0,fancy:0};doc.yigo.enabled=false;doc.dzog.enabled=false;doc.folio.start=23;doc.pageNum.start=401;doc.text='{font:serif 18 b #aa0000}AB';
  const upload=async(name,buffer)=>{await page.locator('#openFile').setInputFiles({name,mimeType:'application/octet-stream',buffer});await page.waitForFunction(n=>document.querySelector('#toast').textContent==='Opened '+n+'.',name);};
  await upload('chart.pecha',Buffer.from(JSON.stringify(Documents.artifact(doc,'document'))));
  const editor=page.locator('#text');await editor.focus();await editor.evaluate((t,start)=>t.setSelectionRange(start,start+1),doc.text.indexOf('AB'));
  await editor.press('Control+i');assert(await page.locator('#characterPicker').evaluate(e=>e.open));assert.equal(await page.locator('#characterSource').evaluate(e=>e===document.activeElement),true);
  await page.locator('#characterSource').selectOption('TibetanMachine');await page.locator('#characterFont').selectOption('noto');
  assert.equal(await page.locator('#characterGrid button').count(),224);assert(await page.locator('#characterGrid').evaluate(e=>e.scrollWidth===e.clientWidth),'chart must not clip columns horizontally');assert(await page.locator('#characterGrid [data-byte="255"]').isDisabled());assert(await page.locator('#characterGrid [data-byte="166"]').isDisabled());
  assert((await page.locator('#characterGrid [data-byte="254"]').getAttribute('aria-label')).includes('254 / 0xFE'));
  await page.locator('#characterGrid [data-byte="254"]').click();
  const inserted=await editor.inputValue(),runs=Engine.parseStream(inserted,false).filter(r=>r.k==='text');assert.deepEqual(runs.map(r=>r.s),['སྐྱ','B']);assert.equal(runs[0].style.font,'noto');assert.equal(runs[1].style.font,'serif');assert(runs.every(r=>r.style.bold&&r.style.color==='#aa0000'&&r.style.size===18));
  await editor.press('Meta+z');assert.equal(await editor.inputValue(),doc.text);await editor.press('Meta+Shift+z');assert.equal(await editor.inputValue(),inserted);
  // Explicit palette choice also works with locked typing and Typeover enabled.
  await page.locator('#lockedKeyboard').check();await page.locator('#typeover').check();
  await page.locator('#characterSource').selectOption('TibetanMachineSkt1');assert(await page.locator('#characterGrid [data-byte="45"]').isDisabled());
  await page.locator('#characterGrid [data-byte="33"]').click();
  assert.equal(Engine.parseStream(await editor.inputValue(),false).filter(r=>r.k==='text').map(r=>r.s).join(''),'སྐྱཀྐB');
  await editor.press('Escape');assert(!(await page.locator('#characterPicker').evaluate(e=>e.open)));assert.equal(await editor.evaluate(e=>e===document.activeElement),true);
  await editor.press('Meta+i');assert(await page.locator('#characterPicker').evaluate(e=>e.open));
  await page.locator('#characterSource').selectOption('TibetanMachineSkt4');assert(await page.locator('#characterGrid [data-byte="249"]').isDisabled());
  await page.locator('#characterSource').selectOption('');await page.locator('#characterGroup').selectOption('marks');await page.locator('#characterFont').selectOption('');
  const vowel=page.locator('#characterGrid button').filter({hasText:'ཀི'}).first();await vowel.click();
  const finalText=await editor.inputValue(),plain=Engine.parseStream(finalText,false).filter(r=>r.k==='text').map(r=>r.s).join('');assert.equal(plain,'སྐྱཀྐིB','display base is not inserted');
  await page.waitForFunction(()=>document.querySelector('#table').textContent.includes('སྐྱ'));
  const save=page.waitForEvent('download');await page.locator('#saveDoc').click();const saved=fs.readFileSync(await(await save).path());assert.equal(JSON.parse(saved).text,finalText);
  await upload('saved.pecha',saved);assert.equal(await editor.inputValue(),finalText);
  await page.getByText('Reuse text, layouts and annotations',{exact:true}).click();const exp=page.waitForEvent('download');await page.locator('#exportRtf').click();
  const rtf=Rtf.read(fs.readFileSync(await(await exp).path()),Engine,TABLE).doc;assert.equal(Engine.parseStream(rtf.text,false).filter(r=>r.k==='text').map(r=>r.s).join(''),plain);
  await page.evaluate(()=>window.dispatchEvent(new Event('beforeprint')));assert((await page.locator('#printRoot').textContent()).includes('སྐྱ'));assert((await page.locator('#printRoot').textContent()).includes('401'));
  const glyphs=sel=>page.locator(sel+' text').evaluateAll(nodes=>nodes.filter(n=>n.textContent.includes('སྐྱ')).map(n=>[n.textContent,n.getAttribute('font-family'),n.getAttribute('font-size'),n.getAttribute('fill')]));assert.deepEqual(await glyphs('#table'),await glyphs('#printRoot'));
  const pdf=await page.pdf({preferCSSPageSize:true,printBackground:true});assert.equal(pdf.subarray(0,5).toString(),'%PDF-');if(process.env.QA_PDF)fs.writeFileSync(process.env.QA_PDF,pdf);
  await page.locator('#characterSource').selectOption('TibetanMachine');await page.locator('#characterGrid [data-byte="33"]').scrollIntoViewIfNeeded();
  if(process.env.QA_SCREENSHOT)await page.screenshot({path:process.env.QA_SCREENSHOT,fullPage:true});
  assert.deepEqual(errors,[]);console.log('PASS: legacy charts/slot labels/exclusions, Ctrl+I and Escape, selected stack insertion/style restoration, undo/redo, locked/Typeover independence, Unicode combining insertion, Save/RTF, folios/print/PDF, no JS errors');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
