const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');
global.PechaImages=require('../src/images');global.Folio=require('../src/folio');
const E=require('../src/engine'),P=require('../src/pxp'),T=require('../src/legacy-table'),{sample}=require('./native-annotation-export-fixture');
const visible=s=>E.parseStream(s,false).filter(r=>r.k==='text').map(r=>r.s).join('');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const p=await browser.newPage({viewport:{width:1440,height:1050}}),errors=[];p.setDefaultTimeout(15000);p.on('pageerror',e=>errors.push(e.message));await p.goto(process.argv[2]);await p.locator('#pasteText').click();
  const upload=async(name,buffer)=>{await p.locator('#toast').evaluate(n=>n.textContent='');await p.locator('#openFile').setInputFiles({name,mimeType:'application/octet-stream',buffer});await p.waitForFunction(()=>document.querySelector('#toast').textContent.length>0);};
  const save=async()=>{const event=p.waitForEvent('download');await p.locator('#saveDoc').click();return fs.readFileSync(await(await event).path());};
  const d=sample(E);await upload('source.pecha',Buffer.from(JSON.stringify(d)));const before=JSON.parse(await save());
  await p.getByText('Reuse text, layouts and annotations',{exact:true}).click();assert(await p.locator('#exportPxa').evaluate(b=>b.getBoundingClientRect().right<=b.parentElement.getBoundingClientRect().right+1),'export label fits the settings panel');const event=p.waitForEvent('download');await p.locator('#exportPxa').click();const download=await event,bytes=fs.readFileSync(await download.path());assert.equal(download.suggestedFilename(),'pecha-annotations.pxa');
  assert(bytes.subarray(0,9).equals(Buffer.from('.pxa 0.1 ')));const parsed=P.parse(bytes);assert.equal(parsed.body.length,0);assert.equal(parsed.nonBody.values.FolioStartNum,'23');assert.equal(parsed.template.PechaAnnotation.AnnoOutRightSpace,'0.450000');assert(Object.values(parsed.nonBody.raw).every(b=>b.length<=256));
  const notes=await p.locator('#exportMessages').textContent();assert(notes.includes('Experimental')&&notes.includes('TCC')&&notes.includes('font choices'));assert.deepEqual(JSON.parse(await save()),before,'export does not mutate source');
  if(process.env.QA_EXPORT_SCREENSHOT)await p.screenshot({path:process.env.QA_EXPORT_SCREENSHOT,fullPage:true});
  const target=E.defaultDoc();target.text='Target body ཀ་';target.paper.w=14;target.counts={title:0,fancy:0};target.yigo.enabled=false;target.dzog.enabled=false;target.pageNum.font='Georgia';
  await upload('target.pecha',Buffer.from(JSON.stringify(target)));await upload('roundtrip.pxa',bytes);assert.equal(await p.locator('#text').inputValue(),target.text);
  const saved=await save(),doc=JSON.parse(saved);assert.equal(doc.paper.w,14);assert(!doc.yigo.enabled);assert.equal(doc.pageNum.font,'Georgia');assert.equal(doc.folio.start,23);assert.equal(doc.pageNum.start,401);assert.equal(doc.notes.outLeft,.3);assert.equal(doc.notes.outRight,.45);assert.equal(visible(doc.folio.rhino),d.folio.rhino);
  for(const side of Object.keys(d.notes.sets))for(const position of ['inL','inR','outL','outR','inB'])assert.equal(visible(doc.notes.sets[side][position].text),d.notes.sets[side][position].rich?visible(d.notes.sets[side][position].text):d.notes.sets[side][position].text);
  await p.waitForFunction(()=>document.querySelector('#table').textContent.includes('Café40'));
  const styles=selector=>p.locator(selector+' text').evaluateAll(ns=>ns.filter(n=>/Café|བཀྲ|Lower|401/.test(n.textContent)).map(n=>[n.textContent,n.getAttribute('font-family'),n.getAttribute('font-size'),n.getAttribute('fill'),n.getAttribute('font-weight'),n.getAttribute('font-style')]));
  const preview=await styles('#table');assert(preview.some(r=>r[0].includes('Café40')&&r[1].includes('Arial')&&r[2]==='12'&&r[3]==='#a02010'&&r[4]==='700'));await p.evaluate(()=>window.dispatchEvent(new Event('beforeprint')));assert.deepEqual(await styles('#printRoot'),preview);
  await upload('saved.pecha',saved);assert.deepEqual(await styles('#table'),preview);
  if(process.env.QA_SCREENSHOT)await p.screenshot({path:process.env.QA_SCREENSHOT,fullPage:true});
  // A rejected export creates no download and preserves the editable source.
  const bad=sample(E);bad.notes.sets['body.front'].inL.text='😀';await upload('unsupported.pecha',Buffer.from(JSON.stringify(bad)));const badBefore=JSON.parse(await save());let downloads=0;p.on('download',()=>downloads++);
  await p.locator('#exportPxa').click();await p.waitForFunction(()=>document.querySelector('#exportMessages').textContent.includes('U+1F600'));assert.equal(downloads,0);assert.deepEqual(JSON.parse(await save()),badBefore);
  bad.notes.sets['body.front'].inL.text='A'.repeat(300);await upload('long.pecha',Buffer.from(JSON.stringify(bad)));downloads=0;await p.locator('#exportPxa').click();await p.waitForFunction(()=>document.querySelector('#exportMessages').textContent.includes('256-byte limit'));assert.equal(downloads,0);
  assert.deepEqual(errors,[]);console.log('PASS: PXA download/format/notes, source isolation, all27 native slots and scope on reimport, counters/spacing/fonts/styles, preview/print, Save/Open, unsupported/oversized rejection without download');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
