const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');
global.PechaImages=require('../src/images');global.Folio=require('../src/folio');
const E=require('../src/engine'),{cases,rtf,sample}=require('./legacy-table-integrity-fixture');
const visible=text=>E.parseStream(text,false).filter(r=>r.k==='text').map(r=>r.s).join('').replace(/\u2028/g,'\n');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const p=await browser.newPage({viewport:{width:1440,height:1050}}),errors=[];p.setDefaultTimeout(15000);p.on('pageerror',e=>errors.push(e.message));await p.goto(process.argv[2]);await p.locator('#pasteText').click();
  const upload=async(name,buffer)=>{await p.locator('#toast').evaluate(n=>n.textContent='');await p.locator('#openFile').setInputFiles({name,mimeType:'application/octet-stream',buffer});await p.waitForFunction(()=>document.querySelector('#toast').textContent.length>0);};
  const save=async()=>{const event=p.waitForEvent('download');await p.locator('#saveDoc').click();return fs.readFileSync(await(await event).path());};
  const base=E.defaultDoc();base.text='KEEP';base.counts={title:0,fancy:0};base.yigo.enabled=false;base.dzog.enabled=false;base.types.body.lines=4;base.folio.start=23;base.pageNum.start=401;
  for(const extension of ['pxp','pxc','pxa']){
   await upload('base.pecha',Buffer.from(JSON.stringify(base)));await upload('unresolved.'+extension,sample(extension,true));
   assert.equal(visible(await p.locator('#text').inputValue()),extension==='pxa'?'KEEP':cases.map(([,a,b])=>a+b).join('\n'));
   const notes=await p.locator('#importMessages').textContent();assert(notes.includes('annotation or yi-go characters could not be converted'));
   if(extension!=='pxa')assert(notes.includes('14 characters use an unsupported font'));
   assert(!(await p.locator('#table').textContent()).includes('Ededris-'));
  }
  const annotations=JSON.parse(await save());assert.equal(visible(annotations.notes.sets['body.front'].inL.text),'ཀཁ');assert.equal(visible(annotations.folio.rhino),'ཀཁ');
  await upload('base.pecha',Buffer.from(JSON.stringify(base)));await upload('unresolved.rtf',Buffer.from(rtf()));
  const expected=cases.map(([,a,b])=>a+'�'+b).join('\n');assert.equal(visible(await p.locator('#text').inputValue()),expected);
  assert((await p.locator('#importMessages').textContent()).includes('could not be mapped'));await p.waitForFunction(()=>document.querySelector('#table').textContent.includes('ཀ�ཁ'));
  const layout=()=>p.locator('#table svg text').evaluateAll(ns=>ns.map(n=>[n.textContent,n.getAttribute('x'),n.getAttribute('y'),n.getAttribute('font-family'),n.getAttribute('font-size'),n.getAttribute('font-weight')]));
  const before=await layout(),saved=await save();assert(!saved.toString().includes('Ededris-a,35'));await upload('saved.pecha',saved);assert.deepEqual(await layout(),before);
  await p.getByText('Reuse text, layouts and annotations',{exact:true}).click();const event=p.waitForEvent('download');await p.locator('#exportRtf').click();await upload('exported.rtf',fs.readFileSync(await(await event).path()));
  assert.equal(visible(await p.locator('#text').inputValue()),expected);assert.deepEqual(await layout(),before);
  await p.evaluate(()=>window.dispatchEvent(new Event('beforeprint')));
  const glyphs=selector=>p.locator(selector+' text').evaluateAll(ns=>ns.filter(n=>n.textContent.includes('�')).map(n=>[n.textContent,n.getAttribute('font-family'),n.getAttribute('font-size'),n.getAttribute('font-weight')]).sort((a,b)=>a[0].localeCompare(b[0])));
  assert.deepEqual(await glyphs('#printRoot'),await glyphs('#table'));assert.equal((await p.locator('#table').textContent()).split('�').length-1,14);
  assert((await p.locator('#printRoot').textContent()).includes('401'));assert(!(await p.locator('#printRoot').textContent()).includes('Ededris-'));
  const pdf=await p.pdf({preferCSSPageSize:true,printBackground:true});assert.equal(pdf.subarray(0,5).toString(),'%PDF-');assert.equal((pdf.toString('latin1').match(/\/Type\s*\/Page\b/g)||[]).length,await p.locator('#printRoot .sheet-print').count());
  if(process.env.QA_PDF)fs.writeFileSync(process.env.QA_PDF,pdf);if(process.env.QA_SCREENSHOT)await p.screenshot({path:process.env.QA_SCREENSHOT,fullPage:true});
  await upload('base.pecha',Buffer.from(JSON.stringify(base)));await p.locator('#text').evaluate((t,source)=>{t.focus();t.setSelectionRange(0,t.value.length);const clipboardData=new DataTransfer();clipboardData.setData('text/rtf',source);t.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData}));},rtf());
  assert.equal(visible(await p.locator('#text').inputValue()),expected);assert((await p.locator('#importMessages').textContent()).includes('could not be mapped'));
  await p.locator('#text').press('Meta+z');assert.equal(await p.locator('#text').inputValue(),'KEEP');await p.locator('#text').press('Meta+Shift+z');assert.equal(visible(await p.locator('#text').inputValue()),expected);
  assert.deepEqual(errors,[]);console.log('PASS: actual PXP/PXC/PXA and RTF uploads, explicit unknown warnings, neighboring Tibetan/marks and partial-file scope, no CSV expansion, Save/RTF measured layout, print/PDF and paste undo/redo');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
