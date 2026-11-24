const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');
global.PechaImages=require('../src/images');global.Folio=require('../src/folio');
const E=require('../src/engine'),{picture}=require('./rtf-picture-fixture');
const rtf='{\\rtf1\\ansi{\\fonttbl{\\f0 Courier New;}}{\\colortbl;\\red176\\green48\\blue32;}\\f0\\fs36\\b\\i\\ul\\strike\\cf1 New\\par Line}';
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
  const p=await browser.newPage({viewport:{width:1440,height:1050}}),errors=[];p.setDefaultTimeout(15000);p.on('pageerror',e=>errors.push(e.message));await p.goto(process.argv[2]);await p.locator('#pasteText').click();
  const upload=(name,buffer)=>p.locator('#openFile').setInputFiles({name,mimeType:'application/octet-stream',buffer});
  const base=E.defaultDoc();base.text='{font:noto 24 #123456}Before OLD After';base.counts={title:0,fancy:0};base.yigo.enabled=false;base.dzog.enabled=false;base.flow=true;
  await upload('base.pecha',Buffer.from(JSON.stringify(base)));await p.waitForFunction(()=>document.querySelector('#text').value.includes('OLD'));
  const select=word=>p.locator('#text').evaluate((t,word)=>{t.focus();const start=t.value.indexOf(word);t.setSelectionRange(start,start+word.length);},word);
  const paste=(value,type='text/rtf')=>p.locator('#text').evaluate((t,{value,type})=>{t.focus();const data=new DataTransfer();data.setData('text/plain','plain fallback');data.setData(type,value);const e=new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:data});t.dispatchEvent(e);return e.defaultPrevented;},{value,type});
  await select('OLD');assert(await paste(rtf));const pasted=await p.locator('#text').inputValue();assert(!pasted.includes('OLD'));assert(!pasted.includes('plain fallback'));assert(pasted.includes('\u2028'));
  const runs=E.parseStream(pasted,false).filter(r=>r.k==='text');assert.deepEqual(runs[0].style,runs.at(-1).style);
  await p.waitForFunction(()=>Array.from(document.querySelectorAll('#table text')).some(n=>n.textContent==='New'));
  const styles=selector=>p.locator(selector+' text').evaluateAll(ns=>ns.filter(n=>['New','Line','Before','After'].includes(n.textContent)).map(n=>[n.textContent,n.getAttribute('font-family'),n.getAttribute('font-size'),n.getAttribute('font-weight'),n.getAttribute('font-style'),n.getAttribute('text-decoration'),n.getAttribute('fill')]));
  const preview=await styles('#table');assert(preview.some(([s,f,z,w,i,u,c])=>s==='New'&&f.includes('Courier New')&&z==='18'&&w==='700'&&i==='italic'&&u==='underline line-through'&&c==='#b03020'));
  await p.evaluate(()=>window.dispatchEvent(new Event('beforeprint')));assert.deepEqual(await styles('#printRoot'),preview);
  await p.locator('#text').focus();await p.keyboard.press('Meta+z');assert.equal(await p.locator('#text').inputValue(),base.text);await p.keyboard.press('Meta+Shift+z');assert.equal(await p.locator('#text').inputValue(),pasted);
  await select('New');assert(await paste('bad RTF'));assert.equal(await p.locator('#text').inputValue(),pasted);assert((await p.locator('#toast').textContent()).startsWith('Could not paste RTF:'));
  assert(await paste('{\\rtf1}'));assert.equal(await p.locator('#text').inputValue(),pasted);
  assert.equal(await paste('plain only','text/plain'),false);assert.equal(await p.locator('#text').inputValue(),pasted,'synthetic plain event remains browser-owned');
  // Inline images merge into the current document and survive text undo/redo and saving.
  const imageRtf='{\\rtf1\\ansi '+picture()+'}';await p.locator('#text').evaluate(t=>t.setSelectionRange(t.value.length,t.value.length));assert(await paste(imageRtf,'application/rtf'));await p.waitForFunction(()=>document.querySelectorAll('#table image').length===1);
  const firstId=await p.locator('#table image').getAttribute('data-image-id');assert(firstId.startsWith('paste-image-'));
  await p.locator('#text').focus();await p.keyboard.press('Meta+z');await p.waitForFunction(()=>document.querySelectorAll('#table image').length===0);await p.keyboard.press('Meta+Shift+z');await p.waitForFunction(()=>document.querySelectorAll('#table image').length===1);
  assert(await paste(imageRtf));await p.waitForFunction(()=>document.querySelectorAll('#table image').length===2);
  const saving=p.waitForEvent('download');await p.locator('#saveDoc').click();const saved=fs.readFileSync(await(await saving).path()),doc=JSON.parse(saved);assert.equal(doc.assets.length,1);assert.equal(doc.images.length,2);assert.equal(new Set(doc.images.map(i=>i.id)).size,2);
  await upload('saved.pecha',saved);await p.waitForFunction(()=>document.querySelector('#toast').textContent==='Opened saved.pecha.');assert.equal(await p.locator('#table image').count(),2);
  await p.evaluate(()=>window.dispatchEvent(new Event('beforeprint')));assert.equal(await p.locator('#printRoot image').count(),2);
  if(process.env.QA_SCREENSHOT)await p.screenshot({path:process.env.QA_SCREENSHOT,fullPage:true});
  const volume={...base,text:'',sections:[{name:'One',text:'OLD',folioStart:1,restartLayout:true},{name:'Two',text:'Untouched',folioStart:1,restartLayout:true}]};await upload('volume.pecha',Buffer.from(JSON.stringify(volume)));await p.waitForFunction(()=>document.querySelector('#text').value==='OLD');await select('OLD');assert(await paste(rtf));
  const saveVolume=p.waitForEvent('download');await p.locator('#saveDoc').click();const out=JSON.parse(fs.readFileSync(await(await saveVolume).path()));assert(out.sections[0].text.includes('New'));assert.equal(out.sections[1].text,'Untouched');assert.equal(out.text,'');assert.deepEqual(out.counts,base.counts);
  assert.deepEqual(errors,[]);console.log('PASS: synthetic RTF clipboard events, formatting/restoration, hard paragraphs, preview/print, undo/redo, errors/empty/plain routing, image merge/dedup, Save/Open and active-section scope');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
