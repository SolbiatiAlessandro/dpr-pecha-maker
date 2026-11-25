const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');
global.PechaImages=require('../src/images');global.Folio=require('../src/folio');
const E=require('../src/engine'),R=require('../src/rtf'),T=require('../src/legacy-table'),{fixture,expected,hiddenPicture}=require('./rtf-hidden-fixture');
const visible=text=>E.parseStream(text,false).filter(r=>r.k==='text').map(r=>r.s).join('');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const p=await browser.newPage({viewport:{width:1440,height:1050}}),errors=[];p.setDefaultTimeout(15000);p.on('pageerror',e=>errors.push(e.message));await p.goto(process.argv[2]);await p.locator('#pasteText').click();
  const upload=async(name,buffer)=>{await p.locator('#toast').evaluate(n=>n.textContent='');await p.locator('#openFile').setInputFiles({name,mimeType:'application/octet-stream',buffer});await p.waitForFunction(()=>document.querySelector('#toast').textContent.length>0);};
  const save=async()=>{const event=p.waitForEvent('download');await p.locator('#saveDoc').click();return fs.readFileSync(await(await event).path());};
  const base=E.defaultDoc();base.text='OLD';base.counts={title:0,fancy:0};base.yigo.enabled=false;base.dzog.enabled=false;
  await upload('base.pecha',Buffer.from(JSON.stringify(base)));await upload('hidden.rtf',Buffer.from(fixture(),'latin1'));
  assert.equal(visible(await p.locator('#text').inputValue()),expected);assert((await p.locator('#importMessages').textContent()).includes('Hidden RTF content was omitted'));
  await p.waitForFunction(()=>document.querySelector('#table').textContent.includes('Visible'));assert.equal(await p.locator('#table svg').count(),1);assert.equal(await p.locator('#table image').count(),1);assert(!(await p.locator('#table').textContent()).includes('HIDDEN'));
  const styles=selector=>p.locator(selector+' text').evaluateAll(ns=>ns.filter(n=>['Visible','Shown'].includes(n.textContent)).map(n=>[n.textContent,n.getAttribute('font-family'),n.getAttribute('font-size'),n.getAttribute('fill'),n.getAttribute('font-weight'),n.getAttribute('font-style')]));
  const preview=await styles('#table');assert(preview.some(r=>r[0]==='Visible'&&r[1].includes('Arial')&&r[2]==='18'&&r[3]==='#b03020'&&r[4]==='700'));assert(preview.some(r=>r[0]==='Shown'&&r[5]==='italic'));
  await p.evaluate(()=>window.dispatchEvent(new Event('beforeprint')));assert.deepEqual(await styles('#printRoot'),preview);assert.equal(await p.locator('#printRoot image').count(),1);assert(!(await p.locator('#printRoot').textContent()).includes('HIDDEN'));
  const pdf=await p.pdf({preferCSSPageSize:true,printBackground:true});assert.equal(pdf.subarray(0,5).toString(),'%PDF-');assert.equal((pdf.toString('latin1').match(/\/Type\s*\/Page\b/g)||[]).length,await p.locator('#printRoot .sheet-print').count());if(process.env.QA_PDF)fs.writeFileSync(process.env.QA_PDF,pdf);
  if(process.env.QA_SCREENSHOT)await p.screenshot({path:process.env.QA_SCREENSHOT,fullPage:true});
  const saved=await save(),doc=JSON.parse(saved);assert.equal(doc.assets.length,1);assert.equal(doc.images.length,1);assert(!saved.toString().includes('HIDDEN'));await upload('saved.pecha',saved);assert.deepEqual(await styles('#table'),preview);
  await p.getByText('Reuse text, layouts and annotations',{exact:true}).click();const downloading=p.waitForEvent('download');await p.locator('#exportRtf').click();const exported=fs.readFileSync(await(await downloading).path());assert.equal(visible(R.read(exported,E,T).doc.text),expected);assert(!exported.toString().includes('HIDDEN'));
  await upload('visible.rtf',exported);assert.equal(visible(await p.locator('#text').inputValue()),expected);assert.equal(JSON.parse(await save()).images.length,1);
  await upload('base.pecha',Buffer.from(JSON.stringify(base)));
  const paste=(selector,rtf)=>p.locator(selector).evaluate((t,rtf)=>{t.focus();t.setSelectionRange(0,t.value.length);const clipboardData=new DataTransfer();clipboardData.setData('text/rtf',rtf);t.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData}));},rtf);
  await paste('#text',fixture());const typed=await p.locator('#text').inputValue();assert.equal(visible(typed),expected);await p.locator('#text').focus();await p.keyboard.press('Meta+z');assert.equal(await p.locator('#text').inputValue(),'OLD');await p.keyboard.press('Meta+Shift+z');assert.equal(await p.locator('#text').inputValue(),typed);
  const hidden='{\\rtf1\\v HIDDEN\\page'+hiddenPicture()+'}';await paste('#text',hidden);assert.equal(await p.locator('#text').inputValue(),typed);assert((await p.locator('#importMessages').textContent()).includes('Hidden RTF'));
  await p.locator('[data-tab="marks"]').click();for(const selector of ['#f_yigo_text','#f_folio_rhino','#f_notes_sets_body_front_inL_text']){await paste(selector,fixture());assert.equal(visible(await p.locator(selector).inputValue()),expected);const before=await p.locator(selector).inputValue();await paste(selector,hidden);assert.equal(await p.locator(selector).inputValue(),before);}
  assert.deepEqual(errors,[]);console.log('PASS: hidden-content file import and notice, preserved visible styles/Tibetan/image, no hidden pages/assets, preview/print/PDF, Save/RTF, body paste undo/redo, hidden-only selection retention and three mark destinations');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
