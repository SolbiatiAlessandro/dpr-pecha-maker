const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');
global.PechaImages=require('../src/images');global.Folio=require('../src/folio');
const E=require('../src/engine'),{expected,rtf,sample}=require('./legacy-tcc-family-fixture');
const visible=text=>E.parseStream(text,false).filter(r=>r.k==='text').map(r=>r.s).join('');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const p=await browser.newPage({viewport:{width:1440,height:1100}}),errors=[];p.setDefaultTimeout(15000);p.on('pageerror',e=>errors.push(e.message));await p.goto(process.argv[2]);await p.locator('#pasteText').click();
  const upload=async(name,buffer)=>{await p.locator('#toast').evaluate(n=>n.textContent='');await p.locator('#openFile').setInputFiles({name,mimeType:'application/octet-stream',buffer});await p.waitForFunction(()=>document.querySelector('#toast').textContent.length>0);};
  const save=async()=>{const event=p.waitForEvent('download');await p.locator('#saveDoc').click();return fs.readFileSync(await(await event).path());};
  const base=E.defaultDoc();base.text='KEEP';base.counts={title:0,fancy:0};base.yigo.enabled=false;base.dzog.enabled=false;base.folio.start=23;base.pageNum.start=401;
  for(const ext of ['pxp','pxc','pxa']){
   await upload('base.pecha',Buffer.from(JSON.stringify(base)));await upload('tcc-families.'+ext,sample(ext));assert.equal(visible(await p.locator('#text').inputValue()),ext==='pxa'?'KEEP':expected);
   const report=await p.locator('#importMessages').textContent();assert(!report.includes('unsupported font'));assert(report.includes('comparison with the original fonts'));assert(!report.includes('could not be converted'));
  }
  const marks=JSON.parse(await save());assert.equal(visible(marks.notes.sets['body.front'].inL.text),'༄༅');assert.equal(visible(marks.folio.rhino),'༄༅');
  await upload('base.pecha',Buffer.from(JSON.stringify(base)));await upload('tcc-families.rtf',Buffer.from(rtf()));assert.equal(visible(await p.locator('#text').inputValue()),expected);assert(!(await p.locator('#importMessages').textContent()).includes('could not be mapped'));
  assert((await p.locator('#importMessages').textContent()).includes('comparison with the original fonts'));
  await p.waitForFunction(()=>document.querySelector('#table').textContent.includes('ཀ'));
  const glyphs=selector=>p.locator(selector+' text').evaluateAll(ns=>ns.filter(n=>n.getAttribute('fill')==='#b03020').map(n=>[n.textContent,n.getAttribute('font-family'),n.getAttribute('font-size'),n.getAttribute('font-weight')]));
  const original=await glyphs('#table');assert(original.length);assert(original.every(r=>r[1].includes('Jomolhari')&&r[2]==='24'&&r[3]==='700'));
  const saved=await save();await upload('saved.pecha',saved);assert.deepEqual(await glyphs('#table'),original);
  await p.getByText('Reuse text, layouts and annotations',{exact:true}).click();const before=await p.locator('#text').inputValue();await p.locator('#exportPxc').click();assert((await p.locator('#toast').textContent()).includes('cannot encode U+FC0'));assert.equal(await p.locator('#text').inputValue(),before);
  const event=p.waitForEvent('download');await p.locator('#exportRtf').click();await upload('exported.rtf',fs.readFileSync(await(await event).path()));assert.equal(visible(await p.locator('#text').inputValue()),expected);assert.deepEqual(await glyphs('#table'),original);
  await p.evaluate(()=>window.dispatchEvent(new Event('beforeprint')));assert.deepEqual(await glyphs('#printRoot'),original);assert((await p.locator('#printRoot').textContent()).includes('401'));
  const pdf=await p.pdf({preferCSSPageSize:true,printBackground:true});assert.equal(pdf.subarray(0,5).toString(),'%PDF-');if(process.env.QA_PDF)fs.writeFileSync(process.env.QA_PDF,pdf);
  const editor=p.locator('#text');await editor.focus();await editor.press('Control+i');await p.locator('#characterSource').selectOption('TibetanClassicSkt4');assert(await p.locator('#characterGrid [data-byte="139"]').isDisabled());assert((await p.locator('#characterGrid [data-byte="33"]').textContent()).includes('༊'));
  await editor.evaluate(t=>{t.focus();t.setSelectionRange(t.value.length,t.value.length);});await p.locator('#characterGrid [data-byte="33"]').click();assert.equal(visible(await editor.inputValue()),expected+'༊');await editor.press('Meta+z');assert.equal(visible(await editor.inputValue()),expected);
  if(process.env.QA_SCREENSHOT)await p.screenshot({path:process.env.QA_SCREENSHOT,fullPage:true});
  await upload('base.pecha',Buffer.from(JSON.stringify(base)));await editor.evaluate((t,s)=>{t.focus();t.setSelectionRange(0,t.value.length);const clipboardData=new DataTransfer();clipboardData.setData('text/rtf',s);t.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData}));},rtf());assert.equal(visible(await editor.inputValue()),expected);await editor.press('Meta+z');assert.equal(await editor.inputValue(),'KEEP');await editor.press('Meta+Shift+z');assert.equal(visible(await editor.inputValue()),expected);
  await upload('unresolved-alias.rtf',Buffer.from('{\\rtf1{\\fonttbl{\\f0 TibetanClassicSkt4;}}'+"\\'8b}"));assert.equal(visible(await editor.inputValue()),'�');assert((await p.locator('#importMessages').textContent()).includes('could not be mapped'));
  assert.deepEqual(errors,[]);console.log('PASS: Classic/Chogyal PXP/PXC/PXA and RTF uploads, body/mark scope and legacy typography, Save/RTF, bounded native-export rejection, chart/undo, paste, experimental and unresolved warnings and preview/print/PDF');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
