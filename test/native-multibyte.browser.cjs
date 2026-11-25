const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');
global.PechaImages=require('../src/images');global.Folio=require('../src/folio');
const E=require('../src/engine'),R=require('../src/rtf'),T=require('../src/legacy-table');
const {native}=require('./native-charset-fixture'),{cases,sample,expected}=require('./native-multibyte-fixture');
const visible=text=>E.parseStream(text,false).filter(r=>r.k==='text').map(r=>r.s).join('');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
  const p=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];p.setDefaultTimeout(15000);p.on('pageerror',e=>errors.push(e.message));
  await p.goto(process.argv[2]);await p.locator('#pasteText').click();
  const upload=async(name,buffer)=>{await p.locator('#toast').evaluate(n=>n.textContent='');await p.locator('#openFile').setInputFiles({name,mimeType:'application/octet-stream',buffer});await p.waitForFunction(()=>document.querySelector('#toast').textContent.length>0);};
  const save=async()=>{const event=p.waitForEvent('download');await p.locator('#saveDoc').click();return fs.readFileSync(await(await event).path());};
  const base=E.defaultDoc();base.text='OLD';base.counts={title:0,fancy:0};base.yigo.enabled=false;base.dzog.enabled=false;
  await upload('base.pecha',Buffer.from(JSON.stringify(base)));await upload('multibyte.pxp',sample());
  assert.equal(visible(await p.locator('#text').inputValue()),expected);
  await p.waitForFunction(()=>document.querySelector('#table').textContent.includes('日本語ソ'));
  const styles=selector=>p.locator(selector+' text').evaluateAll((ns,words)=>ns.filter(n=>words.includes(n.textContent.trim())).map(n=>[n.textContent.trim(),n.getAttribute('font-family'),+n.getAttribute('font-size'),getComputedStyle(n).fontWeight,getComputedStyle(n).fontStyle]),cases.map(c=>c.text));
  const preview=await styles('#table');assert(preview.length>=8,JSON.stringify(await p.locator('#table text').allTextContents()));assert(preview.some(r=>r[0]==='中文'&&r[3]==='700'));assert(preview.some(r=>r[0]==='한국어'&&r[4]==='italic'));assert(preview.every(r=>r[1].includes('Arial')));
  await p.evaluate(()=>window.dispatchEvent(new Event('beforeprint')));assert.deepEqual(await styles('#printRoot'),preview);
  const saved=await save(),doc=JSON.parse(saved);assert.equal(visible(doc.notes.sets['body.front'].inL.text),expected);assert.equal(visible(doc.folio.rhino),expected);
  await upload('saved.pecha',saved);assert.equal(visible(await p.locator('#text').inputValue()),expected);assert.deepEqual(await styles('#table'),preview);
  await p.getByText('Reuse text, layouts and annotations',{exact:true}).click();const event=p.waitForEvent('download');await p.locator('#exportRtf').click();const exported=fs.readFileSync(await(await event).path());
  assert.equal(visible(R.read(exported,E,T).doc.text),expected);await upload('exported.rtf',exported);assert.equal(visible(await p.locator('#text').inputValue()),expected);
  const target=E.defaultDoc();target.text='Keep body';target.counts={title:0,fancy:0};target.yigo.enabled=false;target.dzog.enabled=false;target.paper.w=14;target.pageNum.font='family:Georgia';
  await upload('target.pecha',Buffer.from(JSON.stringify(target)));await upload('multibyte.pxa',sample('pxa'));
  const annotations=JSON.parse(await save());assert.equal(annotations.text,'Keep body');assert.equal(annotations.paper.w,14);assert.equal(annotations.pageNum.font,'family:Georgia');assert.equal(visible(annotations.notes.sets['body.front'].inL.text),expected);assert.equal(visible(annotations.folio.rhino),expected);
  await upload('multibyte.pxc',sample('pxc'));const content=JSON.parse(await save());assert.equal(visible(content.text),expected);assert.equal(content.paper.w,14);
  await p.waitForFunction(()=>document.querySelector('#table').textContent.includes('한국어'));
  if(process.env.QA_SCREENSHOT)await p.screenshot({path:process.env.QA_SCREENSHOT,fullPage:true});
  await upload('invalid.pxp',native({fonts:[{name:'Arial',charset:128}],body:[0x93]}));assert.equal(visible(await p.locator('#text').inputValue()),'�');assert((await p.locator('#importMessages').textContent()).includes('could not be decoded'));
  assert.deepEqual(errors,[]);console.log('PASS: native multibyte file imports, mixed styles/fonts and annotations, preview/print, Save/Open, Unicode RTF export/reimport, PXA/PXC retained scope, malformed-byte warning');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
