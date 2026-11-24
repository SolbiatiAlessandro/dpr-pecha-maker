const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');
global.PechaImages=require('../src/images');global.Folio=require('../src/folio');
const E=require('../src/engine'),R=require('../src/rtf'),T=require('../src/legacy-table');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
  const p=await browser.newPage({viewport:{width:1440,height:1050}}),errors=[];p.setDefaultTimeout(15000);p.on('pageerror',e=>errors.push(e.message));await p.goto(process.argv[2]);await p.locator('#pasteText').click();
  const upload=(name,buffer)=>p.locator('#openFile').setInputFiles({name,mimeType:'application/octet-stream',buffer});
  const d=E.defaultDoc();d.text='{30 #123456}ཀ་{page}ཁ་{page}ག་';d.counts={title:0,fancy:0};d.dzog.enabled=false;d.yigo.enabled=true;d.yigo.ignoreColor=true;d.yigo.rich=true;
  const source='{font:family:Arial 88 #b03020}Before Red{font:family:Courier%20New 6 #234567}Blue Tail';d.yigo.text=source;d.folio.rhinoEnabled=false;d.folio.size=17;d.folio.rhino='';d.folio.inset=.35;d.notes.sets['body.front'].inL=E.noteSlot('',13);
  await upload('yigo-copy.pecha',Buffer.from(JSON.stringify(d)));await p.waitForFunction(text=>document.querySelector('#text').value===text,d.text);await p.locator('[data-tab="marks"]').click();
  const select=(selector,start,end)=>p.locator(selector).evaluate((t,{start,end})=>{t.focus();t.setSelectionRange(start,end);},{start,end});
  const copy=()=>p.locator('#f_yigo_text').evaluate(t=>{const data=new DataTransfer(),event=new ClipboardEvent('copy',{bubbles:true,cancelable:true,clipboardData:data});t.dispatchEvent(event);return {prevented:event.defaultPrevented,plain:data.getData('text/plain'),rtf:data.getData('text/rtf')};});
  const paste=(selector,data)=>p.locator(selector).evaluate((t,data)=>{t.focus();const clipboardData=new DataTransfer();clipboardData.setData('text/plain',data.plain);clipboardData.setData('text/rtf',data.rtf);t.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData}));},data);
  const decoded=data=>E.parseStream(R.read(data.rtf,E,T).doc.text,false).filter(r=>r.k==='text');
  const save=async()=>{const event=p.waitForEvent('download');await p.locator('#saveDoc').click();return fs.readFileSync(await(await event).path());};
  const start=source.indexOf('Red'),end=source.indexOf(' Tail');await select('#f_yigo_text',start,end);const data=await copy();assert(data.prevented);assert.equal(data.plain,'RedBlue');assert(decoded(data).every(r=>r.style.size===18));assert.deepEqual(decoded(data).map(r=>[r.style.font,r.style.color]),[['family:Arial','#b03020'],['family:Courier%20New','#234567']]);assert.equal(await p.locator('#f_yigo_text').inputValue(),source);assert.deepEqual(await p.locator('#f_yigo_text').evaluate(t=>[t.selectionStart,t.selectionEnd]),[start,end]);
  // Page colour matching and page size do not leak into the entry-field clipboard.
  await p.waitForFunction(()=>Array.from(document.querySelectorAll('#table text')).some(n=>n.textContent==='Blue'&&n.getAttribute('font-size')==='30'&&n.getAttribute('fill')==='#123456'));
  await select('#f_yigo_text',2,9);assert(!(await copy()).prevented);await select('#f_yigo_text',start,start);assert(!(await copy()).prevented);
  await select('#f_yigo_text',start,end);assert.equal(await p.locator('#f_yigo_text').evaluate(t=>{const event=new ClipboardEvent('copy',{bubbles:true,cancelable:true});t.dispatchEvent(event);return event.defaultPrevented;}),false);
  await p.locator('#f_yigo_text').evaluate(t=>{const event=new ClipboardEvent('copy',{bubbles:true,cancelable:true});Object.defineProperty(event,'clipboardData',{value:{setData(){throw Error('Synthetic clipboard failure');}}});t.dispatchEvent(event);});assert.equal(await p.locator('#f_yigo_text').inputValue(),source);assert((await p.locator('#toast').textContent()).includes('Synthetic clipboard failure'));
  await p.locator('#f_yigo_enabled').uncheck();assert.deepEqual(await copy(),data);assert(!await p.locator('#f_yigo_enabled').isChecked());await p.locator('#f_yigo_enabled').check();
  await select('#f_notes_sets_body_front_inL_text',0,0);await paste('#f_notes_sets_body_front_inL_text',data);await select('#f_folio_rhino',0,0);await paste('#f_folio_rhino',data);assert(!await p.locator('#f_folio_rhinoEnabled').isChecked());await p.locator('#f_folio_rhinoEnabled').check();
  // A separate page retains the 30 pt yi-go; copied body text receives the field's 18 pt size.
  await p.locator('[data-tab="text"]').click();const body=await p.locator('#text').inputValue();await select('#text',body.length,body.length);await paste('#text',data);
  const styles=selector=>p.locator(selector+' text').evaluateAll(ns=>ns.filter(n=>['Red','Blue'].includes(n.textContent)).map(n=>[n.textContent,n.getAttribute('font-family'),+n.getAttribute('font-size'),n.getAttribute('fill')]));
  await p.waitForFunction(()=>Array.from(document.querySelectorAll('#table text')).some(n=>n.textContent==='Red'&&n.getAttribute('font-size')==='18'));
  const preview=await styles('#table');for(const size of [13,17,18])assert(preview.some(([s,f,z,c])=>s==='Red'&&f.includes('Arial')&&z===size&&c==='#b03020'));assert(preview.some(([s,f,z,c])=>s==='Blue'&&z===30&&c==='#123456'));
  await p.evaluate(()=>window.dispatchEvent(new Event('beforeprint')));assert.deepEqual(await styles('#printRoot'),preview);
  await p.locator('#copyFormatted').uncheck();await p.locator('[data-tab="marks"]').click();await select('#f_yigo_text',start,end);assert(!(await copy()).prevented);await p.locator('[data-tab="text"]').click();await p.locator('#copyFormatted').check();
  const saved=await save(),out=JSON.parse(saved);assert.deepEqual(out.yigo,d.yigo);assert.equal(out.notes.sets['body.front'].inL.size,13);assert.equal(out.folio.size,17);assert.equal(out.assets.length,0);assert.equal(out.images.length,0);
  await upload('saved.pecha',saved);await p.waitForFunction(()=>document.querySelector('#toast').textContent==='Opened saved.pecha.');assert.deepEqual(await styles('#table'),preview);await p.locator('[data-tab="marks"]').click();if(process.env.QA_SCREENSHOT){await p.locator('#f_yigo_text').scrollIntoViewIfNeeded();await p.screenshot({path:process.env.QA_SCREENSHOT,fullPage:true});}
  // Plain fields retain literal braces, Tibetan and surrogate pairs without enabling rich mode.
  const plain=E.defaultDoc();plain.text='Plain';plain.textSize=80;plain.yigo.enabled=false;plain.yigo.rich=false;plain.yigo.text='Before {b}ཀི་😀{page} Tail';await upload('plain.pecha',Buffer.from(JSON.stringify(plain)));await p.waitForFunction(()=>document.querySelector('#text').value==='Plain');await p.locator('[data-tab="marks"]').click();await select('#f_yigo_text',7,plain.yigo.text.indexOf(' Tail'));const literal=await copy();assert.equal(literal.plain,'{b}ཀི་😀{page}');assert(decoded(literal).every(r=>r.style.size===18&&!r.style.bold));assert(!await p.locator('#f_yigo_rich').isChecked());assert(!await p.locator('#f_yigo_enabled').isChecked());assert.equal(await p.locator('#f_yigo_text').inputValue(),plain.yigo.text);
  assert.deepEqual(errors,[]);console.log('PASS: synthetic yi-go Copy at 18 pt, selection/inherited fonts/colours, independent page size/Ignore Color, plain Unicode/literal braces, disabled state, raw/empty/code/missing/failure routing, note/phrase/body paste, preview/print and Save/Open');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
