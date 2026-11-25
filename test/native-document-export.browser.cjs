const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');
global.PechaImages=require('../src/images');global.Folio=require('../src/folio');
const E=require('../src/engine'),P=require('../src/pxp'),T=require('../src/legacy-table'),{sample}=require('./native-document-export-fixture');
const visible=s=>E.parseStream(s,false).map(r=>r.k==='text'?r.s:r.k==='page'?'\f':'').join('').replace(/\u2028/g,'\n');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const p=await browser.newPage({viewport:{width:1440,height:1050}}),errors=[];p.setDefaultTimeout(15000);p.on('pageerror',e=>errors.push(e.message));await p.goto(process.argv[2]);await p.locator('#pasteText').click();
  const upload=async(name,buffer)=>{await p.locator('#toast').evaluate(n=>n.textContent='');await p.locator('#openFile').setInputFiles({name,mimeType:'application/octet-stream',buffer});await p.waitForFunction(()=>document.querySelector('#toast').textContent.length>0);};
  const save=async()=>{const event=p.waitForEvent('download');await p.locator('#saveDoc').click();return fs.readFileSync(await(await event).path());};
  const d=sample(E);await upload('source.pecha',Buffer.from(JSON.stringify(d)));const before=JSON.parse(await save());
  await p.getByText('Reuse text, layouts and annotations',{exact:true}).click();assert(await p.locator('#exportPxp').evaluate(b=>b.getBoundingClientRect().right<=b.parentElement.getBoundingClientRect().right+1));
  const event=p.waitForEvent('download');await p.locator('#exportPxp').click();const download=await event,bytes=fs.readFileSync(await download.path());assert.equal(download.suggestedFilename(),'pecha-document.pxp');assert(bytes.subarray(0,9).equals(Buffer.from('.pxp 0.6 ')));
  const parsed=P.parse(bytes);assert(parsed.body.length>0);assert.equal(parsed.template.PageSetup['PaperSize.x'],'14000');assert.equal(parsed.fonts[parsed.template.PechaAnnotation.PageNumFIndex],'Verdana');assert.equal(parsed.nonBody.values['Yigo.en'],'1');assert.equal(parsed.nonBody.values.PageStartNum,'401');
  const notes=await p.locator('#exportMessages').textContent();assert(notes.includes('Experimental')&&notes.includes('TCC')&&notes.includes('Web print options'));assert.deepEqual(JSON.parse(await save()),before);
  if(process.env.QA_EXPORT_SCREENSHOT)await p.screenshot({path:process.env.QA_EXPORT_SCREENSHOT,fullPage:true});
  const target=E.defaultDoc();target.text='OLD';target.paper.w=10;target.textSize=50;target.counts={title:0,fancy:0};target.yigo.enabled=false;target.dzog.enabled=false;target.pageNum.font='Georgia';target.pageNum.size=10;target.folio.size=12;target.notes.outLeft=.1;
  await upload('target.pecha',Buffer.from(JSON.stringify(target)));await upload('roundtrip.pxp',bytes);assert.equal(visible(await p.locator('#text').inputValue()),visible(d.text));
  const saved=await save(),doc=JSON.parse(saved);assert.equal(doc.paper.w,14);assert.equal(doc.textSize,null);assert.equal(doc.pageNum.font,'Verdana');assert.equal(doc.pageNum.size,11);assert.equal(doc.folio.size,d.folio.size);assert.equal(doc.notes.outLeft,d.notes.outLeft);assert.deepEqual(doc.margins,d.margins);assert.deepEqual(doc.pecha,d.pecha);assert.equal(doc.types.body.baseline,.45);assert.equal(doc.types.body.color.toLowerCase(),'#1256ab');assert.equal(doc.folio.start,23);assert.equal(doc.pageNum.start,401);assert.deepEqual(doc.shad,d.shad);assert.deepEqual(doc.dzog,d.dzog);assert.equal(visible(doc.yigo.text),visible(d.yigo.text));
  for(const side of Object.keys(d.notes.sets))for(const position of ['inL','inR','outL','outR','inB'])assert.equal(visible(doc.notes.sets[side][position].text),d.notes.sets[side][position].rich?visible(d.notes.sets[side][position].text):d.notes.sets[side][position].text);
  await p.waitForFunction(()=>document.querySelector('#table').textContent.includes('Third'));
  const styles=selector=>p.locator(selector+' text').evaluateAll(ns=>ns.filter(n=>/Café|Second|Third|ཀི/.test(n.textContent)).map(n=>[n.textContent,n.getAttribute('font-family'),n.getAttribute('font-size'),n.getAttribute('fill'),n.getAttribute('font-weight'),n.getAttribute('font-style')]));
  const preview=await styles('#table');assert(preview.some(r=>r[0]==='Café'&&r[1].includes('Arial')&&r[2]==='18'&&r[3]==='#c02030'&&r[4]==='700'));assert(preview.some(r=>r[0]==='Second'&&r[1].includes('Georgia')&&r[2]==='15'&&r[5]==='italic'));
  await p.evaluate(()=>window.dispatchEvent(new Event('beforeprint')));assert.deepEqual(await styles('#printRoot'),preview);
  const sheetCount=await p.locator('#printRoot .sheet-print').count();assert(sheetCount>0);
  await p.emulateMedia({media:'print'});assert.equal(await p.locator('.app').evaluate(n=>getComputedStyle(n).display),'none');
  const pdf=await p.pdf({preferCSSPageSize:true,printBackground:true});assert.equal(pdf.subarray(0,5).toString(),'%PDF-');assert(pdf.length>5000);assert.equal((pdf.toString('latin1').match(/\/Type\s*\/Page\b/g)||[]).length,sheetCount);
  const boxes=[...pdf.toString('latin1').matchAll(/\/MediaBox\s*\[0 0 ([\d.]+) ([\d.]+)\]/g)];assert(boxes.length>0);assert(boxes.every(m=>Math.abs(+m[1]-1008)<1&&Math.abs(+m[2]-612)<1));
  if(process.env.QA_PDF)fs.writeFileSync(process.env.QA_PDF,pdf);
  await p.emulateMedia({media:'screen'});
  await upload('saved.pecha',saved);assert.deepEqual(await styles('#table'),preview);
  if(process.env.QA_SCREENSHOT)await p.screenshot({path:process.env.QA_SCREENSHOT,fullPage:true});
  const bad=sample(E);bad.text='😀';await upload('unsupported.pecha',Buffer.from(JSON.stringify(bad)));const badBefore=JSON.parse(await save());let downloads=0;p.on('download',()=>downloads++);
  await p.locator('#exportPxp').click();await p.waitForFunction(()=>document.querySelector('#exportMessages').textContent.includes('U+1F600'));assert.equal(downloads,0);assert.deepEqual(JSON.parse(await save()),badBefore);
  bad.text='{image:missing}';await upload('image.pecha',Buffer.from(JSON.stringify(bad)));downloads=0;await p.locator('#exportPxp').click();await p.waitForFunction(()=>document.querySelector('#exportMessages').textContent.includes('image reference'));assert.equal(downloads,0);
  assert.deepEqual(errors,[]);console.log('PASS: PXP download/layout/font reference, nonmutation, body and all27 notes, geometry/counters/automatic marks, text-size override reset, preview-print and physical PDF size/count, Save/Open and no-download unsupported/image rejection');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
