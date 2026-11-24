const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');
global.PechaImages=require('../src/images');global.Folio=require('../src/folio');
const Engine=require('../src/engine'),Rtf=require('../src/rtf'),Documents=require('../src/documents'),{sample}=require('./dct-alignment-fixture');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
  page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.argv[2]||'http://127.0.0.1:49536/');await page.locator('#pasteText').click();
  const upload=(name,buffer)=>page.locator('#openFile').setInputFiles({name,mimeType:'application/octet-stream',buffer});
  await upload('centered.dct',sample());await page.locator('#dctDialog').waitFor({state:'visible'});await page.locator('#dctImport').click();
  const expected='{font:family:Times%20New%20Roman 18}Before\n{c}Center\n{l}After';
  await page.waitForFunction(text=>document.querySelector('#text').value===text,expected);
  await page.waitForFunction(()=>document.querySelector('#table').textContent.includes('Center'));
  assert(!(await page.locator('#importMessages').textContent()).includes('Unsupported DCT formatting'));
  const saving=page.waitForEvent('download');await page.locator('#saveDoc').click();
  const saved=JSON.parse(fs.readFileSync(await(await saving).path()));assert.equal(saved.text,expected);
  await upload('saved.pecha',Buffer.from(JSON.stringify(saved)));
  await page.waitForFunction(()=>document.querySelector('#toast').textContent==='Opened saved.pecha.');
  assert.equal(await page.locator('#text').inputValue(),expected);
  // Apply a separate layout so all three lines share a known body box for geometry QA.
  const layout=Engine.defaultDoc();layout.counts={title:0,fancy:0};layout.yigo.enabled=false;layout.dzog.enabled=false;layout.types.body.baseline=.4;
  await upload('body-layout.pecha',Buffer.from(JSON.stringify(Documents.artifact(layout,'template'))));
  await page.waitForFunction(()=>document.querySelector('#toast').textContent==='Opened body-layout.pecha.');
  await page.waitForFunction(()=>document.querySelectorAll('#table .leaf').length===1&&document.querySelector('#table').textContent.includes('After'));
  assert.equal(await page.locator('#text').inputValue(),expected);
  const positions=selector=>page.locator(selector+' text').evaluateAll(nodes=>Object.fromEntries(nodes.filter(n=>['Before','Center','After'].includes(n.textContent)).map(n=>[n.textContent,{x:+n.getAttribute('x'),y:+n.getAttribute('y'),width:n.getBBox().width}])));
  const screen=await positions('#table');assert.deepEqual(Object.keys(screen),['Before','Center','After']);
  assert.equal(screen.Before.x,screen.After.x);assert(screen.Center.x>screen.Before.x+100);assert(screen.Before.y<screen.Center.y&&screen.Center.y<screen.After.y);
  const bounds=Engine.boxes(layout,layout.types.body).T;
  assert(Math.abs(screen.Center.x+screen.Center.width/2-(bounds.x0+bounds.x1)/2)<1,'centered text is in the middle of the text box');
  await page.evaluate(()=>window.dispatchEvent(new Event('beforeprint')));
  // Sheet imposition offsets all three lines equally; relative geometry must match preview.
  const print=await positions('#printRoot');assert.equal(print.Center.x-print.Before.x,screen.Center.x-screen.Before.x);assert.equal(print.After.x-print.Before.x,0);
  await page.getByText('Reuse text, layouts and annotations',{exact:true}).click();
  const downloading=page.waitForEvent('download');await page.locator('#exportRtf').click();
  const data=fs.readFileSync(await(await downloading).path()),exported=Rtf.read(data,Engine).doc;
  const aligns=Engine.parseStream(exported.text,false).filter(r=>r.k==='text'&&/Before|Center|After/.test(r.s)).map(r=>r.style.align);
  assert.deepEqual(aligns,['j','c','l']);
  if(process.env.QA_SCREENSHOT)await page.screenshot({path:process.env.QA_SCREENSHOT,fullPage:true});
  assert.deepEqual(errors,[]);console.log('PASS: DCT centering upload, full Save/Open, layout-only scope, exact center/left preview and print geometry, RTF alignment export, no JS errors');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
