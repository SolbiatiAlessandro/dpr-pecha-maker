const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');
global.PechaImages=require('../src/images');global.Folio=require('../src/folio');
const E=require('../src/engine'),{sample,text,native}=require('./native-mac-roman-fixture');
const visible=s=>E.parseStream(s,false).filter(r=>r.k==='text').map(r=>r.s).join('');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{for(const kind of ['pxp','pxc','pxa']){
  const p=await browser.newPage({viewport:{width:1440,height:1100}}),errors=[];p.setDefaultTimeout(15000);p.on('pageerror',e=>errors.push(e.message));
  try{
   await p.goto(process.argv[2]);await p.locator('#pasteText').click();
   const upload=async(name,buffer)=>{await p.locator('#toast').evaluate(n=>n.textContent='');await p.locator('#openFile').setInputFiles({name,mimeType:'application/octet-stream',buffer});await p.waitForFunction(()=>document.querySelector('#toast').textContent.length>0);};
   const save=async()=>{const next=p.waitForEvent('download');await p.locator('#saveDoc').click();return fs.readFileSync(await(await next).path());};
   const base=E.defaultDoc();base.text='ཀ KEEP';base.counts={title:0,fancy:0};base.yigo.enabled=false;base.dzog.enabled=false;
   await upload('base.pecha',Buffer.from(JSON.stringify(base)));await upload('mac.'+kind,sample(kind));
   const saved=await save(),got=JSON.parse(saved);assert.equal(visible(got.text),kind==='pxa'?'ཀ KEEP':text);assert.equal(visible(got.notes.sets['body.front'].inL.text),text);assert.equal(visible(got.folio.rhino),text);
   if(kind!=='pxa')assert.equal(visible(got.yigo.text),text);
   const report=await p.locator('#importMessages').textContent();assert(!report.includes('unsupported'));assert(!report.includes('�'));
   await p.waitForFunction(word=>document.querySelector('#table').textContent.includes(word),text);
   const glyphs=selector=>p.locator(selector+' text').evaluateAll((ns,word)=>ns.filter(n=>n.textContent.includes(word)).map(n=>[n.textContent,n.getAttribute('font-family'),n.getAttribute('font-size'),n.getAttribute('font-weight')]),text);
   const preview=await glyphs('#table');assert(preview.some(r=>r[1].includes('Times New Roman')&&r[3]==='700'));
   if(kind!=='pxa')assert(preview.some(r=>r[2]==='24'));
   await upload('saved.pecha',saved);assert.deepEqual(await glyphs('#table'),preview);
   await p.locator('.tabs button[data-tab="marks"]').click();await p.locator('#f_folio_rhinoEnabled').uncheck();await p.locator('#f_folio_start').fill('23');await p.locator('#f_folio_onTitle').check();await p.locator('#f_pageNum_start').fill('401');await p.locator('#f_pageNum_onTitle').check();await p.locator('.tabs button[data-tab="text"]').click();
   await p.waitForFunction(()=>document.querySelector('#table').textContent.includes('401'));
   await p.evaluate(()=>window.dispatchEvent(new Event('beforeprint')));assert.deepEqual(await glyphs('#printRoot'),await glyphs('#table'));assert((await p.locator('#printRoot').textContent()).includes('401'));assert((await p.locator('#printRoot').textContent()).includes('ཉི་ཤུ་རྩ་གསུམ་'));
   if(kind==='pxp'){
    const pdf=await p.pdf({preferCSSPageSize:true,printBackground:true});assert.equal(pdf.subarray(0,5).toString(),'%PDF-');if(process.env.QA_PDF)fs.writeFileSync(process.env.QA_PDF,pdf);if(process.env.QA_SCREENSHOT)await p.screenshot({path:process.env.QA_SCREENSHOT,fullPage:true});
    await p.getByText('Reuse text, layouts and annotations',{exact:true}).click();const next=p.waitForEvent('download');await p.locator('#exportRtf').click();await upload('mac.rtf',fs.readFileSync(await(await next).path()));assert.equal(visible(await p.locator('#text').inputValue()),text);
    await upload('private-symbol.pxp',native({fonts:[{name:'Times New Roman',charset:77}],body:[240]}));const before=await p.locator('#text').inputValue();assert.equal(visible(before),'\uf8ff');await p.locator('#exportPxc').click();assert((await p.locator('#toast').textContent()).includes('U+F8FF'));assert.equal(await p.locator('#text').inputValue(),before);
   }
   assert.deepEqual(errors,[]);
  }finally{await p.close();}
 }
 console.log('PASS: actual Mac Roman PXP/PXC/PXA upload/scopes, notes/yi-go/phrase,24pt bold typography, Save/Open, RTF download/reimport, preview/print/numbered PDF and private-use native export rejection');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
