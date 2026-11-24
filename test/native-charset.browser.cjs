const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');
global.PechaImages=require('../src/images');global.Folio=require('../src/folio');
const Engine=require('../src/engine'),Rtf=require('../src/rtf'),{native,font,cyrillic,sample}=require('./native-charset-fixture');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
  page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.argv[2]||'http://127.0.0.1:50232/');await page.locator('#pasteText').click();
  const upload=(name,buffer)=>page.locator('#openFile').setInputFiles({name,mimeType:'application/octet-stream',buffer});
  const base=Engine.defaultDoc();base.text='Old';base.counts={title:0,fancy:0};base.dzog.enabled=false;base.yigo.enabled=false;
  await upload('base.pecha',Buffer.from(JSON.stringify(base)));await page.waitForFunction(()=>document.querySelector('#text').value==='Old');
  await upload('charsets.pxp',sample());
  await page.waitForFunction(()=>document.querySelector('#text').value.includes('Привет'));
  const imported=await page.locator('#text').inputValue();assert(imported.includes('“€”—…'));assert(!/[\u0080-\u009f]/.test(imported));
  await page.waitForFunction(()=>document.querySelector('#table').textContent.includes('Привет'));
  assert((await page.locator('#table').textContent()).includes('“€”—…'));
  const saving=page.waitForEvent('download');await page.locator('#saveDoc').click();
  const saved=fs.readFileSync(await(await saving).path());assert.equal(JSON.parse(saved).text,imported);
  await upload('saved.pecha',saved);await page.waitForFunction(()=>document.querySelector('#toast').textContent==='Opened saved.pecha.');
  assert.equal(await page.locator('#text').inputValue(),imported);
  await page.evaluate(()=>window.dispatchEvent(new Event('beforeprint')));
  assert((await page.locator('#printRoot').textContent()).includes('“€”—…'));assert((await page.locator('#printRoot').textContent()).includes('Привет'));
  await page.getByText('Reuse text, layouts and annotations',{exact:true}).click();
  const downloading=page.waitForEvent('download');await page.locator('#exportRtf').click();
  const rtf=Rtf.read(fs.readFileSync(await(await downloading).path()),Engine).doc;
  const plain=Engine.parseStream(rtf.text,false).filter(r=>r.k==='text').map(r=>r.s).join('');assert(plain.includes('Привет'));assert(plain.includes('“€”—…'));
  if(process.env.QA_SCREENSHOT)await page.screenshot({path:process.env.QA_SCREENSHOT,fullPage:true});
  // PXA uses compact non-TCC font IDs starting at5; charset follows that ID.
  await upload('cyrillic.pxa',native({extension:'pxa',fonts:[{name:'Arial',charset:204}],noteIndex:4,note:[...font(5),...cyrillic]}));
  await page.waitForFunction(()=>document.querySelector('#importMessages').textContent.includes('annotation-file'));
  assert.equal(await page.locator('#text').inputValue(),imported);
  const noteSave=page.waitForEvent('download');await page.locator('#saveDoc').click();
  const withNote=JSON.parse(fs.readFileSync(await(await noteSave).path()));assert(withNote.notes.sets['body.front'].inL.text.includes('Привет'));
  await page.waitForFunction(()=>Array.from(document.querySelectorAll('#table text')).filter(n=>n.textContent==='Привет').length===2);
  await upload('unsupported.pxp',native({fonts:[{name:'Wingdings',charset:2}],body:[65,66]}));
  await page.waitForFunction(()=>document.querySelector('#text').value==='��');
  assert((await page.locator('#importMessages').textContent()).includes('charset 2'));assert((await page.locator('#importMessages').textContent()).includes('�'));
  await upload('locale.pxp',native({fonts:[{name:'Arial',charset:1}],body:[128]}));
  await page.waitForFunction(()=>document.querySelector('#text').value==='€');
  assert((await page.locator('#importMessages').textContent()).includes('source Windows locale'));
  assert.deepEqual(errors,[]);console.log('PASS: native Windows punctuation/Cyrillic upload, preview/print text, Save/Open, RTF export, PXA charset/scope, unsupported symbol replacements and locale warning');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
