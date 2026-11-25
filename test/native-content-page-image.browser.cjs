const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');
global.PechaImages=require('../src/images');global.Folio=require('../src/folio');
const E=require('../src/engine'),P=require('../src/pxp'),{sample}=require('./native-page-image-export-fixture');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const p=await browser.newPage({viewport:{width:1440,height:1100}}),errors=[];p.setDefaultTimeout(15000);p.on('pageerror',e=>errors.push(e.message));await p.goto(process.argv[2]);await p.locator('#pasteText').click();
  const upload=async(name,buffer)=>{await p.locator('#toast').evaluate(n=>n.textContent='');await p.locator('#openFile').setInputFiles({name,mimeType:'application/octet-stream',buffer});await p.waitForFunction(()=>document.querySelector('#toast').textContent.length>0);};
  const download=async(selector)=>{const event=p.waitForEvent('download');await p.locator(selector).click();return fs.readFileSync(await(await event).path());};
  const save=()=>download('#saveDoc');
  const fixed=(selector,prefix)=>p.locator(selector+' image').evaluateAll((ns,prefix)=>ns.filter(n=>n.dataset.imageId.startsWith(prefix)).sort((a,b)=>+a.dataset.imageId.split('-').at(-1)-+b.dataset.imageId.split('-').at(-1)).map(n=>[+n.dataset.imageId.split('-').at(-1),...['x','y','width','height'].map(a=>+n.getAttribute(a))]),prefix);
  const d=sample(E);d.images.push(PechaImages.placement({id:'future',asset:'pixels',kind:'page',page:4,anchor:'text-left',dpi:111,scale:50}));
  await upload('source.pecha',Buffer.from(JSON.stringify(d)));await p.waitForFunction(()=>document.querySelectorAll('#table image[data-image-id^="page-"]').length===6);
  const before=JSON.parse(await save()),geometry=await fixed('#table','page-');
  await p.getByText('Reuse text, layouts and annotations',{exact:true}).click();const bytes=await download('#exportPxc'),block=Buffer.from(P.parse(bytes).imageBlock).toString('latin1');assert(block.includes('PageImageInfoCount=6'));assert(!block.includes('pageNbr=4'));
  assert((await p.locator('#exportMessages').textContent()).includes('1 page-image placement(s) beyond the current 3 web page(s)'));assert.deepEqual(JSON.parse(await save()),before);
  // A narrower receiving layout moves right anchors by exactly two inches.
  const base=structuredClone(d);base.paper.w=12;base.images=[];base.assets=[];base.yigo.image='';base.text='Replace';base.textSize=40;
  await upload('target.pecha',Buffer.from(JSON.stringify(base)));await upload('roundtrip.pxc',bytes);await p.waitForFunction(()=>document.querySelectorAll('#table image[data-image-id^="native-page-"]').length===6);
  const expected=geometry.map(([id,x,...rest])=>[id,x-(id>=3?144:0),...rest]);assert.deepEqual(await fixed('#table','native-page-'),expected);
  const saved=await save(),got=JSON.parse(saved);assert.equal(got.paper.w,12);assert.equal(got.textSize,null);assert.equal(got.images.filter(p=>p.kind==='page').length,6);assert.equal(got.assets.length,3);assert.equal(got.yigo.image,'native-yigo');assert.equal(got.pageNum.start,401);assert.equal(got.folio.start,23);assert(got.text.includes('བོད'));
  const text=await p.locator('#table').textContent();assert(text.includes('401')&&text.includes('402')&&text.includes('403'));
  await p.evaluate(()=>window.dispatchEvent(new Event('beforeprint')));assert.deepEqual(await fixed('#printRoot','native-page-'),expected);
  const pdf=await p.pdf({preferCSSPageSize:true,printBackground:true});assert.equal(pdf.subarray(0,5).toString(),'%PDF-');assert.equal((pdf.toString('latin1').match(/\/Type\s*\/Page\b/g)||[]).length,await p.locator('#printRoot .sheet-print').count());
  if(process.env.QA_PDF)fs.writeFileSync(process.env.QA_PDF,pdf);if(process.env.QA_SCREENSHOT)await p.screenshot({path:process.env.QA_SCREENSHOT,fullPage:true});
  await upload('saved.pecha',saved);assert.deepEqual(await fixed('#table','native-page-'),expected);
  // All-pruned exports omit the image block. Full files retain the future assignments.
  const only=sample(E);only.text='One';only.yigo.image='';only.images=only.images.filter(im=>im.kind==='page').map(im=>({...im,page:2}));
  await upload('one.pecha',Buffer.from(JSON.stringify(only)));const original=JSON.parse(await save());assert.equal(P.parse(await download('#exportPxc')).imageBlock,null);assert((await p.locator('#exportMessages').textContent()).includes('6 page-image placement(s) beyond the current 1 web page(s)'));assert.deepEqual(JSON.parse(await save()),original);
  assert.equal(P.readImages(P.parse(await download('#exportPxp')).imageBlock).images.length,6);
  only.text='One{page}Two';await upload('two.pecha',Buffer.from(JSON.stringify(only)));assert.equal(P.readImages(P.parse(await download('#exportPxc')).imageBlock).images.length,6);assert(!(await p.locator('#exportMessages').textContent()).includes('placement(s) beyond'));
  assert.deepEqual(errors,[]);console.log('PASS: PXC page-image download/pruning, fresh page counts, all-pruned blocks, PXP retention, source isolation, receiving-layout anchor geometry, marks/Tibetan, Save/Open and preview/print/PDF');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
