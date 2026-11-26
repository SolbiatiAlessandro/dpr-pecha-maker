const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');
global.PechaImages=require('../src/images');global.Folio=require('../src/folio');
const E=require('../src/engine'),{sample,expected}=require('./dct-extended-diacritics-fixture');
const visible=s=>E.parseStream(s,false).filter(r=>r.k==='text').map(r=>r.s).join('').replace(/\u2028/g,'\n');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const p=await browser.newPage({viewport:{width:1440,height:1100}}),errors=[];p.setDefaultTimeout(15000);p.on('pageerror',e=>errors.push(e.message));await p.goto(process.argv[2]);await p.locator('#pasteText').click();
  const upload=async(name,buffer)=>{await p.locator('#toast').evaluate(n=>n.textContent='');await p.locator('#openFile').setInputFiles({name,mimeType:'application/octet-stream',buffer});await p.waitForFunction(()=>document.querySelector('#toast').textContent.length>0);};
  const drop=async(name,buffer)=>p.evaluate(({name,bytes})=>{const dt=new DataTransfer();dt.items.add(new File([new Uint8Array(bytes)],name));for(const type of ['dragenter','dragover','drop'])window.dispatchEvent(new DragEvent(type,{dataTransfer:dt,bubbles:true,cancelable:true}));},{name,bytes:[...buffer]});
  const save=async()=>{const next=p.waitForEvent('download');await p.locator('#saveDoc').click();return fs.readFileSync(await(await next).path());};
  const base=E.defaultDoc();base.text='ཀ KEEP {b}bold{/b}';base.counts={title:0,fancy:0};base.folio.start=23;base.pageNum.start=401;base.dzog.enabled=false;base.yigo.enabled=false;
  await upload('base.pecha',Buffer.from(JSON.stringify(base)));await p.locator('#typeover').check();await p.locator('#lockedKeyboard').check();await p.locator('#text').evaluate(n=>{n.focus();n.setSelectionRange(2,6);});
  const before=JSON.parse(await save());
  const retained=async()=>{assert(await p.locator('#work').isVisible());assert.equal(await p.locator('#text').inputValue(),base.text);assert(await p.locator('#typeover').isChecked());assert(await p.locator('#lockedKeyboard').isChecked());assert.deepEqual(await p.evaluate(()=>Documents.artifact(doc,'document')),before);assert(!(await p.locator('body').evaluate(n=>n.classList.contains('dragging'))));};
  await drop('cancel.dct',sample());await p.locator('#dctDialog').waitFor({state:'visible'});await p.locator('#dctCancel').click();await retained();
  await drop('escape.dct',sample());await p.locator('#dctDialog').waitFor({state:'visible'});await p.keyboard.press('Escape');await retained();
  // A second dropped file cannot replace the current document underneath the modal.
  await drop('first.dct',sample());await p.locator('#dctDialog').waitFor({state:'visible'});await drop('second.txt',Buffer.from('SECOND'));
  assert((await p.locator('#toast').textContent()).includes('Finish or cancel'));assert.equal(await p.locator('#dctFilename').textContent(),'first.dct');await p.locator('#dctCancel').click();await retained();
  for(const [name,bytes] of [['bad.pecha',Buffer.from('{bad')],['bad.pxp',Buffer.from('bad')],['bad.dct',Buffer.from('bad')]]){
   await drop(name,bytes);if(name.endsWith('.dct')){await p.locator('#dctDialog').waitFor({state:'visible'});await p.locator('#dctImport').click();}
   await p.waitForFunction(n=>document.querySelector('#importMessages').textContent.includes('Could not read '+n),name);await retained();
  }
  // Deterministic browser API failures/slow reads: do not depend on OS permission dialogs.
  await p.evaluate(()=>{window.originalArrayBuffer=File.prototype.arrayBuffer;File.prototype.arrayBuffer=function(){if(this.name==='unreadable.txt')return Promise.reject(new Error('Synthetic read failure'));if(this.name==='slow.txt')return new Promise(resolve=>window.finishSlowRead=()=>resolve(new TextEncoder().encode('FIRST').buffer));return window.originalArrayBuffer.call(this);};});
  await drop('unreadable.txt',Buffer.from('bad'));await p.waitForFunction(()=>document.querySelector('#importMessages').textContent.includes('Synthetic read failure'));await retained();
  // Stub PDF decoding only to test failure-view restoration; PDF decoding has its own tests.
  await p.evaluate(()=>{window.originalPdfRead=PdfRead.read;PdfRead.read=async()=>{throw new Error('Synthetic PDF failure');};});await drop('bad.pdf',Buffer.from('bad'));await p.waitForFunction(()=>document.querySelector('#importMessages').textContent.includes('Could not read bad.pdf'));await retained();await p.evaluate(()=>{PdfRead.read=window.originalPdfRead;});
  await drop('slow.txt',Buffer.from('slow'));await p.waitForFunction(()=>typeof window.finishSlowRead==='function');await drop('ignored.txt',Buffer.from('SECOND'));assert((await p.locator('#toast').textContent()).includes('Finish or cancel'));await p.evaluate(()=>window.finishSlowRead());await p.waitForFunction(()=>document.querySelector('#text').value==='FIRST');await p.evaluate(()=>{File.prototype.arrayBuffer=window.originalArrayBuffer;});
  // A non-file drag is not captured as a document import or a file hover.
  const textDrag=await p.evaluate(()=>{const dt=new DataTransfer();dt.setData('text/plain','normal text');return ['dragenter','dragover','drop'].map(type=>window.dispatchEvent(new DragEvent(type,{dataTransfer:dt,cancelable:true,bubbles:true})));});assert.deepEqual(textDrag,[true,true,true]);assert(!(await p.locator('body').evaluate(n=>n.classList.contains('dragging'))));
  await drop('valid.dct',sample());await p.locator('#dctDialog').waitFor({state:'visible'});await p.locator('#dctDiacriticOptions summary').click();await p.locator('#dctRemapDiacritics').uncheck();await p.locator('#dctDiacriticSize').fill('24');await p.locator('#dctImport').click();await p.waitForFunction(()=>document.querySelector('#toast').textContent.includes('Experimental TibetDoc import complete'));
  assert.equal(visible(await p.locator('#text').inputValue()),expected);assert(!(await p.locator('#typeover').isChecked()));assert(!(await p.locator('#lockedKeyboard').isChecked()));
  const saved=await save();await upload('saved.pecha',saved);assert.equal(visible(await p.locator('#text').inputValue()),expected);
  await p.getByText('Reuse text, layouts and annotations',{exact:true}).click();const exp=p.waitForEvent('download');await p.locator('#exportRtf').click();await drop('roundtrip.rtf',fs.readFileSync(await(await exp).path()));await p.waitForFunction(()=>document.querySelector('#toast').textContent.includes('RTF'));assert.equal(visible(await p.locator('#text').inputValue()),expected);
  await p.locator('.tabs button[data-tab="marks"]').click();await p.locator('#f_folio_start').fill('23');await p.locator('#f_folio_onTitle').check();await p.locator('#f_pageNum_start').fill('401');await p.locator('#f_pageNum_onTitle').check();await p.locator('.tabs button[data-tab="text"]').click();await p.waitForFunction(()=>document.querySelector('#table').textContent.includes('401'));
  await p.evaluate(()=>window.dispatchEvent(new Event('beforeprint')));assert((await p.locator('#printRoot').textContent()).includes('401'));assert((await p.locator('#printRoot').textContent()).includes('ཉི་ཤུ་རྩ་གསུམ་'));
  const glyphs=selector=>p.locator(selector+' text').evaluateAll(ns=>ns.filter(n=>n.getAttribute('font-size')==='24').map(n=>[n.textContent,n.getAttribute('font-family'),n.getAttribute('font-size')]));assert.deepEqual(await glyphs('#printRoot'),await glyphs('#table'));
  const pdf=await p.pdf({preferCSSPageSize:true,printBackground:true});assert.equal(pdf.subarray(0,5).toString(),'%PDF-');if(process.env.QA_PDF)fs.writeFileSync(process.env.QA_PDF,pdf);if(process.env.QA_SCREENSHOT)await p.screenshot({path:process.env.QA_SCREENSHOT,fullPage:true});
  await p.locator('#newDoc').click();await drop('start-cancel.dct',sample());await p.locator('#dctDialog').waitFor({state:'visible'});await p.locator('#dctCancel').click();assert(await p.locator('#start').isVisible());
  await drop('start-bad.pecha',Buffer.from('{bad'));await p.waitForFunction(()=>document.querySelector('#startStatus').textContent.includes('Could not read start-bad.pecha'));assert(await p.locator('#start').isVisible());await drop('recovered.txt',Buffer.from('RECOVERED'));await p.waitForFunction(()=>document.querySelector('#text').value==='RECOVERED');assert(await p.locator('#work').isVisible());
  assert.deepEqual(errors,[]);console.log('PASS: DCT file-drop cancel/Escape and failure retention, modal/slow-read overlap guards, read/PDF failure recovery, non-file drags, successful DCT/RTF drops, Save/Open, mode resets, preview/numberedprint/PDF');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
