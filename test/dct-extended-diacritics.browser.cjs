const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');
global.PechaImages=require('../src/images');global.Folio=require('../src/folio');
const E=require('../src/engine'),{expected,sample,wrap}=require('./dct-extended-diacritics-fixture');
const visible=text=>E.parseStream(text,false).filter(r=>r.k==='text').map(r=>r.s).join('').replace(/\u2028/g,'\n');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const p=await browser.newPage({viewport:{width:1440,height:1100}}),errors=[];p.setDefaultTimeout(15000);p.on('pageerror',e=>errors.push(e.message));await p.goto(process.argv[2]);await p.locator('#pasteText').click();
  const upload=async(name,buffer)=>{await p.locator('#toast').evaluate(n=>n.textContent='');await p.locator('#openFile').setInputFiles({name,mimeType:'application/octet-stream',buffer});if(name.endsWith('.dct'))await p.locator('#dctDialog').waitFor({state:'visible'});else await p.waitForFunction(()=>document.querySelector('#toast').textContent.length>0);};
  const finish=async()=>{await p.locator('#dctImport').click();await p.waitForFunction(()=>!document.querySelector('#dctDialog').open && document.querySelector('#toast').textContent.includes('Experimental TibetDoc import complete'));};
  const base=E.defaultDoc();base.text='KEEP';base.counts={title:0,fancy:0};base.yigo.enabled=false;base.dzog.enabled=false;base.folio.start=23;base.pageNum.start=401;
  await upload('base.pecha',Buffer.from(JSON.stringify(base)));await upload('extended-csx.dct',sample());
  await p.locator('#dctDiacriticOptions summary').click();await p.locator('#dctRemapDiacritics').uncheck();await p.locator('#dctDiacriticFont').selectOption('custom');await p.locator('#dctDiacriticFontName').fill('Times New Roman');await p.locator('#dctDiacriticSize').fill('24');await finish();
  // DCT starts a new content document; configure numbering through the actual UI.
  await p.locator('.tabs button[data-tab="marks"]').click();await p.locator('#f_folio_start').fill('23');await p.locator('#f_folio_onTitle').check();await p.locator('#f_pageNum_start').fill('401');await p.locator('#f_pageNum_onTitle').check();await p.locator('.tabs button[data-tab="text"]').click();
  const editor=p.locator('#text');assert.equal(visible(await editor.inputValue()),expected);const report=await p.locator('#importMessages').textContent();assert(!report.includes('DCT glyphs could not'));assert(report.includes('substitute web font'));
  const runs=E.parseStream(await editor.inputValue(),false).filter(r=>r.k==='text'&&r.s.trim());assert(runs.every(r=>r.style.font==='family:Times%20New%20Roman'&&r.style.size===24));
  await p.waitForFunction(()=>document.querySelector('#table').textContent.includes('Ç'));
  const glyphs=selector=>p.locator(selector+' text').evaluateAll(ns=>ns.filter(n=>n.getAttribute('font-size')==='24').map(n=>[n.textContent,n.getAttribute('font-family'),n.getAttribute('font-size')]));
  const original=await glyphs('#table');assert(original.length);assert(original.every(r=>r[1].includes('Times New Roman')));
  const save=p.waitForEvent('download');await p.locator('#saveDoc').click();const saved=fs.readFileSync(await(await save).path());await upload('saved.pecha',saved);assert.equal(visible(await editor.inputValue()),expected);assert.deepEqual(await glyphs('#table'),original);
  await p.getByText('Reuse text, layouts and annotations',{exact:true}).click();const before=await editor.inputValue();await p.locator('#exportPxc').click();assert((await p.locator('#toast').textContent()).includes('cannot encode'));assert.equal(await editor.inputValue(),before);
  const exp=p.waitForEvent('download');await p.locator('#exportRtf').click();await upload('exported.rtf',fs.readFileSync(await(await exp).path()));assert.equal(visible(await editor.inputValue()),expected);assert.deepEqual(await glyphs('#table'),original);
  await p.evaluate(()=>window.dispatchEvent(new Event('beforeprint')));assert.deepEqual(await glyphs('#printRoot'),original);assert((await p.locator('#printRoot').textContent()).includes('401'));
  const pdf=await p.pdf({preferCSSPageSize:true,printBackground:true});assert.equal(pdf.subarray(0,5).toString(),'%PDF-');if(process.env.QA_PDF)fs.writeFileSync(process.env.QA_PDF,pdf);if(process.env.QA_SCREENSHOT)await p.screenshot({path:process.env.QA_SCREENSHOT,fullPage:true});
  const mixed=wrap([21,209,16,209,21,97,17,33],'Ansi');await upload('raw.dct',mixed);assert(!(await p.locator('#dctRemapDiacritics').isChecked()));await finish();assert.equal(visible(await editor.inputValue()),'ĩÑaཀ');
  await upload('remapped.dct',mixed);if(!(await p.locator('#dctDiacriticOptions').evaluate(n=>n.open)))await p.locator('#dctDiacriticOptions summary').click();await p.locator('#dctRemapDiacritics').check();await finish();assert.equal(visible(await editor.inputValue()),'ÑÑāཀ');
  await upload('unresolved.dct',wrap([21,160,21,200,21,202,21,204],'Ansi'));await finish();assert.equal(visible(await editor.inputValue()),'����');assert((await p.locator('#importMessages').textContent()).includes('4 DCT glyphs'));
  assert.deepEqual(errors,[]);console.log('PASS: extended CSX+ DCT upload/custom typography, combining text, Save/RTF, exact preview/print and numbered PDF, native-export rejection, raw/remap209 and one-glyph scope, four unresolved warnings');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
