const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');
global.PechaImages=require('../src/images');global.Folio=require('../src/folio');
const E=require('../src/engine'),R=require('../src/rtf'),T=require('../src/legacy-table'),{sample,expected,wrap}=require('./dct-old-fixture');
const visible=t=>E.parseStream(t,false).filter(r=>r.k==='text').map(r=>r.s).join('').replace(/\u2028/g,'\n');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1050}}),errors=[];page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.argv[2]||'http://127.0.0.1:54096/');await page.locator('#pasteText').click();
  const upload=async(name,buffer)=>{await page.locator('#toast').evaluate(n=>n.textContent='');await page.locator('#openFile').setInputFiles({name,mimeType:'application/octet-stream',buffer});if(name.endsWith('.dct')){await page.locator('#dctDialog').waitFor({state:'visible'});await page.locator('#dctImport').click();}await page.waitForFunction(()=>document.querySelector('#toast').textContent.length>0);};
  const base=E.defaultDoc();base.text='Previous';base.counts={title:0,fancy:0};base.yigo.enabled=false;base.dzog.enabled=false;base.folio.start=23;base.pageNum.start=401;base.notes.sets['body.front'].inL.text='Keep';base.notes.sets['title.front'].inL.text='Keep';base.notes.sets['title.front'].inL.on=true;base.notes.sets['body.front'].inL.on=true;
  let savedText;
  for(const version of [2,3]){
   await upload('base.pecha',Buffer.from(JSON.stringify(base)));await upload(`synthetic-old-${version}.dct`,sample(version));
   const text=await page.locator('#text').inputValue();assert.equal(visible(text),expected);if(savedText)assert.equal(text,savedText);savedText=text;
   const notes=await page.locator('#importMessages').textContent();assert(notes.includes(`numeric TibetDoc version ${version}`));assert(notes.includes('Older TibetDoc'));assert(notes.includes('1 DCT glyphs'));
  }
  await page.waitForFunction(()=>document.querySelector('#table').textContent.includes('པི'));
  const event=page.waitForEvent('download');await page.locator('#saveDoc').click();const saved=fs.readFileSync(await(await event).path()),doc=JSON.parse(saved);assert.equal(doc.text,savedText);assert.equal(doc.notes.sets['body.front'].inL.text,'Keep');assert.equal(doc.pageNum.start,1);assert.equal(doc.folio.start,1);
  await upload('saved.pecha',saved);assert.equal(await page.locator('#text').inputValue(),savedText);
  for(const body of [[17],[23],[25],[33,10,...Buffer.from('2\t!\ttext')]]){await upload('truncated-or-multiple.dct',wrap(body));assert.equal(await page.locator('#text').inputValue(),savedText);}
  await page.getByText('Reuse text, layouts and annotations',{exact:true}).click();const exp=page.waitForEvent('download');await page.locator('#exportRtf').click();assert.equal(visible(R.read(fs.readFileSync(await(await exp).path()),E,T).doc.text),expected);
  // Reimport to show the explicit older-version warning in the screenshot.
  await upload('synthetic-old-3.dct',sample(3));await page.waitForFunction(()=>document.querySelector('#table').textContent.includes('པི'));
  await page.evaluate(()=>window.dispatchEvent(new Event('beforeprint')));const print=await page.locator('#printRoot').textContent();assert(print.includes('པི'));assert(print.includes('�'));assert(!print.includes('401'));assert(print.includes('Keep'));
  const textRuns=async selector=>(await page.locator(selector+' svg text').allTextContents()).filter(s=>!/^Sheet \d+ (front|back)$/.test(s)).sort();assert.deepEqual(await textRuns('#printRoot'),await textRuns('#table'));
  const pdf=await page.pdf({preferCSSPageSize:true,printBackground:true});assert.equal(pdf.subarray(0,5).toString(),'%PDF-');if(process.env.QA_PDF)fs.writeFileSync(process.env.QA_PDF,pdf);
  if(process.env.QA_SCREENSHOT)await page.screenshot({path:process.env.QA_SCREENSHOT,fullPage:true});
  await upload('numeric-modern.dct',wrap([45],4));assert.equal(visible(await page.locator('#text').inputValue()),'་');assert(!(await page.locator('#importMessages').textContent()).includes('Older TibetDoc'));
  assert.deepEqual(errors,[]);console.log('PASS: synthetic TibetDoc2/3 upload, normalized text and unresolved warning, retained notes and fresh numbering, Save/RTF, malformed import retention, preview/print/PDF and modern-version bypass, no JS errors');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
