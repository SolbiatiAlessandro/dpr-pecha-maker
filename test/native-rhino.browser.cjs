const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');
global.PechaImages=require('../src/images');global.Folio=require('../src/folio');
const E=require('../src/engine'),{sample}=require('./native-rhino-fixture');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
  const p=await browser.newPage({viewport:{width:1440,height:1100}}),errors=[];
  p.setDefaultTimeout(15000);p.on('pageerror',e=>errors.push(e.message));
  await p.goto(process.argv[2]||'http://127.0.0.1:53095/');await p.locator('#pasteText').click();
  const upload=(name,buffer)=>p.locator('#openFile').setInputFiles({name,mimeType:'application/octet-stream',buffer});
  const base=E.defaultDoc();base.text='Old';base.counts={title:1,fancy:0};base.yigo.enabled=false;base.dzog.enabled=false;base.folio.size=18;
  await upload('base.pecha',Buffer.from(JSON.stringify(base)));await p.waitForFunction(()=>document.querySelector('#text').value==='Old');
  await upload('rhino.pxp',sample());
  const visible=()=>p.waitForFunction(()=>Array.from(document.querySelectorAll('#table text')).filter(n=>n.textContent==='Phrase').length===2);
  await visible();const body=await p.locator('#text').inputValue();
  const styles=selector=>p.locator(selector+' text').evaluateAll(ns=>ns.filter(n=>['Fixed','Phrase'].includes(n.textContent.trim())).map(n=>[n.textContent.trim(),n.getAttribute('font-family'),+n.getAttribute('font-size'),n.getAttribute('fill'),n.getAttribute('font-weight'),n.getAttribute('font-style'),n.getAttribute('text-decoration'),n.parentElement.getAttribute('transform')]));
  const initial=await styles('#table');assert.equal(initial.length,4);
  for(const [text,family,size,color,weight,italic,deco,transform] of initial){assert.equal(size,18);assert(transform.includes('rotate(-90)'));if(text==='Fixed'){assert(family.includes('Arial'));assert.equal(color,'#b03020');assert.equal(weight,'700');}else{assert(family.includes('Courier New'));assert.equal(color,'#000000');assert.equal(italic,'italic');assert.equal(deco,'underline line-through');}}
  const counts=await p.locator('#table svg').evaluateAll(ns=>ns.map(svg=>Array.from(svg.querySelectorAll('text')).filter(n=>n.textContent==='Phrase').length));assert.deepEqual(counts,[1,0,1]);
  await p.getByRole('tab',{name:'Marks',exact:true}).click();assert(await p.locator('#f_folio_rhinoEnabled').isChecked());assert(await p.locator('#f_folio_rhinoRich').isChecked());assert.equal(await p.locator('#f_folio_start').inputValue(),'0');assert.equal(await p.locator('#f_folio_onTitle').isChecked(),false);
  const phrase=await p.locator('#f_folio_rhino').inputValue();
  await p.locator('#f_folio_rhinoEnabled').uncheck();await p.waitForFunction(()=>!document.querySelector('#table').textContent.includes('Phrase'));assert.equal(await p.locator('#f_folio_rhino').inputValue(),phrase);
  await p.locator('#f_folio_start').fill('1');await p.locator('#f_folio_start').dispatchEvent('change');await p.locator('#f_folio_onTitle').check();await p.waitForFunction(()=>document.querySelector('#table').textContent.includes('གཅིག་'));
  await p.locator('#f_folio_rhinoEnabled').check();await visible();assert(!await p.locator('#table').textContent().then(s=>s.includes('བྱོན།')));
  for(const angle of ['0','90','-90']){await p.locator('#f_folio_angle').selectOption(angle);await p.waitForFunction(angle=>Array.from(document.querySelectorAll('#table text')).filter(n=>n.textContent==='Phrase').every(n=>n.parentElement.getAttribute('transform').includes(`rotate(${angle})`)),angle);}
  await p.locator('#f_folio_size').fill('24');await p.locator('#f_folio_size').dispatchEvent('change');await p.waitForFunction(()=>Array.from(document.querySelectorAll('#table text')).some(n=>n.textContent==='Phrase'&&n.getAttribute('font-size')==='24'));
  const preview=await styles('#table');await p.evaluate(()=>window.dispatchEvent(new Event('beforeprint')));assert.deepEqual(await styles('#printRoot'),preview);
  const saving=p.waitForEvent('download');await p.locator('#saveDoc').click();const saved=fs.readFileSync(await(await saving).path());const doc=JSON.parse(saved);assert(doc.folio.rhinoEnabled&&doc.folio.rhinoRich);assert.equal(doc.folio.rhino,phrase);
  await upload('saved.pecha',saved);await p.waitForFunction(()=>document.querySelector('#toast').textContent==='Opened saved.pecha.');assert.deepEqual(await styles('#table'),preview);
  if(process.env.QA_SCREENSHOT)await p.screenshot({path:process.env.QA_SCREENSHOT,fullPage:true});
  await upload('disabled.pxa',sample('pxa',false));await p.waitForFunction(()=>!document.querySelector('#f_folio_rhinoEnabled').checked);assert.equal(await p.locator('#text').inputValue(),body);assert.deepEqual(E.parseStream(await p.locator('#f_folio_rhino').inputValue(),false),E.parseStream(phrase,false));
  await p.locator('#f_folio_rhinoEnabled').check();await visible();
  await p.getByRole('tab',{name:'Text',exact:true}).click();await p.getByText('Reuse text, layouts and annotations',{exact:true}).click();
  const exporting=p.waitForEvent('download');await p.locator('#exportRtf').click();assert(!fs.readFileSync(await(await exporting).path(),'utf8').includes('Fixed'));
  // A legacy plain phrase retains literal braces after migration.
  const old={...doc,folio:{...doc.folio,rhino:'{b}Literal'}};delete old.folio.rhinoEnabled;delete old.folio.rhinoRich;
  await upload('legacy.pecha',Buffer.from(JSON.stringify(old)));await p.waitForFunction(()=>document.querySelector('#table').textContent.includes('{b}Literal'));
  assert.deepEqual(errors,[]);console.log('PASS: native fixed-folio front/title/zero-start visibility, formatting, toggle retention, numbering restoration, rotations/size, print, Save/Open, PXA scope, RTF exclusion and legacy migration');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
