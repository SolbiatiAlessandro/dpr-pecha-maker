const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');
global.PechaImages=require('../src/images');global.Folio=require('../src/folio');
const E=require('../src/engine'),P=require('../src/pxp'),T=require('../src/legacy-table'),R=require('../src/rtf'),{cases,expected,dct,rtf,sample}=require('./legacy-byte-alias-fixture');
const visible=t=>E.parseStream(t,false).filter(r=>r.k==='text').map(r=>r.s).join('');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1100}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000);
  await page.goto(process.argv[2]||'http://127.0.0.1:53550/');await page.locator('#pasteText').click();
  const upload=async(name,buffer)=>{
   await page.locator('#toast').evaluate(n=>n.textContent='');await page.locator('#openFile').setInputFiles({name,mimeType:'application/octet-stream',buffer});
   if(name.endsWith('.dct')){await page.locator('#dctDialog').waitFor({state:'visible'});await page.locator('#dctImport').click();}
   await page.waitForFunction(()=>document.querySelector('#toast').textContent.length>0);
  };
  const save=async()=>{const e=page.waitForEvent('download');await page.locator('#saveDoc').click();return fs.readFileSync(await(await e).path());};
  for(const [name,data] of [['aliases.dct',dct()],['aliases.rtf',rtf()]]){
   await upload(name,data);assert.equal(visible(await page.locator('#text').inputValue()),expected);assert(!(await page.locator('#importMessages').textContent()).includes('could not be mapped'));
  }
  const d=sample(E);await upload('source.pecha',Buffer.from(JSON.stringify(d)));const before=JSON.parse(await save());
  await page.getByText('Reuse text, layouts and annotations',{exact:true}).click();
  for(const [kind,id] of [['pxp','exportPxp'],['pxc','exportPxc'],['pxa','exportPxa']]){
   await upload('source.pecha',Buffer.from(JSON.stringify(d)));const event=page.waitForEvent('download');await page.locator('#'+id).click();const data=fs.readFileSync(await(await event).path());
   assert.deepEqual(JSON.parse(await save()),before);const got=P.load(data,kind,T,E.defaultDoc(),E).doc;
   if(kind!=='pxa')assert.equal(visible(got.text),expected);assert.equal(visible(got.folio.rhino),cases[0].text);
   const target=E.defaultDoc();target.text='Retain';await upload('target.pecha',Buffer.from(JSON.stringify(target)));await upload('exported.'+kind,data);
   assert.equal(visible(await page.locator('#text').inputValue()),kind==='pxa'?'Retain':expected);
   if(kind==='pxa'){const saved=JSON.parse(await save());assert.equal(visible(saved.notes.sets['body.front'].inL.text),cases[2].text);assert.equal(visible(saved.folio.rhino),cases[0].text);}
  }
  await upload('final.pecha',Buffer.from(JSON.stringify(d)));await page.waitForFunction(()=>document.querySelector('#table').textContent.includes('ཛྫྭ'));
  await page.locator('#characterPicker summary').click();await page.locator('#characterSource').selectOption('TibetanMachineSkt1');const cell=page.locator('#characterGrid [data-byte="128"]');assert(await cell.isEnabled());assert((await cell.textContent()).includes(cases[0].text));
  const editor=page.locator('#text');await editor.evaluate(t=>{t.focus();t.setSelectionRange(t.value.length,t.value.length);});await cell.click();assert(visible(await editor.inputValue()).endsWith(cases[0].text));await editor.press('Meta+z');assert.equal(visible(await editor.inputValue()),expected);
  const [rtfDownload]=await Promise.all([page.waitForEvent('download'),page.locator('#exportRtf').click()]).catch(async e=>{console.error({errors,toast:await page.locator('#toast').textContent()});throw e;});assert.equal(visible(R.read(fs.readFileSync(await rtfDownload.path()),E,T).doc.text),expected);
  await page.evaluate(()=>window.dispatchEvent(new Event('beforeprint')));const text=await page.locator('#printRoot').textContent();for(const c of cases.slice(0,5))assert(text.includes(c.text));assert(text.includes('401'));
  const pdf=await page.pdf({preferCSSPageSize:true,printBackground:true});assert.equal(pdf.subarray(0,5).toString(),'%PDF-');if(process.env.QA_PDF)fs.writeFileSync(process.env.QA_PDF,pdf);
  await cell.scrollIntoViewIfNeeded();if(process.env.QA_SCREENSHOT)await page.screenshot({path:process.env.QA_SCREENSHOT,fullPage:true});
  assert.deepEqual(errors,[]);console.log('PASS: DCT/RTF byte aliases, PXP/PXC/PXA actual download/upload and scope, body/marks/source isolation, chart/undo, Save/RTF, folios/print/PDF, no JS errors');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
