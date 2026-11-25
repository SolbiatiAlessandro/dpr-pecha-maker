const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');
global.PechaImages=require('../src/images');global.Folio=require('../src/folio');
const E=require('../src/engine'),P=require('../src/pxp'),{cases,sample}=require('./native-charset-export-fixture');
const visible=text=>E.parseStream(text,false).map(r=>r.k==='text'?r.s:r.k==='page'?'\f':'').join('');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{for(const kind of ['pxp','pxc','pxa']){
  const p=await browser.newPage({viewport:{width:1440,height:1100}}),errors=[];p.setDefaultTimeout(15000);p.on('pageerror',e=>errors.push(e.message));
  try{
   await p.goto(process.argv[2]);await p.locator('#pasteText').click();
   const upload=async(name,buffer)=>{await p.locator('#toast').evaluate(n=>n.textContent='');await p.locator('#openFile').setInputFiles({name,mimeType:'application/octet-stream',buffer});await p.waitForFunction(()=>document.querySelector('#toast').textContent.length>0);};
   const save=async()=>{const next=p.waitForEvent('download');await p.locator('#saveDoc').click();return fs.readFileSync(await(await next).path());};
   const d=sample(E);await upload('source.pecha',Buffer.from(JSON.stringify(d)));const before=JSON.parse(await save());
   await p.getByText('Reuse text, layouts and annotations',{exact:true}).click();const button='#export'+kind[0].toUpperCase()+kind.slice(1),next=p.waitForEvent('download');await p.locator(button).click();
   const download=await next,bytes=fs.readFileSync(await download.path());assert(download.suggestedFilename().endsWith('.'+kind));assert((await p.locator('#exportMessages').textContent()).includes('additional Windows font charsets'));assert.deepEqual(JSON.parse(await save()),before);
   const parsed=P.parse(bytes);assert(Object.values(parsed.fontCharsets).includes(161));assert(Object.values(parsed.fontCharsets).includes(177));
   const base=E.defaultDoc();base.text='Keep';base.textSize=40;base.counts={title:0,fancy:0};base.paper={name:'Custom',w:14,h:8.5};
   await upload('target.pecha',Buffer.from(JSON.stringify(base)));await upload('roundtrip.'+kind,bytes);const saved=await save(),got=JSON.parse(saved);
   assert.equal(visible(got.folio.rhino),'Αθήνα');assert.equal(visible(got.notes.sets['body.front'].inL.text),'שלום');assert.equal(got.folio.start,23);assert.equal(got.pageNum.start,401);
   if(kind==='pxa'){assert.equal(got.text,'Keep');assert.equal(got.textSize,40);}else{
    assert.equal(visible(got.text),visible(d.text));assert.equal(visible(got.yigo.text),'Привет');assert.equal(got.textSize,null);
    for(const c of cases){assert(Object.values(parsed.fontCharsets).includes(c.charset));assert((await p.locator('#table').textContent()).includes(c.text));}
   }
   const styles=selector=>p.locator(selector+' text').evaluateAll((nodes,words)=>nodes.filter(n=>words.includes(n.textContent)).map(n=>[n.textContent,n.getAttribute('font-family'),n.getAttribute('font-size'),n.getAttribute('fill'),n.getAttribute('font-weight')]),cases.map(c=>c.text));
   const preview=await styles('#table');if(kind!=='pxa'){assert(preview.some(r=>r[0]==='Łódź'&&r[1].includes('Arial')&&r[2]==='18'&&r[3]==='#c02030'));assert(preview.some(r=>r[0]==='ไทย'&&r[4]==='700'));}
   await p.evaluate(()=>window.dispatchEvent(new Event('beforeprint')));assert.deepEqual(await styles('#printRoot'),preview);
   if(kind==='pxp'){
    const sheets=await p.locator('#printRoot .sheet-print').count(),pdf=await p.pdf({preferCSSPageSize:true,printBackground:true});assert.equal(pdf.subarray(0,5).toString(),'%PDF-');assert.equal((pdf.toString('latin1').match(/\/Type\s*\/Page\b/g)||[]).length,sheets);
    if(process.env.QA_PDF)fs.writeFileSync(process.env.QA_PDF,pdf);if(process.env.QA_SCREENSHOT)await p.screenshot({path:process.env.QA_SCREENSHOT,fullPage:true});
   }
   await upload('saved.pecha',saved);assert.deepEqual(await styles('#table'),preview);
   const bad=sample(E);if(kind==='pxa')bad.folio.rhino='😀';else bad.text='😀';await upload('unsupported.pecha',Buffer.from(JSON.stringify(bad)));let downloads=0;p.on('download',()=>downloads++);await p.locator(button).click();await p.waitForFunction(()=>document.querySelector('#exportMessages').textContent.includes('U+1F600'));assert.equal(downloads,0);
   assert.deepEqual(errors,[]);
  }finally{await p.close();}
 }
 console.log('PASS: actual PXP/PXC/PXA charset exports, warnings, source isolation, body/marks/counters/Tibetan/font styles, correct import scopes, preview/print/PDF, Save/Open and unsupported Unicode no-download rejection');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
