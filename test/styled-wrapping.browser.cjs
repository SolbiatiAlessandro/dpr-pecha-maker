const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');
global.PechaImages=require('../src/images');global.Folio=require('../src/folio');
const E=require('../src/engine'),visible=s=>E.parseStream(s,false).filter(r=>r.k==='text').map(r=>r.s).join('').replace(/\u2028/g,'\n');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const p=await browser.newPage({viewport:{width:1440,height:1100}}),errors=[];p.setDefaultTimeout(15000);p.on('pageerror',e=>errors.push(e.message));await p.goto(process.argv[2]);await p.locator('#pasteText').click();
  const upload=async(name,buffer)=>{await p.locator('#toast').evaluate(n=>n.textContent='');await p.locator('#openFile').setInputFiles({name,mimeType:'application/octet-stream',buffer});await p.waitForFunction(()=>document.querySelector('#toast').textContent.length>0);};
  const download=async button=>{const next=p.waitForEvent('download');await p.locator(button).click();return fs.readFileSync(await(await next).path());};
  const d=E.defaultDoc();d.flow=false;d.counts={title:0,fancy:0};d.paper={name:'Custom',w:5,h:8.27};d.yigo.enabled=false;d.dzog.enabled=false;d.folio.start=23;d.pageNum.start=401;
  Object.assign(d.types.body,{lines:4,style:'none',sideOut:0,sideIn:0,side:0,top:.2});
  d.text='{font:family:Times%20New%20Roman 36 l}PREFIX ALPHA{b #aa0000}BETA{/b}';
  await upload('joined.pecha',Buffer.from(JSON.stringify(d)));await p.waitForFunction(()=>document.querySelector('#table').textContent.includes('BETA'));
  const geometry=()=>p.locator('#table text').evaluateAll(ns=>ns.filter(n=>/PREFIX|ALPHA|BETA/.test(n.textContent)).map(n=>({text:n.textContent,x:+n.getAttribute('x'),y:+n.getAttribute('y'),weight:n.getAttribute('font-weight'),color:getComputedStyle(n).fill})));
  const joined=await geometry(),prefix=joined.find(r=>r.text==='PREFIX'),a=joined.find(r=>r.text==='ALPHA'),b=joined.find(r=>r.text.includes('BETA'));
  assert(prefix&&a&&b);assert(a.y>prefix.y);assert.equal(a.y,b.y);assert.equal(b.weight,'700');assert.equal(await p.locator('#table text').filter({hasText:'BETA'}).getAttribute('fill'),'#aa0000');
  const ordinary={...d,text:d.text.replace('BETA',' BETA')};await upload('ordinary.pecha',Buffer.from(JSON.stringify(ordinary)));const separate=await geometry();assert.equal(separate.find(r=>r.text==='ALPHA').y,separate.find(r=>r.text==='PREFIX').y);assert(separate.find(r=>r.text==='BETA').y>separate.find(r=>r.text==='ALPHA').y);
  await upload('joined.pecha',Buffer.from(JSON.stringify(d)));const saved=await download('#saveDoc');await upload('saved.pecha',saved);assert.deepEqual(await geometry(),joined);assert.equal(await p.locator('#text').inputValue(),d.text);
  await p.getByText('Reuse text, layouts and annotations',{exact:true}).click();await upload('roundtrip.rtf',await download('#exportRtf'));assert.equal(visible(await p.locator('#text').inputValue()),'PREFIX ALPHABETA');assert.deepEqual(await geometry(),joined);
  const rendered=selector=>p.locator(selector+' text').evaluateAll(ns=>ns.filter(n=>n.hasAttribute('x')).map(n=>[n.textContent,n.getAttribute('x'),n.getAttribute('y'),n.getAttribute('font-family'),n.getAttribute('font-size')]));await p.evaluate(()=>window.dispatchEvent(new Event('beforeprint')));assert.deepEqual(await rendered('#printRoot'),await rendered('#table'));assert((await p.locator('#printRoot').textContent()).includes('ཉི་ཤུ་རྩ་གསུམ་'));assert((await p.locator('#printRoot').textContent()).includes('401'));
  const pdf=await p.pdf({preferCSSPageSize:true,printBackground:true});assert.equal(pdf.subarray(0,5).toString(),'%PDF-');if(process.env.QA_PDF)fs.writeFileSync(process.env.QA_PDF,pdf);if(process.env.QA_SCREENSHOT)await p.screenshot({path:process.env.QA_SCREENSHOT,fullPage:true});
  await upload('roundtrip.pxc',await download('#exportPxc'));assert.equal(visible(await p.locator('#text').inputValue()),'PREFIX ALPHABETA');assert.deepEqual(await geometry(),joined);
  // The RTF control symbol takes the same layout path; a body paste retains it and undo restores the document.
  const rtf=String.raw`{\rtf1{\fonttbl{\f0 Times New Roman;}}{\colortbl;\red170\green0\blue0;}\fs72\ql PREFIX ALPHA{\b\cf1 BETA}}`;
  const before=await p.locator('#text').inputValue();await p.locator('#text').evaluate((t,rtf)=>{t.focus();t.setSelectionRange(0,t.value.length);const clipboardData=new DataTransfer();clipboardData.setData('text/rtf',rtf);t.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData}));},rtf);assert.equal(visible(await p.locator('#text').inputValue()),'PREFIX ALPHABETA');await p.waitForFunction(()=>document.querySelector('#table').textContent.includes('BETA'));assert.deepEqual(await geometry(),joined);await p.locator('#text').focus();await p.keyboard.press('Meta+z');assert.equal(await p.locator('#text').inputValue(),before);
  const tib={...d,text:'{font:jomolhari 36 l}ཀ{b #aa0000}།{/b} །ཁ་'};
  await upload('tibetan.pecha',Buffer.from(JSON.stringify(tib)));
  const tibText=await p.locator('#table text').allTextContents();assert(tibText.includes('༑'));assert(tibText.some(s=>s.startsWith('༑ཁ་')));
  const colored=await p.locator('#table text').filter({hasText:/^༑$/}).evaluate(n=>({fill:n.getAttribute('fill'),weight:n.getAttribute('font-weight')}));assert.deepEqual(colored,{fill:'#aa0000',weight:'700'});
  assert.equal(await p.locator('#text').inputValue(),tib.text,'display conversion does not alter the saved source');
  if(process.env.QA_TIBETAN)await p.screenshot({path:process.env.QA_TIBETAN,fullPage:true});
  await upload('hard-shad.pecha',Buffer.from(JSON.stringify({...tib,text:tib.text.replace('།{/b}','{hs}{/b}')})));
  assert(!(await p.locator('#table').textContent()).includes('༑'),'hard shad remains excluded from conversion');
  assert.deepEqual(errors,[]);console.log('PASS: font-run words stay on one line, explicit spaces wrap, styles/geometry survive Save/RTF/PXC, paste/undo, numberedpreview/print/PDF and styled Tibetan shad/hard-shad rendering');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
