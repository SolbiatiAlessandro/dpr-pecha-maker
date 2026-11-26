const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');
global.PechaImages=require('../src/images');global.Folio=require('../src/folio');
const Engine=require('../src/engine'),Dct=require('../src/dct'),TABLE=require('../src/legacy-table'),{fixture,modern}=require('./dct-header-fixture');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
  page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.argv[2]||'http://127.0.0.1:8787/');await page.locator('#pasteText').click();
  const upload=async(name,buffer)=>{await page.locator('#openFile').setInputFiles({name,mimeType:'application/octet-stream',buffer});if(name.endsWith('.dct')){await page.locator('#dctDialog').waitFor({state:'visible'});await page.locator('#dctImport').click();}};
  const expected=Dct.read(modern,Engine,TABLE).doc.text;
  let geometry;
  for(const version of [4,5]) {
   await page.locator('#text').fill('Previous document');
   await upload(`synthetic-v${version}.dct`,fixture({header:`1 2 TibetD ${version}`,settings:version===4?'1 5 2501751258070 9 0 TibetanAnsi':'1\t5\t2501751258070\t9\t0\t0\tTibetanAnsi'}));
   await page.waitForFunction(text=>document.querySelector('#text').value===text,expected);
   await page.waitForFunction(()=>document.querySelector('#table').textContent.includes('བཞུགས'));
   assert((await page.locator('#importMessages').textContent()).includes(`numeric TibetDoc version ${version}`));
   const current=await page.locator('#table svg text').evaluateAll(nodes=>nodes.map(n=>[n.textContent,n.getAttribute('x'),n.getAttribute('y'),n.getAttribute('font-size')]));
   if(geometry)assert.deepEqual(current,geometry,'both versions follow the same measured glyph/layout path');else geometry=current;
  }
  const save=page.waitForEvent('download');await page.locator('#saveDoc').click();const saved=fs.readFileSync(await(await save).path());assert.equal(JSON.parse(saved).text,expected);
  await upload('numeric-roundtrip.pecha',saved);await page.waitForFunction(()=>document.querySelector('#toast').textContent==='Opened numeric-roundtrip.pecha.');assert.equal(await page.locator('#text').inputValue(),expected);
  for(const [name,data,message] of [
   ['old.dct',fixture({header:'1 2 TibetD 3'}),'versions 4 and 5'],
   ['future.dct',fixture({header:'1 2 TibetD 6'}),'versions 4 and 5'],
   ['malformed.dct',fixture({settings:'1 2 3 4 Ansi'}),'encoding header'],
   ['multirecord.dct',fixture({body:[33,10,...Buffer.from('2\t!\tmore')]}),'Multiple DCT']
  ]) {await upload(name,data);await page.waitForFunction(s=>document.querySelector('#toast').textContent.includes(s),message);assert.equal(await page.locator('#text').inputValue(),expected);}
  // Reopen the successful import to display its notice for the screenshot.
  await upload('synthetic-v4.dct',fixture());await page.waitForFunction(text=>document.querySelector('#text').value===text,expected);
  await page.evaluate(()=>window.dispatchEvent(new Event('beforeprint')));
  assert((await page.locator('#printRoot').textContent()).includes('བཞུགས'));
  // Imposition changes page order and adds sheet labels; compare the text multiset.
  const text=async selector=>(await page.locator(selector+' svg text').allTextContents()).filter(s=>!/^Sheet \d+ (front|back)$/.test(s)).sort();
  assert.deepEqual(await text('#printRoot'),await text('#table'),'preview and print contain the same text and folios');
  const pdf=await page.pdf({preferCSSPageSize:true,printBackground:true});assert.equal(pdf.subarray(0,5).toString(),'%PDF-');
  if(process.env.QA_PDF)fs.writeFileSync(process.env.QA_PDF,pdf);
  if(process.env.QA_SCREENSHOT)await page.screenshot({path:process.env.QA_SCREENSHOT,fullPage:true});
  assert.deepEqual(errors,[]);console.log('PASS: synthetic TibetDoc4/5 upload, source-specific notices, Tibetan preview/layout equivalence, Save/Open, rejected imports retain current doc, print text/folios and PDF, no JS errors');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
