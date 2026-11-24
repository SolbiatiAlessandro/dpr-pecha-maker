const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');
global.PechaImages=require('../src/images');global.Folio=require('../src/folio');
const E=require('../src/engine'),{picture}=require('./rtf-picture-fixture');
const rtf='{\\rtf1\\ansi{\\fonttbl{\\f0 Courier New;}{\\f1 Arial;}}{\\colortbl;\\red176\\green48\\blue32;}\\f0\\fs96\\b\\i\\ul\\strike\\cf1 Red\\par \\f1\\fs12\\b0\\i0\\ulnone\\strike0\\cf0 Blue}';
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
  const p=await browser.newPage({viewport:{width:1440,height:1050}}),errors=[];p.setDefaultTimeout(15000);p.on('pageerror',e=>errors.push(e.message));await p.goto(process.argv[2]);await p.locator('#pasteText').click();
  const upload=(name,buffer)=>p.locator('#openFile').setInputFiles({name,mimeType:'application/octet-stream',buffer});
  const d=E.defaultDoc();d.text='Body{page}Back';d.counts={title:0,fancy:0};d.yigo.enabled=false;d.dzog.enabled=false;d.notes.sets['body.front'].inL=E.noteSlot('{b} OLD!',21,.18);
  await upload('notes.pecha',Buffer.from(JSON.stringify(d)));await p.waitForFunction(()=>document.querySelector('#text').value==='Body{page}Back');await p.locator('[data-tab="marks"]').click();
  const id=(side='body.front',key='inL',field='text')=>'#f_notes_sets_'+side.replace('.','_')+'_'+key+'_'+field;
  const select=async(selector,word)=>p.locator(selector).evaluate((t,word)=>{t.focus();const n=t.value.indexOf(word);t.setSelectionRange(n,n+word.length);},word);
  const paste=(selector,value=rtf,type='text/rtf')=>p.locator(selector).evaluate((t,{value,type})=>{t.focus();const data=new DataTransfer();data.setData('text/plain','fallback');data.setData(type,value);const e=new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:data});t.dispatchEvent(e);return e.defaultPrevented;},{value,type});
  const save=async()=>{const event=p.waitForEvent('download');await p.locator('#saveDoc').click();return fs.readFileSync(await(await event).path());};
  await select(id(),'OLD');assert(await paste(id()));const pasted=await p.locator(id()).inputValue();assert.equal(E.parseStream(pasted,false).filter(r=>r.k==='text').map(r=>r.s).join(''),'{b} Red Blue!');assert(await p.locator(id('body.front','inL','rich')).isChecked());assert.equal(await p.locator(id('body.front','inL','size')).inputValue(),'21');
  const styles=selector=>p.locator(selector+' text').evaluateAll(ns=>ns.filter(n=>['Red','Blue'].includes(n.textContent.trim())).map(n=>[n.textContent,n.getAttribute('font-family'),n.getAttribute('font-size'),n.getAttribute('font-weight'),n.getAttribute('font-style'),n.getAttribute('text-decoration'),n.getAttribute('fill')]));
  await p.waitForFunction(()=>Array.from(document.querySelectorAll('#table text')).some(n=>n.textContent.includes('Red')));
  const preview=await styles('#table');assert(preview.some(([s,f,z,w,i,u,c])=>s.trim()==='Red'&&f.includes('Courier New')&&z==='21'&&w==='700'&&i==='italic'&&u==='underline line-through'&&c==='#b03020'));assert(preview.some(([s,f,z])=>s.trim()==='Blue'&&f.includes('Arial')&&z==='21'));
  assert(await p.locator('#table text').evaluateAll(ns=>ns.filter(n=>['Red','Blue'].includes(n.textContent.trim())).every(n=>n.getNumberOfChars()===n.textContent.length)), 'spaces in rich runs must be rendered, including at font boundaries');
  await p.evaluate(()=>window.dispatchEvent(new Event('beforeprint')));assert.deepEqual(await styles('#printRoot'),preview);
  await p.locator(id()).focus();await p.keyboard.press('Meta+z');assert.equal(await p.locator(id()).inputValue(),d.notes.sets['body.front'].inL.text);assert(!await p.locator(id('body.front','inL','rich')).isChecked());
  await p.keyboard.press('Meta+Shift+z');assert.equal(await p.locator(id()).inputValue(),pasted);assert(await p.locator(id('body.front','inL','rich')).isChecked());
  await select(id(),'Red');assert(await paste(id(),'bad'));assert.equal(await p.locator(id()).inputValue(),pasted);assert((await p.locator('#toast').textContent()).startsWith('Could not paste RTF:'));
  assert(await paste(id(),'{\\rtf1}'));assert.equal(await p.locator(id()).inputValue(),pasted);assert(await paste(id(),'{\\rtf1 '+picture()+'}'));assert.equal(await p.locator(id()).inputValue(),pasted);assert((await p.locator('#importMessages').textContent()).includes('Pictures'));
  assert.equal(await paste(id(),'ordinary','text/plain'),false);assert.equal(await p.locator(id()).inputValue(),pasted);
  // Rich-note replacement retains the existing surrounding formatting and uses the MIME alias.
  await select(id(),'Blue');assert(await paste(id(),'{\\rtf1\\b Bold}','application/rtf'));const twice=await p.locator(id()).inputValue();assert(twice.includes('Bold'));assert(twice.includes('Red'));
  await p.locator(id()).focus();await p.keyboard.press('Meta+z');assert.equal(await p.locator(id()).inputValue(),pasted);assert(await p.locator(id('body.front','inL','rich')).isChecked());
  const saved=await save(),out=JSON.parse(saved);assert.equal(out.text,d.text);assert.equal(out.assets.length,0);assert.equal(out.images.length,0);assert.deepEqual(out.notes.sets['body.back'],d.notes.sets['body.back']);assert(out.notes.sets['body.front'].inL.rich);assert.equal(out.notes.sets['body.front'].inL.size,21);
  await upload('saved.pecha',saved);await p.waitForFunction(()=>document.querySelector('#toast').textContent==='Opened saved.pecha.');await p.locator('[data-tab="marks"]').click();assert.equal(await p.locator(id()).inputValue(),pasted);assert(await p.locator(id('body.front','inL','rich')).isChecked());
  if(process.env.QA_SCREENSHOT){await p.locator('#noteSide').scrollIntoViewIfNeeded();await p.screenshot({path:process.env.QA_SCREENSHOT,fullPage:true});}
  // Every one of the five positions on each of the six sides receives its own edit.
  for(const side of ['title.front','title.back','fancy.front','fancy.back','body.front','body.back']) {
   await p.locator('#noteSide').selectOption(side);
   for(const key of ['inL','inB','inR','outL','outR']) {
    const selector=id(side,key);await p.locator(selector).evaluate(t=>{t.focus();t.setSelectionRange(0,t.value.length);});assert(await paste(selector,'{\\rtf1\\b '+side+'-'+key+'}'));assert(await p.locator(id(side,key,'rich')).isChecked());
   }
  }
  const all=JSON.parse(await save());
  for(const side of Object.keys(all.notes.sets))for(const key of ['inL','inB','inR','outL','outR']){const slot=all.notes.sets[side][key];assert(slot.on&&slot.rich);assert.equal(E.parseStream(slot.text,false).filter(r=>r.k==='text').map(r=>r.s).join(''),side+'-'+key);}
  assert.equal(all.text,d.text);assert.deepEqual(errors,[]);console.log('PASS: synthetic rich-note clipboard, plain/rich undo modes, errors/empty/images/plain routing, fixed size, preview/print, Save/Open and all 30 side/position slots');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
