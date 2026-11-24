const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');
global.PechaImages=require('../src/images');global.Folio=require('../src/folio');
const E=require('../src/engine'),{sample}=require('./native-yigo-fixture');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
  const p=await browser.newPage({viewport:{width:1440,height:1100}}),errors=[];
  p.setDefaultTimeout(15000);p.on('pageerror',e=>errors.push(e.message));
  await p.goto(process.argv[2]||'http://127.0.0.1:52243/');await p.locator('#pasteText').click();
  const upload=(name,buffer)=>p.locator('#openFile').setInputFiles({name,mimeType:'application/octet-stream',buffer});
  const base=E.defaultDoc();base.text='Old';base.counts={title:0,fancy:0};base.types.body.baseline=.5;base.dzog.enabled=false;base.yigo.ignoreColor=false;
  await upload('base.pecha',Buffer.from(JSON.stringify(base)));await p.waitForFunction(()=>document.querySelector('#text').value==='Old');
  await upload('yi-go.pxp',sample());
  await p.waitForFunction(()=>Array.from(document.querySelectorAll('#table text')).filter(n=>n.textContent==='Red').length===2);
  const styles=selector=>p.locator(selector+' text').evaluateAll(ns=>ns.filter(n=>['Dflt','Red','Black'].includes(n.textContent)).map(n=>[n.textContent,n.getAttribute('font-family'),+n.getAttribute('font-size'),n.getAttribute('fill')]));
  const expected=await styles('#table');assert.equal(expected.length,6);
  for(const [text,family,size,color] of expected){assert.equal(size,30);assert(family.includes(text==='Black'?'Courier New':'Arial'));assert.equal(color,{Dflt:'#123456',Red:'#b03020',Black:'#000000'}[text]);}
  // The three body pages receive ornaments on their front sides only.
  const counts=await p.locator('#table svg').evaluateAll(ns=>ns.map(svg=>Array.from(svg.querySelectorAll('text')).filter(n=>n.textContent==='Red').length));
  assert.deepEqual(counts,[1,0,1]);
  await p.getByRole('tab',{name:'Marks',exact:true}).click();assert(await p.locator('#f_yigo_rich').isChecked());assert.equal(await p.locator('#f_yigo_ignoreColor').isChecked(),false);
  assert((await p.locator('#f_yigo_text').inputValue()).includes('{#000000}'));
  await p.locator('#f_yigo_ignoreColor').check();
  await p.waitForFunction(()=>Array.from(document.querySelectorAll('#table text')).filter(n=>n.textContent==='Red').every(n=>n.getAttribute('fill')==='#123456'));
  assert((await styles('#table')).every(r=>r[3]==='#123456'));
  await p.locator('#f_yigo_ignoreColor').uncheck();await p.waitForFunction(()=>Array.from(document.querySelectorAll('#table text')).some(n=>n.textContent==='Red'&&n.getAttribute('fill')==='#b03020'));
  assert.deepEqual(await styles('#table'),expected);
  await p.evaluate(()=>window.dispatchEvent(new Event('beforeprint')));assert.deepEqual(await styles('#printRoot'),expected);
  const saving=p.waitForEvent('download');await p.locator('#saveDoc').click();const saved=fs.readFileSync(await(await saving).path());
  const doc=JSON.parse(saved);assert(doc.yigo.rich);assert.equal(doc.yigo.ignoreColor,false);assert(doc.yigo.text.endsWith('Black '));
  await upload('saved.pecha',saved);await p.waitForFunction(()=>document.querySelector('#toast').textContent==='Opened saved.pecha.');assert.deepEqual(await styles('#table'),expected);
  await upload('scope.pxa',sample('pxa'));await p.waitForFunction(()=>document.querySelector('#importMessages').textContent.includes('annotation-file'));assert.deepEqual(await styles('#table'),expected);
  if(process.env.QA_SCREENSHOT)await p.screenshot({path:process.env.QA_SCREENSHOT,fullPage:true});
  await p.getByRole('tab',{name:'Text',exact:true}).click();await p.getByText('Reuse text, layouts and annotations',{exact:true}).click();
  const exportRtf=p.waitForEvent('download');await p.locator('#exportRtf').click();assert(!fs.readFileSync(await(await exportRtf).path(),'utf8').includes('Dflt'));
  await upload('empty.pxc',sample('pxc',[]));
  await p.waitForFunction(()=>document.querySelector('#f_yigo_text').value==='');
  await p.waitForFunction(()=>!Array.from(document.querySelectorAll('#table text')).some(n=>n.textContent==='Red'));
  assert.deepEqual(await styles('#table'),[]);assert.deepEqual(errors,[]);
  console.log('PASS: native yi-go fonts/colours, first-character size, front-page eligibility, colour toggle, preview/print, Save/Open, PXA scope, body-only RTF and explicit-empty clearing');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
