const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');
global.PechaImages=require('../src/images');global.Folio=require('../src/folio');
const E=require('../src/engine'),R=require('../src/rtf'),T=require('../src/legacy-table'),{picture}=require('./rtf-picture-fixture');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
  const p=await browser.newPage({viewport:{width:1440,height:1050}}),errors=[];p.setDefaultTimeout(15000);p.on('pageerror',e=>errors.push(e.message));await p.goto(process.argv[2]);await p.locator('#pasteText').click();
  const upload=(name,buffer)=>p.locator('#openFile').setInputFiles({name,mimeType:'application/octet-stream',buffer});
  const source='{commentary font:family:Courier%20New i u s #b03020}Before CopyMe{font:family:Arial 18 /b /i /u /s #123456}Blue Tail';
  const d=E.defaultDoc();d.text='';d.sectionLabels={left:false,right:false};d.sections=[{name:'One',text:source,folioStart:1,restartLayout:true},{name:'Two',text:'EXCLUDED SECTION',folioStart:1,restartLayout:true}];d.roles.commentary={font:'Jomolhari',size:27,bold:true};d.counts={title:0,fancy:0};d.yigo.enabled=false;d.dzog.enabled=false;d.folio.rhinoEnabled=false;d.folio.size=16;d.notes.sets['body.front'].inR=E.noteSlot('',15);
  await upload('copy.pecha',Buffer.from(JSON.stringify(d)));await p.waitForFunction(()=>document.querySelector('#text').value.includes('CopyMe'));
  const select=(selector,start,end)=>p.locator(selector).evaluate((t,{start,end})=>{t.focus();t.setSelectionRange(start,end);},{start,end});
  const copy=()=>p.locator('#text').evaluate(t=>{const clipboardData=new DataTransfer(),event=new ClipboardEvent('copy',{bubbles:true,cancelable:true,clipboardData});t.dispatchEvent(event);return {prevented:event.defaultPrevented,plain:clipboardData.getData('text/plain'),rtf:clipboardData.getData('text/rtf')};});
  const paste=(selector,data)=>p.locator(selector).evaluate((t,data)=>{t.focus();const clipboardData=new DataTransfer();clipboardData.setData('text/plain',data.plain);clipboardData.setData('text/rtf',data.rtf);const event=new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData});t.dispatchEvent(event);return event.defaultPrevented;},data);
  const save=async()=>{const event=p.waitForEvent('download');await p.locator('#saveDoc').click();return fs.readFileSync(await(await event).path());};
  assert(await p.locator('#copyFormatted').isChecked());const start=source.indexOf('CopyMe'),end=source.indexOf(' Tail');await select('#text',start,end);const data=await copy();assert(data.prevented);assert.equal(data.plain,'CopyMeBlue');assert(!data.rtf.includes('Before'));assert(!data.rtf.includes('Tail'));assert(!data.rtf.includes('EXCLUDED SECTION'));assert.equal(await p.locator('#text').inputValue(),source);assert.deepEqual(await p.locator('#text').evaluate(t=>[t.selectionStart,t.selectionEnd]),[start,end]);
  const imported=R.read(data.rtf,E,T).doc,runs=E.parseStream(imported.text,false).filter(r=>r.k==='text');assert.equal(runs[0].style.font,'family:Courier%20New');assert.equal(runs[0].style.size,27);assert(runs[0].style.bold&&runs[0].style.italic&&runs[0].style.underline&&runs[0].style.strike);assert.equal(runs[1].style.font,'family:Arial');assert.equal(runs[1].style.size,18);
  await p.locator('#copyFormatted').uncheck();await select('#text',start,end);assert(!(await copy()).prevented);await p.locator('#copyFormatted').check();await select('#text',start,start);assert(!(await copy()).prevented);await select('#text',1,9);assert(!(await copy()).prevented,'a code-only selection remains raw browser copy');
  // The app's own selected-body copy feeds all three rich automatic-mark destinations.
  await p.locator('[data-tab="marks"]').click();
  for(const selector of ['#f_notes_sets_body_front_inR_text','#f_yigo_text','#f_folio_rhino']){await p.locator(selector).evaluate(t=>{t.focus();t.setSelectionRange(0,t.value.length);});assert(await paste(selector,data));assert.equal(E.parseStream(await p.locator(selector).inputValue(),false).filter(r=>r.k==='text').map(r=>r.s).join(''),data.plain);}
  await p.locator('#f_folio_rhinoEnabled').check();
  await p.waitForFunction(()=>Array.from(document.querySelectorAll('#table text')).some(n=>n.textContent==='CopyMe'&&n.getAttribute('font-size')==='15'));
  const styles=selector=>p.locator(selector+' text').evaluateAll(ns=>ns.filter(n=>['CopyMe','Blue'].includes(n.textContent)).map(n=>[n.textContent,n.getAttribute('font-family'),+n.getAttribute('font-size'),n.getAttribute('font-weight'),n.getAttribute('font-style'),n.getAttribute('text-decoration'),n.getAttribute('fill')]));
  const preview=await styles('#table');assert(preview.some(([text,font,size,b,i,u,c])=>text==='CopyMe'&&font.includes('Courier New')&&size===15&&b==='700'&&i==='italic'&&u==='underline line-through'&&c==='#b03020'));
  assert(preview.some(([text,font,size])=>text==='CopyMe'&&font.includes('Courier New')&&size===16));
  await p.evaluate(()=>window.dispatchEvent(new Event('beforeprint')));assert.deepEqual((await styles('#printRoot')).sort(),[...preview].sort());
  const saved=await save(),out=JSON.parse(saved);assert.equal(out.sections[0].text,source);assert.equal(out.sections[1].text,'EXCLUDED SECTION');assert.equal(out.text,'');assert(out.yigo.rich&&out.folio.rhinoRich&&out.notes.sets['body.front'].inR.rich);assert.equal(out.yigo.enabled,false);
  await upload('saved.pecha',saved);await p.waitForFunction(()=>document.querySelector('#toast').textContent==='Opened saved.pecha.');assert.deepEqual(await styles('#table'),preview);
  if(process.env.QA_SCREENSHOT){await p.locator('[data-tab="text"]').click();await p.locator('#copyFormatted').scrollIntoViewIfNeeded();await p.screenshot({path:process.env.QA_SCREENSHOT,fullPage:true});}
  // Copy one inline image, then paste it into a different document: only its pixels/placement travel.
  const images=R.read('{\\rtf1 A'+picture()+'B'+picture()+'C}',E,T).doc;await upload('images.pecha',Buffer.from(JSON.stringify(images)));await p.waitForFunction(()=>document.querySelector('#text').value.includes('image:'));await p.locator('[data-tab="text"]').click();
  const token=images.text.match(/\{image:[^}]+\}/)[0],at=images.text.indexOf(token);await select('#text',at,at+token.length);const imageData=await copy();assert(imageData.prevented);assert.equal(imageData.plain,'\uFFFC');assert.equal((imageData.rtf.match(/\\pngblip/g)||[]).length,1);
  const empty=E.defaultDoc();empty.text='TARGET';await upload('target.pecha',Buffer.from(JSON.stringify(empty)));await p.waitForFunction(()=>document.querySelector('#text').value==='TARGET');await select('#text',0,6);assert(await paste('#text',imageData));await p.waitForFunction(()=>document.querySelectorAll('#table image').length===1);
  const target=JSON.parse(await save());assert.equal(target.images.length,1);assert.equal(target.assets.length,1);assert(!target.text.includes('TARGET'));await p.locator('#text').focus();await p.keyboard.press('Meta+z');assert.equal(await p.locator('#text').inputValue(),'TARGET');
  assert.deepEqual(errors,[]);console.log('PASS: synthetic selection copy to RTF/plain, inherited styles, raw/empty/code-only fallback, volume scope/nonmutation, body-to-note/yi-go/phrase, preview/print/Save and selected-image copy/paste/undo');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
