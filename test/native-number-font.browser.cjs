const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');
global.PechaImages=require('../src/images');global.Folio=require('../src/folio');
const E=require('../src/engine'),{sample}=require('./native-number-font-fixture');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
  const p=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
  p.setDefaultTimeout(15000);p.on('pageerror',e=>errors.push(e.message));
  await p.goto(process.argv[2]);await p.locator('#pasteText').click();
  const upload=(name,buffer)=>p.locator('#openFile').setInputFiles({name,mimeType:'application/octet-stream',buffer});
  const base=E.defaultDoc();base.text='Old';base.counts={title:0,fancy:0};base.yigo.enabled=false;
  await upload('base.pecha',Buffer.from(JSON.stringify(base)));await p.waitForFunction(()=>document.querySelector('#text').value==='Old');
  await upload('numbered.pxp',sample());await p.waitForFunction(()=>document.querySelector('#text').value.includes('Third'));
  await p.getByRole('tab',{name:'Marks',exact:true}).click();
  assert.equal(await p.locator('#f_pageNum_font').inputValue(),'Courier New');
  const numbers=selector=>p.locator(selector+' text').evaluateAll(ns=>ns.filter(n=>/^\d+$/.test(n.textContent)).map(n=>[n.textContent,n.getAttribute('font-family'),n.getAttribute('font-size'),n.getAttribute('transform'),n.getAttribute('text-anchor')]).sort((a,b)=>+a[0]-b[0]));
  const waitFont=name=>p.waitForFunction(name=>Array.from(document.querySelectorAll('#table text')).filter(n=>/^\d+$/.test(n.textContent)).every(n=>n.getAttribute('font-family').includes(name)),name);
  await waitFont('Courier New');let preview=await numbers('#table');assert.equal(preview.length,3);assert.deepEqual(preview.map(n=>n[0]),['1','2','3']);assert(preview.every(n=>n[2]==='16'&&n[3].includes('rotate(-90)')&&n[4]==='middle'));
  await p.evaluate(()=>window.dispatchEvent(new Event('beforeprint')));assert.deepEqual(await numbers('#printRoot'),preview);
  for(const name of ['Arial','Times New Roman','Courier New']){await p.locator('#f_pageNum_font').selectOption(name);await waitFont(name);}
  await p.locator('#f_pageNum_angle').selectOption('0');await p.locator('#f_pageNum_size').fill('22');await p.waitForFunction(()=>Array.from(document.querySelectorAll('#table text')).some(n=>n.textContent==='1'&&n.getAttribute('font-size')==='22'&&n.getAttribute('transform').includes('rotate(0)')));
  const saving=p.waitForEvent('download');await p.locator('#saveDoc').click();const saved=fs.readFileSync(await(await saving).path());assert.equal(JSON.parse(saved).pageNum.font,'Courier New');
  preview=await numbers('#table');await upload('saved.pecha',saved);await p.waitForFunction(()=>document.querySelector('#toast').textContent==='Opened saved.pecha.');assert.deepEqual(await numbers('#table'),preview);
  if(process.env.QA_SCREENSHOT)await p.screenshot({path:process.env.QA_SCREENSHOT,fullPage:true});
  const body=await p.locator('#text').inputValue();await upload('partial.pxa',sample({extension:'pxa',index:6}));await p.waitForFunction(()=>document.querySelector('#toast').textContent.includes('page-number font reference is not portable'));
  assert.equal(await p.locator('#f_pageNum_font').inputValue(),'Courier New');assert.equal(await p.locator('#text').inputValue(),body);
  // Imported family names remain a single CSS family even with punctuation.
  const unusual='O\'Brien "Display", Serif';await upload('quoted.pxp',sample({name:unusual}));await p.waitForFunction(name=>document.querySelector('#f_pageNum_font').value===name,unusual);
  assert.equal(await p.locator('#f_pageNum_font option:checked').textContent(),unusual);
  const family=(await numbers('#table'))[0][1];assert.equal(E.primaryFont(family),unusual);
  await p.evaluate(()=>window.dispatchEvent(new Event('beforeprint')));assert.deepEqual(await numbers('#printRoot'),await numbers('#table'));
  if(process.env.PUBLIC_SAMPLES){await upload('textExample1.pxp',fs.readFileSync(process.env.PUBLIC_SAMPLES+'/textExample1.pxp'));await p.waitForFunction(()=>document.querySelector('#f_pageNum_font').value==='Times New Roman');await waitFont('Times New Roman');assert((await numbers('#table')).length>0);}
  assert.deepEqual(errors,[]);console.log('PASS: native page-number font import/control, preview/print, selection, size/rotation, Save/Open, PXA preservation and quoted family names');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
