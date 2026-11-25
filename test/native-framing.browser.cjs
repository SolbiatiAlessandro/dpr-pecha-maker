const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');
global.PechaImages=require('../src/images');global.Folio=require('../src/folio');
const E=require('../src/engine'),{sample,markerText}=require('./native-framing-fixture');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
  const p=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
  p.setDefaultTimeout(15000);p.on('pageerror',e=>errors.push(e.message));
  await p.goto(process.argv[2]);await p.locator('#pasteText').click();
  const upload=(name,buffer)=>p.locator('#openFile').setInputFiles({name,mimeType:'application/octet-stream',buffer});
  const opened=name=>p.waitForFunction(name=>document.querySelector('#toast').textContent.includes('Opened '+name),name);
  const save=async(hidden=false)=>{const event=p.waitForEvent('download');if(hidden)await p.locator('#saveDoc').evaluate(b=>b.click());else await p.locator('#saveDoc').click();return fs.readFileSync(await(await event).path());};
  const drawing=root=>p.locator(root+' svg').first().evaluate(svg=>Array.from(svg.querySelectorAll('text,rect,line')).map(n=>[n.tagName,n.textContent,...Array.from(n.attributes).map(a=>[a.name,a.value])]));
  const base=E.defaultDoc();base.text='Retained ཀ་';base.sections=[{name:'Keep',text:'Section ཀ་'}];base.counts={title:0,fancy:0};base.paper.w=14;base.notes.outLeft=.06;base.notes.outRight=.08;base.yigo.enabled=false;base.print.cutMarks=false;
  await upload('base.pecha',Buffer.from(JSON.stringify(base)));await opened('base.pecha');
  const original=JSON.parse(await save());
  await p.getByRole('tab',{name:'Marks',exact:true}).click();
  for(const nl of ['\n','\r\n']){
   await upload('base.pecha',Buffer.from(JSON.stringify(original)));await opened('base.pecha');
   await upload('notes.pxa',sample({nl}));await p.waitForFunction(()=>document.querySelector('#f_notes_outLeft').value==='0.3');
   assert.equal(await p.locator('#f_notes_outLeft').inputValue(),'0.3');assert.equal(await p.locator('#f_notes_outRight').inputValue(),'0.45');
   await p.waitForFunction(()=>Array.from(document.querySelectorAll('#table text')).some(n=>n.textContent==='Outside left'));
   const saved=await save(),doc=JSON.parse(saved);
   assert.equal(doc.text,original.text);assert.deepEqual(doc.sections,original.sections);assert.deepEqual(doc.paper,original.paper);assert.deepEqual(doc.types,original.types);assert.deepEqual(doc.yigo,original.yigo);
   assert.equal(doc.folio.start,23);assert.equal(doc.pageNum.start,401);assert.equal(doc.notes.outLeft,.3);assert.equal(doc.notes.outRight,.45);
   assert(doc.notes.sets['title.front'].inL.text.includes(markerText.replace(/\n/g,' ')));
   const box=E.boxes(doc,doc.types.body).O;
   const rects=await p.locator('#table svg').first().locator('rect').evaluateAll(ns=>ns.map(n=>({x:+n.getAttribute('x'),width:+n.getAttribute('width')})));
   assert(rects.some(r=>Math.abs(r.x-box.x0)<.01&&Math.abs(r.width-(box.x1-box.x0))<.01),'outside spacing changes the rendered outer frame');
   const preview=await drawing('#table');await p.evaluate(()=>window.dispatchEvent(new Event('beforeprint')));assert.deepEqual(await drawing('#printRoot'),preview);
   await upload('saved.pecha',saved);await opened('saved.pecha');assert.deepEqual(await drawing('#table'),preview);
  }
  if(process.env.QA_SCREENSHOT)await p.screenshot({path:process.env.QA_SCREENSHOT,fullPage:true});
  const before=JSON.parse(await save()),bytes=sample();bytes[bytes.lastIndexOf('[END NON-BODY]')]=65;
  await upload('invalid.pxa',bytes);await p.waitForFunction(()=>document.querySelector('#startStatus').textContent.includes('Could not read invalid.pxa'));
  assert.deepEqual(JSON.parse(await save(true)),before,'failed import preserves the entire current document');
  const body='[START TEMPLATE]\n[END TEMPLATE]\n[START IMAGES] 1.1\nImageInfoCount=1\nLiteral body';
  await upload('literal.pxc',sample({extension:'pxc',body,template:false}));await p.waitForFunction(()=>document.querySelector('#text').value.includes('Literal body'));
  assert.equal(E.parseStream(await p.locator('#text').inputValue(),false).filter(r=>r.k==='text').map(r=>r.s).join('').replace(/\u2028/g,'\n'),body);
  const content=JSON.parse(await save());assert.deepEqual(content.sections,[]);assert.deepEqual(content.paper,original.paper);assert.equal(content.notes.outLeft,.3);assert.equal(content.notes.outRight,.45);
  assert.deepEqual(errors,[]);console.log('PASS: PXA LF/CRLF file imports, literal raw markers, annotation spacing/frame geometry, retained content/layout/yi-go, numbering, preview/print, Save/Open, malformed-file isolation, PXC literal body and layout scope');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
