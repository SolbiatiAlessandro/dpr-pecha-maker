const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');
global.PechaImages=require('../src/images');global.Folio=require('../src/folio');
const E=require('../src/engine'),R=require('../src/rtf'),T=require('../src/legacy-table'),{fixture,expected}=require('./rtf-charset.test');
const visible=d=>E.parseStream(d.text,false).filter(r=>r.k==='text').map(r=>r.s).join('');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
  const p=await browser.newPage({viewport:{width:1440,height:1050}}),errors=[];p.setDefaultTimeout(15000);p.on('pageerror',e=>errors.push(e.message));await p.goto(process.argv[2]);await p.locator('#pasteText').click();
  const upload=(name,buffer)=>p.locator('#openFile').setInputFiles({name,mimeType:'application/octet-stream',buffer});
  const save=async()=>{const event=p.waitForEvent('download');await p.locator('#saveDoc').click();return fs.readFileSync(await(await event).path());};
  const base=E.defaultDoc();base.text='OLD';base.counts={title:0,fancy:0};base.yigo.enabled=false;base.dzog.enabled=false;
  await upload('base.pecha',Buffer.from(JSON.stringify(base)));await p.waitForFunction(()=>document.querySelector('#text').value==='OLD');await upload('charsets.rtf',Buffer.from(fixture));await p.waitForFunction(()=>document.querySelector('#text').value.includes('Привет'));assert.equal(visible({text:await p.locator('#text').inputValue()}),expected);
  const styles=selector=>p.locator(selector+' text').evaluateAll(ns=>ns.filter(n=>['Привет','Αβ','Мир','é','Д'].includes(n.textContent)).map(n=>[n.textContent,n.getAttribute('font-family'),+n.getAttribute('font-size'),n.getAttribute('font-weight'),n.getAttribute('font-style')]));
  await p.waitForFunction(()=>document.querySelector('#table').textContent.includes('Привет'));const preview=await styles('#table');assert(preview.some(([s,f,z,b])=>s==='Привет'&&f.includes('Courier New')&&z===18&&b==='700'));assert(preview.some(([s,f,z,b,i])=>s==='Αβ'&&f.includes('Times New Roman')&&z===18&&i==='italic'));assert(preview.some(([s,f,z,b])=>s==='Д'&&f.includes('Courier New')&&z===12&&!b));await p.evaluate(()=>window.dispatchEvent(new Event('beforeprint')));assert.deepEqual(await styles('#printRoot'),preview);
  const saved=await save();await upload('saved.pecha',saved);await p.waitForFunction(()=>document.querySelector('#toast').textContent==='Opened saved.pecha.');assert.deepEqual(await styles('#table'),preview);
  await p.getByText('Reuse text, layouts and annotations',{exact:true}).click();const downloading=p.waitForEvent('download');await p.locator('#exportRtf').click();const exported=fs.readFileSync(await(await downloading).path());assert.equal(visible(R.read(exported,E,T).doc),expected);await upload('exported.rtf',exported);await p.waitForFunction(()=>document.querySelector('#text').value.includes('Привет'));assert.equal(visible({text:await p.locator('#text').inputValue()}),expected);
  if(process.env.QA_SCREENSHOT)await p.screenshot({path:process.env.QA_SCREENSHOT,fullPage:true});
  // The same decoder is used for body paste and all automatic-mark destinations.
  await upload('base.pecha',Buffer.from(JSON.stringify(base)));await p.waitForFunction(()=>document.querySelector('#text').value==='OLD');
  const paste=selector=>p.locator(selector).evaluate((t,rtf)=>{t.focus();t.setSelectionRange(0,t.value.length);const clipboardData=new DataTransfer();clipboardData.setData('text/rtf',rtf);t.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData}));},fixture);
  await paste('#text');assert.equal(visible({text:await p.locator('#text').inputValue()}),expected);await p.locator('#text').focus();await p.keyboard.press('Meta+z');assert.equal(await p.locator('#text').inputValue(),'OLD');await p.keyboard.press('Meta+Shift+z');assert.equal(visible({text:await p.locator('#text').inputValue()}),expected);
  await p.locator('[data-tab="marks"]').click();for(const selector of ['#f_yigo_text','#f_folio_rhino','#f_notes_sets_body_front_inL_text']){await paste(selector);assert.equal(visible({text:await p.locator(selector).inputValue()}),expected);}
  const withMarks=JSON.parse(await save());assert(!withMarks.yigo.enabled&&!withMarks.folio.rhinoEnabled);assert.equal(visible({text:withMarks.yigo.text}),expected);assert.equal(visible({text:withMarks.folio.rhino}),expected);assert.equal(visible({text:withMarks.notes.sets['body.front'].inL.text}),expected);
  await upload('unsupported.rtf',Buffer.from("{\\rtf1{\\fonttbl{\\f0\\fcharset2 Symbol;}}ABC}"));await p.waitForFunction(()=>document.querySelector('#text').value.includes('���'));assert((await p.locator('#importMessages').textContent()).includes('unsupported RTF font charset'));
  await upload('undefined.rtf',Buffer.from("{\\rtf1\\ansicpg1252 \\'81}"));await p.waitForFunction(()=>document.querySelector('#importMessages').textContent.includes('undefined in their character encoding'));assert.equal(visible({text:await p.locator('#text').inputValue()}),'�');
  assert.deepEqual(errors,[]);console.log('PASS: RTF charset file import, mixed-language fonts/styles, preview/print, Save/Open, Unicode RTF export/reimport, body paste undo/redo, all mark destinations and visible unsupported/undefined-byte warnings');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
