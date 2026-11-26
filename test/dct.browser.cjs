// With Playwright and a docs server: node test/dct.browser.cjs [URL]
const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');
const fixture=fs.readFileSync(__dirname+'/fixtures/dct/modern-public.dct');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
  page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.argv[2]||'http://127.0.0.1:8787/');await page.locator('#pasteText').click();
  const upload=async(name,buffer)=>{await page.locator('#openFile').setInputFiles({name,mimeType:'application/octet-stream',buffer});if(name.endsWith('.dct'))await page.locator('#dctDialog').waitFor({state:'visible'});};
  await page.locator('#text').fill('Previous document');
  await upload('public-modern.dct',fixture);
  await page.locator('#dctImport').click();
  await page.waitForFunction(()=>document.querySelector('#text').value.includes('བཞུགས་སོ།'));
  const imported=await page.locator('#text').inputValue();assert(!imported.includes('Previous document'));
  const notes=await page.locator('#importMessages').textContent();assert(notes.includes('Experimental'));assert(notes.includes('ornament'));assert(notes.includes('formatting control'));
  await page.waitForFunction(()=>document.querySelector('#table').textContent.includes('བཞུགས'));
  assert((await page.locator('#table').textContent()).includes('བཞུགས'));
  await upload('old-format.dct',Buffer.from('1 2 TibetD 3\n'));
  await page.locator('#dctImport').click();
  await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('versions 4 and 5'));
  assert.equal(await page.locator('#text').inputValue(),imported);
  const downloading=page.waitForEvent('download');await page.locator('#saveDoc').click();
  const saved=fs.readFileSync(await(await downloading).path());assert.equal(JSON.parse(saved).text,imported);
  await upload('saved.pecha',saved);await page.waitForFunction(()=>document.querySelector('#toast').textContent==='Opened saved.pecha.');
  assert.equal(await page.locator('#text').inputValue(),imported);
  await page.evaluate(()=>window.dispatchEvent(new Event('beforeprint')));
  assert((await page.locator('#printRoot').textContent()).includes('བཞུགས'));
  assert(await page.locator('#printRoot svg').count()>0);
  if(process.env.QA_SCREENSHOT)await page.screenshot({path:process.env.QA_SCREENSHOT,fullPage:true});
  assert.deepEqual(errors,[]);console.log('PASS: public DCT upload, warnings, Tibetan preview/print, rejected format retains current doc, full Save/Open, no JS errors');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
