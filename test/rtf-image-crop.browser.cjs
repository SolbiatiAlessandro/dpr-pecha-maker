const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');
global.PechaImages=require('../src/images');global.Folio=require('../src/folio');
const E=require('../src/engine'),{sample,picture}=require('./rtf-image-crop-fixture'),{png}=require('./image-dpi-fixture');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const p=await browser.newPage({viewport:{width:1440,height:1050}}),errors=[];p.setDefaultTimeout(15000);p.on('pageerror',e=>errors.push(e.message));
  await p.goto(process.argv[2]);await p.locator('#pasteText').click();
  const upload=async(name,buffer)=>{await p.locator('#toast').evaluate(n=>n.textContent='');await p.locator('#openFile').setInputFiles({name,mimeType:'application/octet-stream',buffer});await p.waitForFunction(()=>document.querySelector('#toast').textContent.length>0);};
  const save=async()=>{const event=p.waitForEvent('download');await p.locator('#saveDoc').click();return fs.readFileSync(await(await event).path());};
  const geometry=(selector='#table')=>p.locator(selector+' svg[data-image-crop]').evaluateAll(ns=>ns.map(n=>['x','y','width','height'].map(k=>+n.getAttribute(k))));
  const dimensions=doc=>doc.images.map(i=>{const s=PechaImages.dimensions(doc,i);return [s.w,s.h];});
  const expected=[[18,72],[162,9],[36,18]],base=E.defaultDoc();base.text='OLD';base.counts={title:0,fancy:0};base.yigo.enabled=false;base.dzog.enabled=false;
  base.folio.start=23;base.pageNum.start=401;
  await upload('base.pecha',Buffer.from(JSON.stringify(base)));await upload('independent-scales.rtf',Buffer.from(sample()));
  await p.waitForFunction(()=>document.querySelectorAll('#table image').length===3);
  const original=await geometry();assert.deepEqual(original.map(g=>g.slice(2)),expected);
  // Compare right edges and centers, since each paragraph has a different width.
  assert(original[2][0]<original[0][0]);assert(original[0][0]+9<original[1][0]+162);
  assert((await p.locator('#importMessages').textContent()).includes('cropping is experimental'));
  const pixels=await p.locator('#table svg[data-image-crop]').evaluateAll(async nodes=>{
    const result=[];
    for(const [i,node] of nodes.entries()){
      const clone=node.cloneNode(true);clone.setAttribute('xmlns','http://www.w3.org/2000/svg');clone.removeAttribute('x');clone.removeAttribute('y');
      const img=new Image();img.src='data:image/svg+xml;base64,'+btoa(new XMLSerializer().serializeToString(clone));await img.decode();
      const canvas=document.createElement('canvas');canvas.width=+node.getAttribute('width');canvas.height=+node.getAttribute('height');const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0);
      const xs=i===0?[1,16]:i===1?[10,40,100,150]:[1,34];result.push(xs.map(x=>Array.from(ctx.getImageData(x,Math.floor(canvas.height/2),1,1).data)));
    }return result;
  });
  assert.deepEqual(pixels,[[[0,0,255,255],[0,0,255,255]],[[0,0,0,0],[255,0,0,255],[0,0,255,255],[0,0,0,0]],[[255,0,0,255],[0,0,255,255]]]);
  const saved=await save(),doc=JSON.parse(saved);assert.deepEqual(dimensions(doc),expected);assert.equal(doc.assets.length,1);
  assert.deepEqual(Buffer.from(doc.assets[0].data.split(',')[1],'base64'),png(96,96));
  await upload('saved.pecha',saved);assert.deepEqual(await geometry(),original);
  await p.getByText('Reuse text, layouts and annotations',{exact:true}).click();const event=p.waitForEvent('download');await p.locator('#exportRtf').click();const exported=fs.readFileSync(await(await event).path());
  await upload('roundtrip.rtf',exported);assert.deepEqual(await geometry(),original);
  const beforeNative=await p.locator('#text').inputValue();await p.locator('#exportPxc').click();assert((await p.locator('#toast').textContent()).includes('Cropped images cannot yet'));assert.equal(await p.locator('#text').inputValue(),beforeNative);
  await p.evaluate(()=>window.dispatchEvent(new Event('beforeprint')));assert.deepEqual(await geometry('#printRoot'),original);
  const tibetan=selector=>p.locator(selector+' text').evaluateAll(ns=>ns.map(n=>n.textContent).filter(s=>/[\u0f00-\u0fff]/.test(s)).sort());
  assert.deepEqual(await tibetan('#printRoot'),await tibetan('#table'));assert((await tibetan('#table')).some(s=>s.includes('ཀ')));
  assert((await p.locator('#table').textContent()).includes('401'));assert((await p.locator('#printRoot').textContent()).includes('401'));
  const pdf=await p.pdf({preferCSSPageSize:true,printBackground:true});assert.equal(pdf.subarray(0,5).toString(),'%PDF-');
  assert.equal((pdf.toString('latin1').match(/\/Type\s*\/Page\b/g)||[]).length,await p.locator('#printRoot .sheet-print').count());
  if(process.env.QA_PDF)fs.writeFileSync(process.env.QA_PDF,pdf);if(process.env.QA_SCREENSHOT)await p.screenshot({path:process.env.QA_SCREENSHOT,fullPage:true});
  await upload('base.pecha',Buffer.from(JSON.stringify(base)));
  const paste=rtf=>p.locator('#text').evaluate((t,rtf)=>{t.focus();t.setSelectionRange(0,t.value.length);const clipboardData=new DataTransfer();clipboardData.setData('text/rtf',rtf);t.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData}));},rtf);
  await paste(sample());await p.waitForFunction(()=>document.querySelectorAll('#table image').length===3);assert.deepEqual((await geometry()).map(g=>g.slice(2)),expected);
  await p.locator('#text').focus();await p.keyboard.press('Meta+z');assert.equal(await p.locator('#text').inputValue(),'OLD');await p.keyboard.press('Meta+Shift+z');
  await p.waitForFunction(()=>document.querySelectorAll('#table image').length===3);assert.deepEqual(dimensions(JSON.parse(await save())),expected);
  const tiny=JSON.parse(saved);tiny.images[0].crop.left=.999999;await upload('tiny.pecha',Buffer.from(JSON.stringify(tiny)));
  const unchanged=await p.locator('#text').inputValue();await p.locator('#exportRtf').click();assert((await p.locator('#toast').textContent()).includes('too small for RTF twip precision'));assert.equal(await p.locator('#text').inputValue(),unchanged);
  await upload('invalid-scale.rtf',Buffer.from('{\\rtf1 '+picture('\\picwgoal1440\\pichgoal720\\piccropl1440')+'}'));
  assert((await p.locator('#importMessages').textContent()).includes('cropping was ignored'));assert.equal(await p.locator('#table svg[data-image-crop]').count(),0);assert.deepEqual(await p.locator('#table image').evaluateAll(ns=>ns.map(n=>['width','height'].map(k=>+n.getAttribute(k)))),[[72,36]]);
  assert.deepEqual(errors,[]);console.log('PASS: RTF cropping/scaling and actual clipped/padded pixels, actual upload/Save/RTF, original PNG bytes, alignment, preview/print/PDF/Tibetan text, paste undo/redo and invalid-crop notice and native-export rejection');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
