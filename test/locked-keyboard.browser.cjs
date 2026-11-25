const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');
global.PechaImages=require('../src/images');global.Folio=require('../src/folio');
const E=require('../src/engine'),R=require('../src/rtf'),T=require('../src/legacy-table');
const runs=text=>E.parseStream(text,false).filter(r=>r.k==='text'),plain=text=>runs(text).map(r=>r.s).join('');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const p=await browser.newPage({viewport:{width:1440,height:1100}}),errors=[];p.setDefaultTimeout(15000);p.on('pageerror',e=>errors.push(e.message));await p.goto(process.argv[2]);await p.locator('#pasteText').click();const editor=p.locator('#text');
  const upload=async(name,buffer)=>{await p.locator('#toast').evaluate(n=>n.textContent='');await p.locator('#openFile').setInputFiles({name,mimeType:'application/octet-stream',buffer:Buffer.isBuffer(buffer)?buffer:Buffer.from(buffer)});await p.waitForFunction(()=>document.querySelector('#toast').textContent.length>0);};
  const save=async()=>{const next=p.waitForEvent('download');await p.locator('#saveDoc').click();return fs.readFileSync(await(await next).path());};
  const reset=async(text)=>{const d=E.defaultDoc();d.text=text;d.counts={title:0,fancy:0};d.yigo.enabled=false;d.dzog.enabled=false;await upload('base.pecha',JSON.stringify(d));};
  const caret=async(start,end=start)=>{await editor.focus();await editor.evaluate((t,[a,b])=>t.setSelectionRange(a,b),[start,end]);};
  const source='{font:serif 14 #0044aa l}AB{font:noto 25 /b}ཀཁ';await reset(source);
  await p.locator('#lockedKeyboardSettings > summary').click();await p.locator('#lockedFont').fill('Arial');await p.locator('#lockedSize').fill('20');await p.locator('#lockedColor').fill('#b03020');await p.locator('#lockedBold').check();
  const at=source.indexOf('AB')+1;await caret(at);await p.keyboard.press('Control+k');assert(await p.locator('#lockedKeyboard').isChecked());assert(await p.locator('#selectionFont').isDisabled());assert(await p.locator('#applySelection').isDisabled());assert(await p.locator('#codes').getByRole('button',{name:'Bold',exact:true}).isDisabled());assert(await p.locator('#codes').getByRole('button',{name:'Centre',exact:true}).isEnabled());assert((await p.locator('#lockedKeyboardStatus').textContent()).includes('Arial, 20 pt'));
  await p.keyboard.type('x');const first=await editor.inputValue();assert.equal(plain(first),'AxBཀཁ');const x=runs(first).find(r=>r.s==='x');assert.equal(x.style.font,'family:Arial');assert.equal(x.style.size,20);assert(x.style.bold);assert.equal(x.style.color,'#b03020');assert.equal(runs(first).find(r=>r.s==='B').style.size,14);
  await p.keyboard.press('Meta+z');assert.equal(await editor.inputValue(),source);await p.keyboard.press('Meta+Shift+z');assert.equal(await editor.inputValue(),first);
  await caret(first.indexOf('x')+1);await p.keyboard.type('y');assert.equal(plain(await editor.inputValue()),'AxyBཀཁ');
  let text=await editor.inputValue();await caret(text.length);await p.keyboard.insertText('ི');text=await editor.inputValue();assert.equal(plain(text),'AxyBཀཁི');assert(runs(text).some(r=>r.s==='ཁི'&&r.style.size===20));
  await p.keyboard.press('Meta+k');assert(!(await p.locator('#lockedKeyboard').isChecked()));assert(await p.locator('#selectionFont').isEnabled());assert(await p.locator('#codes').getByRole('button',{name:'Bold',exact:true}).isEnabled());
  const b=text.indexOf('B');await caret(b);await p.keyboard.type('n');assert(runs(await editor.inputValue()).some(r=>r.s.includes('nB')&&r.style.size===14));
  // Typeover and a completed real Chromium IME composition.
  await reset('ABC');await p.locator('#lockedKeyboard').check();await p.locator('#typeover').check();await caret(1);await p.keyboard.type('Z');assert.equal(plain(await editor.inputValue()),'AZC');
  await reset('AB');await p.locator('#lockedKeyboard').check();await caret(1);const cdp=await p.context().newCDPSession(p);
  await cdp.send('Input.imeSetComposition',{text:'ཀ',selectionStart:1,selectionEnd:1});await cdp.send('Input.imeSetComposition',{text:'ཀི',selectionStart:2,selectionEnd:2});await cdp.send('Input.insertText',{text:'ཀི'});
  await p.waitForFunction(()=>document.querySelector('#text').value.includes('family:Arial'));text=await editor.inputValue();assert.equal(plain(text),'AཀིB');assert(runs(text).some(r=>r.s==='ཀི'&&r.style.size===20));
  // Locked typing must not rewrite supplied RTF styles.
  await caret(text.length);await editor.evaluate(t=>{const data=new DataTransfer();data.setData('text/rtf',String.raw`{\rtf1{\fonttbl{\f0 Georgia;}}\fs30 Paste}`);t.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:data}));});
  assert(runs(await editor.inputValue()).some(r=>r.s==='Paste'&&r.style.size===15&&r.style.font==='serif'));
  await p.locator('#f_textSize').fill('40');assert((await p.locator('#lockedKeyboardStatus').textContent()).includes('40 pt'));await p.locator('#f_textSize').fill('');
  const saved=await save(),doc=JSON.parse(saved);assert(await p.locator('#lockedKeyboard').isChecked());assert.equal(doc.text,await editor.inputValue());
  await p.waitForFunction(()=>document.querySelector('#table').textContent.includes('Paste'));
  const styles=selector=>p.locator(selector+' text').evaluateAll(ns=>ns.filter(n=>['A','ཀི','B','Paste'].includes(n.textContent)).map(n=>[n.textContent,n.getAttribute('font-family'),n.getAttribute('font-size'),n.getAttribute('fill'),n.getAttribute('font-weight')]));
  const preview=await styles('#table');assert(preview.some(([s,f,z,c,w])=>s==='ཀི'&&f.includes('Arial')&&z==='20'&&c==='#b03020'&&w==='700'));await p.evaluate(()=>window.dispatchEvent(new Event('beforeprint')));assert.deepEqual(await styles('#printRoot'),preview);
  const pdf=await p.pdf({preferCSSPageSize:true,printBackground:true});assert.equal(pdf.subarray(0,5).toString(),'%PDF-');assert.equal((pdf.toString('latin1').match(/\/Type\s*\/Page\b/g)||[]).length,await p.locator('#printRoot .sheet-print').count());if(process.env.QA_PDF)fs.writeFileSync(process.env.QA_PDF,pdf);
  if(process.env.QA_SCREENSHOT)await p.screenshot({path:process.env.QA_SCREENSHOT,fullPage:true});
  assert.equal(plain(R.read(R.write(doc,E),E,T).doc.text),plain(doc.text));
  for(const kind of ['template','annotations']){await upload(kind+'.pecha',JSON.stringify({format:'web-pecha-part',version:1,kind,settings:{}}));assert(await p.locator('#lockedKeyboard').isChecked());assert.equal(await editor.inputValue(),doc.text);}
  await upload('layout.pxt','; PechaMaker Template file.\n[File Version 0.1]\n[PageSetup]\nPaperSize.x=14000\nPaperSize.y=8500\n[PechaControl]\nPechaHeight=3\n');assert(await p.locator('#lockedKeyboard').isChecked());
  await upload('saved.pecha',saved);assert(!(await p.locator('#lockedKeyboard').isChecked()));assert.equal(await editor.inputValue(),doc.text);
  await p.locator('#lockedKeyboard').check();await upload('content.pecha',JSON.stringify({format:'web-pecha-part',version:1,kind:'content',settings:{text:'Replacement'}}));assert(!(await p.locator('#lockedKeyboard').isChecked()));
  await p.reload();assert.equal(await p.locator('#lockedFont').inputValue(),'Arial');assert.equal(await p.locator('#lockedSize').inputValue(),'20');assert(await p.locator('#lockedBold').isChecked());assert(!(await p.locator('#lockedKeyboard').isChecked()));
  assert.deepEqual(errors,[]);console.log('PASS: locked typing controls/shortcuts/preferences, attribute isolation, undo/redo, repeated text, Tibetan combining and IME, Typeover, RTF paste, size warning, preview/print/PDF, Save/Open and partial/full scope');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
