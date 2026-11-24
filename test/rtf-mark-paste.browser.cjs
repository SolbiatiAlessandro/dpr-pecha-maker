const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');
global.PechaImages=require('../src/images');global.Folio=require('../src/folio');
const E=require('../src/engine'),{picture}=require('./rtf-picture-fixture');
const rtf=label=>'{\\rtf1\\ansi{\\fonttbl{\\f0 Arial;}{\\f1 Courier New;}}{\\colortbl;\\red176\\green48\\blue32;}\\f0\\fs100\\b\\i\\ul\\strike\\cf1 '+label+'A\\par \\f1\\fs12\\b0\\i0\\ulnone\\strike0\\cf0 '+label+'B}';
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
  const p=await browser.newPage({viewport:{width:1440,height:1050}}),errors=[];p.setDefaultTimeout(15000);p.on('pageerror',e=>errors.push(e.message));await p.goto(process.argv[2]);await p.locator('#pasteText').click();
  const upload=(name,buffer)=>p.locator('#openFile').setInputFiles({name,mimeType:'application/octet-stream',buffer});
  const d=E.defaultDoc();d.text='{30 #123456}ཀ་{page}ཁ་{page}ག་';d.counts={title:0,fancy:0};d.dzog.enabled=false;d.yigo.ignoreColor=false;d.yigo.enabled=false;d.yigo.text='OLD';d.folio.rhinoEnabled=false;d.folio.rhino='OLD';d.folio.size=17;
  await upload('marks.pecha',Buffer.from(JSON.stringify(d)));await p.waitForFunction(()=>document.querySelector('#text').value.includes('{30 #123456}'));await p.locator('[data-tab="marks"]').click();
  const select=async(selector,word)=>p.locator(selector).evaluate((t,word)=>{t.focus();const n=t.value.indexOf(word);t.setSelectionRange(n,n+word.length);},word);
  const paste=(selector,value,type='text/rtf')=>p.locator(selector).evaluate((t,{value,type})=>{t.focus();const data=new DataTransfer();data.setData('text/plain','fallback');data.setData(type,value);const e=new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:data});t.dispatchEvent(e);return e.defaultPrevented;},{value,type});
  const save=async()=>{const event=p.waitForEvent('download');await p.locator('#saveDoc').click();return fs.readFileSync(await(await event).path());};
  assert.equal(await p.locator('#f_yigo_text').getAttribute('type'),'text');assert(await p.locator('#f_yigo_text_choices option').count()>1);
  for(const [selector,rich,label,enabled] of [['#f_yigo_text','#f_yigo_rich','Yi','#f_yigo_enabled'],['#f_folio_rhino','#f_folio_rhinoRich','Fixed','#f_folio_rhinoEnabled']]) {
   await select(selector,'OLD');assert(await paste(selector,rtf(label),label==='Yi'?'text/rtf':'application/rtf'));const content=await p.locator(selector).inputValue();assert(!content.includes('OLD'));assert(await p.locator(rich).isChecked());assert(!await p.locator(enabled).isChecked(),'paste must preserve separate enabled state');
   await p.locator(selector).focus();await p.keyboard.press('Meta+z');assert.equal(await p.locator(selector).inputValue(),'OLD');assert(!await p.locator(rich).isChecked());await p.keyboard.press('Meta+Shift+z');assert.equal(await p.locator(selector).inputValue(),content);assert(await p.locator(rich).isChecked());
   assert(await paste(selector,'bad'));assert.equal(await p.locator(selector).inputValue(),content);assert((await p.locator('#toast').textContent()).startsWith('Could not paste RTF:'));
   assert(await paste(selector,'{\\rtf1}'));assert.equal(await p.locator(selector).inputValue(),content);assert(await paste(selector,'{\\rtf1 '+picture()+'}'));assert.equal(await p.locator(selector).inputValue(),content);assert((await p.locator('#importMessages').textContent()).includes('Pictures'));
   assert.equal(await paste(selector,'ordinary','text/plain'),false);assert.equal(await p.locator(selector).inputValue(),content);
  }
  await p.locator('#f_yigo_enabled').check();await p.locator('#f_folio_rhinoEnabled').check();
  await p.waitForFunction(()=>Array.from(document.querySelectorAll('#table text')).filter(n=>n.textContent==='YiA').length===2);
  const styles=selector=>p.locator(selector+' text').evaluateAll(ns=>ns.filter(n=>['YiA','YiB','FixedA','FixedB'].includes(n.textContent.trim())).map(n=>[n.textContent.trim(),n.getAttribute('font-family'),+n.getAttribute('font-size'),n.getAttribute('font-weight'),n.getAttribute('font-style'),n.getAttribute('text-decoration'),n.getAttribute('fill')]));
  const preview=await styles('#table');assert.equal(preview.length,8);
  for(const [text,font,size,b,i,u,color] of preview){assert.equal(size,text.startsWith('Yi')?30:17);assert(font.includes(text.endsWith('A')?'Arial':'Courier New'));if(text.endsWith('A'))assert.equal(color,'#b03020');if(text==='YiA')assert(!b&&!i&&!u);if(text==='FixedA'){assert.equal(b,'700');assert.equal(i,'italic');assert.equal(u,'underline line-through');}}
  assert.deepEqual(await p.locator('#table svg').evaluateAll(ns=>ns.map(svg=>Array.from(svg.querySelectorAll('text')).filter(n=>n.textContent==='YiA').length)),[1,0,1]);
  await p.evaluate(()=>window.dispatchEvent(new Event('beforeprint')));assert.deepEqual((await styles('#printRoot')).sort(),[...preview].sort());
  await p.locator('#f_yigo_ignoreColor').check();await p.waitForFunction(()=>Array.from(document.querySelectorAll('#table text')).filter(n=>n.textContent==='YiA').every(n=>n.getAttribute('fill')==='#123456'));assert((await styles('#table')).filter(r=>r[0].startsWith('Yi')).every(r=>r[6]==='#123456'));assert((await styles('#table')).filter(r=>r[0]==='FixedA').every(r=>r[6]==='#b03020'));await p.locator('#f_yigo_ignoreColor').uncheck();
  const saved=await save(),out=JSON.parse(saved);assert.equal(out.text,d.text);assert.equal(out.assets.length,0);assert.equal(out.images.length,0);assert.deepEqual(out.notes,d.notes);assert.equal(out.folio.size,17);assert(out.yigo.rich&&out.folio.rhinoRich);
  await upload('saved.pecha',saved);await p.waitForFunction(()=>document.querySelector('#toast').textContent==='Opened saved.pecha.');assert.deepEqual(await styles('#table'),preview);await p.locator('[data-tab="marks"]').click();
  // Existing rich text keeps its surrounding styles when a second clipboard selection replaces a word.
  const source=await p.locator('#f_folio_rhino').inputValue();await select('#f_folio_rhino','FixedB');assert(await paste('#f_folio_rhino','{\\rtf1 Replaced}'));assert((await p.locator('#f_folio_rhino').inputValue()).includes('FixedA'));await p.locator('#f_folio_rhino').focus();await p.keyboard.press('Meta+z');assert.equal(await p.locator('#f_folio_rhino').inputValue(),source);assert(await p.locator('#f_folio_rhinoRich').isChecked());
  if(process.env.QA_SCREENSHOT){await p.locator('#f_yigo_text').scrollIntoViewIfNeeded();await p.screenshot({path:process.env.QA_SCREENSHOT,fullPage:true});}
  assert.deepEqual(errors,[]);console.log('PASS: yi-go and fixed-phrase rich paste, presets, independent enable flags, undo/redo, errors/images/plain routing, font/colour/emphasis/size rules, front-only preview/print, colour matching, Save/Open and scoped replacement');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
