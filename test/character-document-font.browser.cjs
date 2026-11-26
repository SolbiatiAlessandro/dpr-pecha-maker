const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');
global.PechaImages=require('../src/images');global.Folio=require('../src/folio');
const E=require('../src/engine'),D=require('../src/documents');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const p=await browser.newPage({viewport:{width:1440,height:1100}}),errors=[];p.setDefaultTimeout(15000);p.on('pageerror',e=>errors.push(e.message));await p.goto(process.argv[2]);await p.locator('#pasteText').click();
  const upload=async(name,buffer)=>{await p.locator('#toast').evaluate(n=>n.textContent='');await p.locator('#openFile').setInputFiles({name,mimeType:'application/octet-stream',buffer});await p.waitForFunction(()=>document.querySelector('#toast').textContent.length>0);};
  const base=E.defaultDoc();base.counts={title:0,fancy:0};base.yigo.enabled=false;base.dzog.enabled=false;base.folio.start=23;base.pageNum.start=401;base.text='{font:family:Verdana 18 b #aa0000}AB';base.notes.sets['body.front'].inL={on:false,rich:true,text:'{font:family:Arial}N',size:13,inset:.1};base.yigo.rich=true;base.yigo.text='{font:family:Courier%20New}Y';
  await upload('fonts.pecha',Buffer.from(JSON.stringify(base)));
  const editor=p.locator('#text'),font=p.locator('#characterFont'),names=()=>font.locator('option').evaluateAll(ns=>ns.map(n=>n.textContent));
  for(const name of ['Verdana','Arial','Courier New','Georgia'])assert((await names()).includes(name));
  await editor.evaluate(t=>{t.focus();const n=t.value.indexOf('AB');t.setSelectionRange(n,n+1);});await editor.press('Control+i');assert((await p.locator('#characterGrid').evaluate(n=>n.style.fontFamily)).includes('Verdana'));
  // Removed fonts remain available during this editing session and partial layout imports.
  await editor.fill('KEEP');assert((await names()).includes('Verdana'));
  await upload('layout.pecha',Buffer.from(JSON.stringify(D.artifact(E.defaultDoc(),'template'))));assert((await names()).includes('Verdana'));
  await upload('fresh.pecha',Buffer.from(JSON.stringify(E.defaultDoc())));assert(!(await names()).includes('Verdana'));assert.equal(await font.inputValue(),'');
  await upload('fonts-again.pecha',Buffer.from(JSON.stringify(base)));await editor.evaluate(t=>{t.focus();const n=t.value.indexOf('AB');t.setSelectionRange(n,n+1);});await editor.press('Control+i');
  await p.locator('#characterSource').selectOption('TibetanMachine');await font.selectOption('family:Arial');assert((await p.locator('#characterGrid').evaluate(n=>n.style.fontFamily)).includes('Arial'));
  await p.locator('#characterGrid [data-byte="33"]').click();const inserted=await editor.inputValue(),runs=E.parseStream(inserted,false).filter(r=>r.k==='text');assert.deepEqual(runs.map(r=>r.s),['ཀ','B']);assert.equal(runs[0].style.font,'family:Arial');assert.equal(runs[1].style.font,'family:Verdana');assert(runs.every(r=>r.style.bold&&r.style.size===18&&r.style.color==='#aa0000'));
  await editor.press('Meta+z');assert.equal(await editor.inputValue(),base.text);await editor.press('Meta+Shift+z');assert.equal(await editor.inputValue(),inserted);
  await font.selectOption('');await editor.evaluate(t=>{t.focus();const n=t.value.indexOf('B');t.setSelectionRange(n,n);});assert((await p.locator('#characterGrid').evaluate(n=>n.style.fontFamily)).includes('Verdana'));
  const save=p.waitForEvent('download');await p.locator('#saveDoc').click();const saved=fs.readFileSync(await(await save).path());await upload('saved.pecha',saved);assert.equal(await editor.inputValue(),inserted);assert((await names()).includes('Arial'));
  await p.getByText('Reuse text, layouts and annotations',{exact:true}).click();const exp=p.waitForEvent('download');await p.locator('#exportRtf').click();await upload('exported.rtf',fs.readFileSync(await(await exp).path()));assert((await names()).includes('Arial'));assert((await names()).includes('Verdana'));assert.deepEqual(E.parseStream(await editor.inputValue(),false).filter(r=>r.k==='text').map(r=>[r.s,r.style.font]),runs.map(r=>[r.s,r.style.font]));
  await p.waitForFunction(()=>document.querySelector('#table').textContent.includes('ཀ'));
  const glyphs=selector=>p.locator(selector+' text').evaluateAll(ns=>ns.filter(n=>n.getAttribute('fill')==='#aa0000').map(n=>[n.textContent,n.getAttribute('font-family'),n.getAttribute('font-size'),n.getAttribute('font-weight')]));
  const preview=await glyphs('#table');assert(preview.some(r=>r[0]==='ཀ'&&r[1].includes('Arial')));await p.evaluate(()=>window.dispatchEvent(new Event('beforeprint')));assert.deepEqual(await glyphs('#printRoot'),preview);assert((await p.locator('#printRoot').textContent()).includes('401'));
  const pdf=await p.pdf({preferCSSPageSize:true,printBackground:true});assert.equal(pdf.subarray(0,5).toString(),'%PDF-');if(process.env.QA_PDF)fs.writeFileSync(process.env.QA_PDF,pdf);
  await editor.focus();await editor.press('Control+i');await font.selectOption('family:Arial');await p.locator('#characterGrid [data-byte="33"]').scrollIntoViewIfNeeded();if(process.env.QA_SCREENSHOT)await p.screenshot({path:process.env.QA_SCREENSHOT,fullPage:true});
  assert.deepEqual(errors,[]);console.log('PASS: document/body/rich-mark fonts, history after removal and partial import, full-open reset, selected/keep font preview, character insertion/style restoration/undo, Save/RTF, numbered preview/print/PDF');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
