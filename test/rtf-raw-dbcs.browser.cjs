const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');
global.PechaImages=require('../src/images');global.Folio=require('../src/folio');
const E=require('../src/engine'),R=require('../src/rtf'),T=require('../src/legacy-table'),{fixture,expected,cases}=require('./rtf-raw-dbcs-fixture');
const visible=text=>E.parseStream(text,false).filter(r=>r.k==='text').map(r=>r.s).join('');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
  const p=await browser.newPage({viewport:{width:1440,height:1050}}),errors=[];p.setDefaultTimeout(15000);p.on('pageerror',e=>errors.push(e.message));await p.goto(process.argv[2]);await p.locator('#pasteText').click();
  const upload=(name,buffer)=>p.locator('#openFile').setInputFiles({name,mimeType:'application/octet-stream',buffer});
  const save=async()=>{const event=p.waitForEvent('download');await p.locator('#saveDoc').click();return fs.readFileSync(await(await event).path());};
  const base=E.defaultDoc();base.text='OLD';base.counts={title:0,fancy:0};base.yigo.enabled=false;base.dzog.enabled=false;
  await upload('base.pecha',Buffer.from(JSON.stringify(base)));await p.waitForFunction(()=>document.querySelector('#text').value==='OLD');await upload('raw-dbcs.rtf',Buffer.from(fixture,'latin1'));await p.waitForFunction(()=>document.querySelector('#text').value.includes('本ソ±'));assert.equal(visible(await p.locator('#text').inputValue()),expected);
  const styles=selector=>p.locator(selector+' text').evaluateAll((ns,words)=>ns.filter(n=>words.includes(n.textContent)).map(n=>[n.textContent,n.getAttribute('font-family'),+n.getAttribute('font-size'),n.getAttribute('font-weight'),n.getAttribute('font-style')]),cases.map(c=>c.text));
  await p.waitForFunction(()=>document.querySelector('#table').textContent.includes('本ソ±'));const preview=await styles('#table');assert.equal(preview.length,3);assert(preview.every(r=>r[1].includes('Arial')&&r[2]===18));assert(preview.find(r=>r[0]==='乗亄亇')[3]==='700');assert(preview.find(r=>r[0]==='﹏﹃﹙')[4]==='italic');await p.evaluate(()=>window.dispatchEvent(new Event('beforeprint')));assert.deepEqual(await styles('#printRoot'),preview);
  const sheets=await p.locator('#printRoot .sheet-print').count(),pdf=await p.pdf({preferCSSPageSize:true,printBackground:true});assert.equal(pdf.subarray(0,5).toString(),'%PDF-');assert.equal((pdf.toString('latin1').match(/\/Type\s*\/Page\b/g)||[]).length,sheets);if(process.env.QA_PDF)fs.writeFileSync(process.env.QA_PDF,pdf);
  const saved=await save();await upload('saved.pecha',saved);await p.waitForFunction(()=>document.querySelector('#toast').textContent==='Opened saved.pecha.');assert.deepEqual(await styles('#table'),preview);
  await p.getByText('Reuse text, layouts and annotations',{exact:true}).click();const downloading=p.waitForEvent('download');await p.locator('#exportRtf').click();const exported=fs.readFileSync(await(await downloading).path());assert.equal(visible(R.read(exported,E,T).doc.text),expected);await upload('exported.rtf',exported);await p.waitForFunction(()=>document.querySelector('#text').value.includes('本ソ±'));assert.equal(visible(await p.locator('#text').inputValue()),expected);
  if(process.env.QA_SCREENSHOT)await p.screenshot({path:process.env.QA_SCREENSHOT,fullPage:true});
  await upload('base.pecha',Buffer.from(JSON.stringify(base)));await p.waitForFunction(()=>document.querySelector('#text').value==='OLD');
  const paste=selector=>p.locator(selector).evaluate((t,rtf)=>{t.focus();t.setSelectionRange(0,t.value.length);const clipboardData=new DataTransfer();clipboardData.setData('text/rtf',rtf);t.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData}));},fixture);
  await paste('#text');assert.equal(visible(await p.locator('#text').inputValue()),expected);await p.locator('#text').focus();await p.keyboard.press('Meta+z');assert.equal(await p.locator('#text').inputValue(),'OLD');await p.keyboard.press('Meta+Shift+z');assert.equal(visible(await p.locator('#text').inputValue()),expected);
  await p.locator('[data-tab="marks"]').click();for(const selector of ['#f_yigo_text','#f_folio_rhino','#f_notes_sets_body_front_inL_text']){await paste(selector);assert.equal(visible(await p.locator(selector).inputValue()),expected.replace(/\u2028/g,' '));}
  const marks=JSON.parse(await save());assert(!marks.yigo.enabled&&!marks.folio.rhinoEnabled);assert.equal(visible(marks.yigo.text),expected.replace(/\u2028/g,' '));assert.equal(visible(marks.folio.rhino),expected.replace(/\u2028/g,' '));assert.equal(visible(marks.notes.sets['body.front'].inL.text),expected.replace(/\u2028/g,' '));
  assert.deepEqual(errors,[]);console.log('PASS: raw RTF-J file import, syntax-valued DBCS trails, fonts/styles/Tibetan, preview/print/PDF, Save/Open, Unicode RTF roundtrip, body paste undo/redo and mark destinations');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
