// With Playwright and a docs server: node test/native-template.browser.cjs [URL]
const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');
global.PechaImages=require('../src/images');global.Folio=require('../src/folio');
const Engine=require('../src/engine'),Pxp=require('../src/pxp');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
  page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.argv[2]||'http://127.0.0.1:8785/');await page.locator('#pasteText').click();
  const upload=(name,buffer)=>page.locator('#openFile').setInputFiles({name,mimeType:'application/octet-stream',buffer});
  const doc=Engine.defaultDoc();doc.text='ཀ་{hs}\nཁ་';doc.flow=false;doc.paper={name:'Custom',w:14,h:8.5};doc.pecha.perSheet=2;
  doc.counts={title:0,fancy:0};doc.types.body.baseline=.45;doc.types.body.color='#1256ab';doc.notes.outLeft=.1;
  await upload('source.pecha',Buffer.from(JSON.stringify(doc)));
  await page.waitForFunction(()=>document.querySelector('#toast').textContent==='Opened source.pecha.');
  await page.getByText('Reuse text, layouts and annotations',{exact:true}).click();
  const exporting=page.waitForEvent('download');await page.locator('#exportPxt').click();
  const download=await exporting,template=fs.readFileSync(await download.path());
  assert.equal(download.suggestedFilename(),'pecha-layout.pxt');
  const settings=Pxp.parse(template).template;assert.equal(settings.PageSetup['PaperSize.x'],'14000');assert.equal(settings.Type_2.BaseLineAdj,'0.450000');
  assert((await page.locator('#exportMessages').textContent()).includes('Experimental'));
  assert((await page.locator('#exportMessages').textContent()).includes('fixed baseline'));
  if(process.env.QA_EXPORT_SCREENSHOT)await page.screenshot({path:process.env.QA_EXPORT_SCREENSHOT,fullPage:true});
  const target=Engine.defaultDoc();target.text='RETAIN ཀ་{hs}';target.notes.sets['body.front'].inL.text='Keep annotation';target.folio.start=7;
  await upload('target.pecha',Buffer.from(JSON.stringify(target)));
  await page.waitForFunction(()=>document.querySelector('#toast').textContent==='Opened target.pecha.');
  await upload('roundtrip.pxt',template);
  await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('roundtrip.pxt'));
  assert.equal(await page.locator('#text').inputValue(),target.text);
  const saving=page.waitForEvent('download');await page.locator('#saveDoc').click();
  const saved=JSON.parse(fs.readFileSync(await (await saving).path()));
  assert.equal(saved.paper.w,14);assert.equal(saved.paper.h,8.5);assert.equal(saved.types.body.baseline,.45);
  assert.equal(saved.types.body.color.toLowerCase(),'#1256ab');assert.equal(saved.folio.start,7);assert.equal(saved.notes.sets['body.front'].inL.text,'Keep annotation');
  await page.evaluate(()=>window.dispatchEvent(new Event('beforeprint')));
  const sheets=await page.locator('#printRoot .sheet-print').count();assert(sheets>0);
  await page.emulateMedia({media:'print'});
  assert.equal(await page.locator('.app').evaluate(el=>getComputedStyle(el).display),'none');
  assert.equal(await page.locator('.start').evaluate(el=>getComputedStyle(el).display),'none');
  const pdf=await page.pdf({preferCSSPageSize:true,printBackground:true});assert.equal(pdf.subarray(0,5).toString(),'%PDF-');assert(pdf.length>5000);
  assert.equal((pdf.toString('latin1').match(/\/Type\s*\/Page\b/g)||[]).length,sheets,'PDF contains only prepared print sheets');
  if(process.env.QA_PDF)fs.writeFileSync(process.env.QA_PDF,pdf);
  await page.emulateMedia({media:'screen'});
  assert.notEqual(await page.locator('.app').evaluate(el=>getComputedStyle(el).display),'none');
  if(process.env.QA_SCREENSHOT)await page.screenshot({path:process.env.QA_SCREENSHOT,fullPage:true});
  assert.deepEqual(errors,[]);console.log('PASS: PXT download/notes, import scope/geometry, full Save, print SVG and PDF generation, no JS errors');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
