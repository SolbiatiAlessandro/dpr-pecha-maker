const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');
global.PechaImages=require('../src/images');global.Folio=require('../src/folio');
const E=require('../src/engine'),R=require('../src/rtf'),T=require('../src/legacy-table'),{fixture,expected}=require('./rtf-unicode-fallback-fixture');
const visible=text=>E.parseStream(text,false).filter(r=>r.k==='text').map(r=>r.s).join('');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
  const p=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];p.setDefaultTimeout(15000);p.on('pageerror',e=>errors.push(e.message));
  await p.goto(process.argv[2]);await p.locator('#pasteText').click();
  const upload=async(name,buffer)=>{await p.locator('#toast').evaluate(n=>n.textContent='');await p.locator('#openFile').setInputFiles({name,mimeType:'application/octet-stream',buffer});await p.waitForFunction(()=>document.querySelector('#toast').textContent.length>0);};
  const save=async()=>{const event=p.waitForEvent('download');await p.locator('#saveDoc').click();return fs.readFileSync(await(await event).path());};
  const base=E.defaultDoc();base.text='OLD';base.counts={title:0,fancy:0};base.yigo.enabled=false;base.dzog.enabled=false;base.notes.sets['body.front'].inL.text='Keep note';
  await upload('base.pecha',Buffer.from(JSON.stringify(base)));await p.waitForFunction(()=>document.querySelector('#text').value==='OLD');
  await upload('unicode.rtf',Buffer.from(fixture));await p.waitForFunction(()=>document.querySelector('#text').value.includes('ཀX'));
  assert.equal(visible(await p.locator('#text').inputValue()),expected);
  const styles=selector=>p.locator(selector+' text').evaluateAll(ns=>ns.filter(n=>/[XYZWQ]/.test(n.textContent)).map(n=>[n.textContent,n.getAttribute('font-family'),+n.getAttribute('font-size'),getComputedStyle(n).fontWeight]));
  await p.waitForFunction(()=>document.querySelector('#table').textContent.includes('ཀX'));
  const preview=await styles('#table');assert.equal(preview.length,5);assert(preview.every(r=>r[1].includes('Arial')&&r[2]===18&&r[3]==='400'),JSON.stringify(preview));assert.deepEqual(preview.map(r=>r[0]),expected.split(' '));
  await p.evaluate(()=>window.dispatchEvent(new Event('beforeprint')));assert.deepEqual(await styles('#printRoot'),preview);
  const saved=await save(),doc=JSON.parse(saved);assert.equal(doc.notes.sets['body.front'].inL.text,'Keep note');assert(!doc.yigo.enabled);assert.deepEqual(doc.paper,base.paper);
  await upload('saved.pecha',saved);await p.waitForFunction(()=>document.querySelector('#toast').textContent==='Opened saved.pecha.');assert.deepEqual(await styles('#table'),preview);
  await p.getByText('Reuse text, layouts and annotations',{exact:true}).click();const event=p.waitForEvent('download');await p.locator('#exportRtf').click();const exported=fs.readFileSync(await(await event).path());
  assert.equal(visible(R.read(exported,E,T).doc.text),expected);await upload('exported.rtf',exported);await p.waitForFunction(()=>document.querySelector('#text').value.includes('ཀX'));assert.deepEqual(await styles('#table'),preview);
  if(process.env.QA_SCREENSHOT)await p.screenshot({path:process.env.QA_SCREENSHOT,fullPage:true});
  await upload('base.pecha',Buffer.from(JSON.stringify(base)));await p.waitForFunction(()=>document.querySelector('#text').value==='OLD');
  const paste=selector=>p.locator(selector).evaluate((t,rtf)=>{t.focus();t.setSelectionRange(0,t.value.length);const clipboardData=new DataTransfer();clipboardData.setData('text/rtf',rtf);t.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData}));},fixture);
  await paste('#text');assert.equal(visible(await p.locator('#text').inputValue()),expected);await p.locator('#text').focus();await p.keyboard.press('Meta+z');assert.equal(await p.locator('#text').inputValue(),'OLD');await p.keyboard.press('Meta+Shift+z');assert.equal(visible(await p.locator('#text').inputValue()),expected);
  await p.locator('[data-tab="marks"]').click();for(const selector of ['#f_yigo_text','#f_folio_rhino','#f_notes_sets_body_front_inL_text']){await paste(selector);assert.equal(visible(await p.locator(selector).inputValue()),expected);}
  const marks=JSON.parse(await save());assert(!marks.yigo.enabled&&!marks.folio.rhinoEnabled);assert.equal(visible(marks.notes.sets['body.front'].inL.text),expected);
  await upload('long-fallback.rtf',Buffer.from('{\\rtf1\\uc64\\u3904'+'?'.repeat(64)+'X}'));await p.waitForFunction(()=>document.querySelector('#text').value.includes('ཀX'));assert.equal(visible(await p.locator('#text').inputValue()),'ཀX');
  assert.deepEqual(errors,[]);console.log('PASS: Unicode fallback file import with controls/binary/ignored and dual groups, intact Tibetan/text/style, preview/print, Save/Open, RTF export, body paste undo/redo, mark destinations and long fallback counts');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
