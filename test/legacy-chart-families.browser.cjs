const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');
global.PechaImages=require('../src/images');global.Folio=require('../src/folio');
const E=require('../src/engine'),C=require('../src/legacy-characters'),T=require('../src/legacy-table'),{cases}=require('./legacy-chart-families-fixture');
const visible=text=>E.parseStream(text,false).filter(r=>r.k==='text').map(r=>r.s).join('');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const p=await browser.newPage({viewport:{width:1440,height:1100}}),errors=[];p.setDefaultTimeout(15000);p.on('pageerror',e=>errors.push(e.message));await p.goto(process.argv[2]);await p.locator('#pasteText').click();
  const upload=async(name,buffer)=>{await p.locator('#toast').evaluate(n=>n.textContent='');await p.locator('#openFile').setInputFiles({name,mimeType:'application/octet-stream',buffer});await p.waitForFunction(()=>document.querySelector('#toast').textContent.length>0);};
  const base=E.defaultDoc();base.text='{font:serif 18 b #aa0000}AB';base.counts={title:0,fancy:0};base.yigo.enabled=false;base.dzog.enabled=false;base.folio.start=23;base.pageNum.start=401;
  await upload('base.pecha',Buffer.from(JSON.stringify(base)));const editor=p.locator('#text');await editor.evaluate(t=>{t.focus();const n=t.value.indexOf('AB');t.setSelectionRange(n,n+1);});await editor.press('Control+i');
  assert(await p.locator('#characterPicker').evaluate(n=>n.open));const source=p.locator('#characterSource');assert.deepEqual(await source.locator('option').evaluateAll(ns=>ns.map(n=>n.value)),['',...C.fontNames(T)]);
  for(const name of C.fontNames(T)){
   await source.selectOption(name);assert.equal(await p.locator('#characterGrid button').count(),224);assert(await p.locator('#characterGrid [data-byte="32"]').isEnabled());assert(await p.locator('#characterGrid').evaluate(n=>n.scrollWidth===n.clientWidth));
  }
  await source.selectOption('Ededris-a');assert(await p.locator('#characterGrid [data-byte="34"]').isDisabled());
  await source.selectOption('LMantra');assert(await p.locator('#characterGrid [data-byte="33"]').isDisabled());
  await source.selectOption('Ededris-vowa');assert(await p.locator('#characterGrid [data-byte="126"]').isDisabled());
  await p.locator('#characterFont').selectOption('noto');let expected='',previous='';
  for(const [name,byte,text] of cases){
   await source.selectOption(name);const cell=p.locator('#characterGrid [data-byte="'+byte+'"]');assert(await cell.isEnabled());assert((await cell.getAttribute('aria-label')).includes(name+' slot '+byte+' / 0x'));
   previous=await editor.inputValue();await cell.click();expected+=text;assert.equal(visible(await editor.inputValue()),expected+'B');
  }
  const final=await editor.inputValue();await editor.press('Meta+z');assert.equal(await editor.inputValue(),previous);await editor.press('Meta+Shift+z');assert.equal(await editor.inputValue(),final);
  const runs=E.parseStream(final,false).filter(r=>r.k==='text');assert.equal(runs.at(-1).style.font,'serif');assert(runs.slice(0,-1).every(r=>r.style.font==='noto'));assert(runs.every(r=>r.style.bold&&r.style.size===18&&r.style.color==='#aa0000'));
  await source.press('Escape');assert(!(await p.locator('#characterPicker').evaluate(n=>n.open)));assert(await editor.evaluate(n=>n===document.activeElement));
  const event=p.waitForEvent('download');await p.locator('#saveDoc').click();const saved=fs.readFileSync(await(await event).path());assert.equal(JSON.parse(saved).text,final);await upload('saved.pecha',saved);assert.equal(await editor.inputValue(),final);
  await p.getByText('Reuse text, layouts and annotations',{exact:true}).click();const exportEvent=p.waitForEvent('download');await p.locator('#exportRtf').click();await upload('exported.rtf',fs.readFileSync(await(await exportEvent).path()));assert.equal(visible(await editor.inputValue()),expected+'B');
  await p.evaluate(()=>window.dispatchEvent(new Event('beforeprint')));
  const glyphs=selector=>p.locator(selector+' text').evaluateAll(ns=>ns.filter(n=>n.getAttribute('fill')==='#aa0000').map(n=>[n.textContent,n.getAttribute('font-family'),n.getAttribute('font-size'),n.getAttribute('font-weight')]));
  assert.deepEqual(await glyphs('#printRoot'),await glyphs('#table'));assert((await p.locator('#printRoot').textContent()).includes('401'));
  const pdf=await p.pdf({preferCSSPageSize:true,printBackground:true});assert.equal(pdf.subarray(0,5).toString(),'%PDF-');if(process.env.QA_PDF)fs.writeFileSync(process.env.QA_PDF,pdf);
  await editor.focus();await editor.press('Meta+i');await source.selectOption('Ededris-a');await p.locator('#characterGrid [data-byte="33"]').scrollIntoViewIfNeeded();if(process.env.QA_SCREENSHOT)await p.screenshot({path:process.env.QA_SCREENSHOT,fullPage:true});
  assert.deepEqual(errors,[]);console.log('PASS: all91 browser chart names and 224slots, no horizontal clipping, excluded Ededris/ambiguous/non-Tibetan entries, 17family insertions/labels, formatting/restoration/undo, keyboard open/close, Save/RTF and preview/print/PDF');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
