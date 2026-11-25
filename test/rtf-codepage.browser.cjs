const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');
global.PechaImages=require('../src/images');global.Folio=require('../src/folio');
const E=require('../src/engine'),R=require('../src/rtf'),T=require('../src/legacy-table'),{fixture}=require('./rtf-codepage-fixture');
const visible=text=>E.parseStream(text,false).filter(r=>r.k==='text').map(r=>r.s).join('');
const tibetan=T.TibetanMachine[107],expected='Привет Café 日本語 '+tibetan;
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
  const p=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];p.setDefaultTimeout(15000);p.on('pageerror',e=>errors.push(e.message));
  await p.goto(process.argv[2]);await p.locator('#pasteText').click();
  const upload=async(name,buffer)=>{await p.locator('#toast').evaluate(n=>n.textContent='');await p.locator('#openFile').setInputFiles({name,mimeType:'application/octet-stream',buffer});await p.waitForFunction(()=>document.querySelector('#toast').textContent.length>0);};
  const save=async()=>{const event=p.waitForEvent('download');await p.locator('#saveDoc').click();return fs.readFileSync(await(await event).path());};
  const base=E.defaultDoc();base.text='OLD';base.counts={title:0,fancy:0};base.yigo.enabled=false;base.dzog.enabled=false;base.notes.sets['body.front'].inL.text='Keep note';
  await upload('base.pecha',Buffer.from(JSON.stringify(base)));await p.waitForFunction(()=>document.querySelector('#text').value==='OLD');
  await upload('codepage.rtf',Buffer.from(fixture));await p.waitForFunction(()=>document.querySelector('#text').value.includes('Привет'));
  assert.equal(visible(await p.locator('#text').inputValue()),expected);
  const styles=selector=>p.locator(selector+' text').evaluateAll((ns,words)=>ns.filter(n=>words.includes(n.textContent)).map(n=>[n.textContent,n.getAttribute('font-family'),+n.getAttribute('font-size'),n.getAttribute('font-weight'),n.getAttribute('font-style')]),['Привет','Café','日本語',tibetan]);
  await p.waitForFunction(()=>document.querySelector('#table').textContent.includes('Привет'));
  const preview=await styles('#table');assert.equal(preview.length,4);
  assert(preview.some(r=>r[0]==='Привет'&&r[1].includes('Courier New')&&r[2]===18&&r[3]==='700'));
  assert(preview.some(r=>r[0]==='Café'&&r[1].includes('Arial')&&r[2]===18&&r[4]==='italic'));
  assert(preview.some(r=>r[0]==='日本語'&&r[1].includes('Arial')&&r[2]===18));
  assert(preview.some(r=>r[0]===tibetan&&r[1].includes('Jomolhari')&&r[2]===12));
  await p.evaluate(()=>window.dispatchEvent(new Event('beforeprint')));assert.deepEqual(await styles('#printRoot'),preview);
  const saved=await save(),doc=JSON.parse(saved);assert.equal(doc.notes.sets['body.front'].inL.text,'Keep note');assert(!doc.yigo.enabled);assert.deepEqual(doc.paper,base.paper);
  await upload('saved.pecha',saved);await p.waitForFunction(()=>document.querySelector('#toast').textContent==='Opened saved.pecha.');assert.deepEqual(await styles('#table'),preview);
  await p.getByText('Reuse text, layouts and annotations',{exact:true}).click();const event=p.waitForEvent('download');await p.locator('#exportRtf').click();const exported=fs.readFileSync(await(await event).path());
  assert.equal(visible(R.read(exported,E,T).doc.text),expected);await upload('exported.rtf',exported);await p.waitForFunction(()=>document.querySelector('#text').value.includes('Привет'));assert.deepEqual(await styles('#table'),preview);
  if(process.env.QA_SCREENSHOT)await p.screenshot({path:process.env.QA_SCREENSHOT,fullPage:true});
  await upload('base.pecha',Buffer.from(JSON.stringify(base)));await p.waitForFunction(()=>document.querySelector('#text').value==='OLD');
  const paste=selector=>p.locator(selector).evaluate((t,rtf)=>{t.focus();t.setSelectionRange(0,t.value.length);const clipboardData=new DataTransfer();clipboardData.setData('text/rtf',rtf);t.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData}));},fixture);
  await paste('#text');assert.equal(visible(await p.locator('#text').inputValue()),expected);await p.locator('#text').focus();await p.keyboard.press('Meta+z');assert.equal(await p.locator('#text').inputValue(),'OLD');await p.keyboard.press('Meta+Shift+z');assert.equal(visible(await p.locator('#text').inputValue()),expected);
  await p.locator('[data-tab="marks"]').click();for(const selector of ['#f_yigo_text','#f_folio_rhino','#f_notes_sets_body_front_inL_text']){await paste(selector);assert.equal(visible(await p.locator(selector).inputValue()),expected);}
  const marks=JSON.parse(await save());assert(!marks.yigo.enabled&&!marks.folio.rhinoEnabled);assert.equal(visible(marks.notes.sets['body.front'].inL.text),expected);
  await upload('unsupported.rtf',Buffer.from(String.raw`{\rtf1{\fonttbl{\f0\fcharset0\cpg99999 Arial;}}\'e9}`));assert.equal(visible(await p.locator('#text').inputValue()),'�');assert((await p.locator('#importMessages').textContent()).includes('unsupported RTF font charset'));
  assert.deepEqual(errors,[]);console.log('PASS: RTF explicit font code pages through file import, expected named fonts/styles/legacy Tibetan conversion, preview/print, Save/Open, Unicode export/reimport, body paste undo/redo and three mark destinations');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
