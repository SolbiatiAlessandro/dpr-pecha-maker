const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');
global.PechaImages=require('../src/images');global.Folio=require('../src/folio');
const E=require('../src/engine'),{fixture,expected}=require('./rtf-missing-font-fixture'),{cases,raw}=require('./rtf-raw-dbcs-fixture');
const visible=s=>E.parseStream(s,false).filter(r=>r.k==='text').map(r=>r.s).join('');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const p=await browser.newPage({viewport:{width:1440,height:1100}}),errors=[];p.setDefaultTimeout(15000);p.on('pageerror',e=>errors.push(e.message));await p.goto(process.argv[2]);await p.locator('#pasteText').click();
  const upload=async(name,buffer)=>{await p.locator('#toast').evaluate(n=>n.textContent='');await p.locator('#openFile').setInputFiles({name,mimeType:'application/octet-stream',buffer});await p.waitForFunction(()=>document.querySelector('#toast').textContent.length>0);};
  const download=async button=>{const next=p.waitForEvent('download');await p.locator(button).click();return fs.readFileSync(await(await next).path());};
  const base=E.defaultDoc();base.text='KEEP';base.counts={title:0,fancy:0};base.yigo.enabled=false;base.dzog.enabled=false;base.folio.start=23;base.pageNum.start=401;
  await upload('base.pecha',Buffer.from(JSON.stringify(base)));await upload('missing-font.rtf',Buffer.from(fixture));assert.equal(visible(await p.locator('#text').inputValue()),expected);assert((await p.locator('#importMessages').textContent()).includes('font 0 is missing'));
  await p.waitForFunction(()=>document.querySelector('#table').textContent.includes('Café'));
  const styles=selector=>p.locator(selector+' text').evaluateAll(ns=>ns.filter(n=>/ཀ|ཁ|Café/.test(n.textContent)).map(n=>[n.textContent,n.getAttribute('font-family'),n.getAttribute('font-size'),n.getAttribute('font-weight')]));
  const preview=await styles('#table');assert(preview.some(r=>r[0].includes('ཀ')&&r[1].includes('Jomolhari')&&r[2]==='24'&&r[3]==='700'));assert(preview.some(r=>r[0].includes('Café')&&r[1].includes('Times New Roman')&&r[2]==='24'));
  const saved=await download('#saveDoc');await upload('saved.pecha',saved);assert.equal(visible(await p.locator('#text').inputValue()),expected);assert.deepEqual(await styles('#table'),preview);
  await p.getByText('Reuse text, layouts and annotations',{exact:true}).click();await upload('roundtrip.rtf',await download('#exportRtf'));assert.equal(visible(await p.locator('#text').inputValue()),expected);assert.deepEqual(await styles('#table'),preview);assert(!(await p.locator('#importMessages').textContent()).includes('font 0 is missing'));
  await p.evaluate(()=>window.dispatchEvent(new Event('beforeprint')));assert.deepEqual(await styles('#printRoot'),preview);assert((await p.locator('#printRoot').textContent()).includes('ཉི་ཤུ་རྩ་གསུམ་'));assert((await p.locator('#printRoot').textContent()).includes('401'));
  const pdf=await p.pdf({preferCSSPageSize:true,printBackground:true});assert.equal(pdf.subarray(0,5).toString(),'%PDF-');if(process.env.QA_PDF)fs.writeFileSync(process.env.QA_PDF,pdf);if(process.env.QA_SCREENSHOT)await p.screenshot({path:process.env.QA_SCREENSHOT,fullPage:true});
  await upload('roundtrip.pxc',await download('#exportPxc'));assert.equal(visible(await p.locator('#text').inputValue()),expected);
  for(const c of cases){const input=String.raw`{\rtf1\ansi\deff0{\fonttbl{\f7\fcharset`+c.charset+String.raw` Arial;}{\f2 Times New Roman;}}\fs36 `+raw(c.hex)+'}';await upload('raw.rtf',Buffer.from(input,'latin1'));assert.equal(visible(await p.locator('#text').inputValue()),c.text);assert((await p.locator('#importMessages').textContent()).includes('font 0 is missing'));}
  await upload('base.pecha',Buffer.from(JSON.stringify(base)));
  const paste=selector=>p.locator(selector).evaluate((t,rtf)=>{t.focus();t.setSelectionRange(0,t.value.length);const clipboardData=new DataTransfer();clipboardData.setData('text/rtf',rtf);t.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData}));},fixture);
  await paste('#text');assert.equal(visible(await p.locator('#text').inputValue()),expected);await p.locator('#text').focus();await p.keyboard.press('Meta+z');assert.equal(await p.locator('#text').inputValue(),'KEEP');await p.keyboard.press('Meta+Shift+z');assert.equal(visible(await p.locator('#text').inputValue()),expected);
  await p.locator('[data-tab="marks"]').click();for(const selector of ['#f_yigo_text','#f_folio_rhino','#f_notes_sets_body_front_inL_text']){await paste(selector);assert.equal(visible(await p.locator(selector).inputValue()),expected);}
  assert.deepEqual(errors,[]);console.log('PASS: missing font0 RTF upload/warning/Tibetan and Latin24pt style, Save/RTF/nativePXC roundtrips, numberedpreview/print/PDF, raw ShiftJIS/GBK/Big5, body pasteundo/redo and three mark destinations');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
