const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');
global.PechaImages=require('../src/images');global.Folio=require('../src/folio');const E=require('../src/engine');
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const p=await browser.newPage({viewport:{width:1440,height:1100}}),errors=[];p.setDefaultTimeout(15000);p.on('pageerror',e=>errors.push(e.message));await p.goto(process.argv[2]);await p.locator('#pasteText').click();
 const upload=async(name,buffer)=>{await p.locator('#toast').evaluate(n=>n.textContent='');await p.locator('#openFile').setInputFiles({name,mimeType:'application/octet-stream',buffer});await p.waitForFunction(()=>document.querySelector('#toast').textContent.length>0);};
 const download=async button=>{const next=p.waitForEvent('download');await p.locator(button).click();return fs.readFileSync(await(await next).path());};
 const d=E.defaultDoc();d.flow=false;d.counts={title:0,fancy:0};d.paper={name:'Custom',w:5,h:8.27};d.yigo.enabled=false;d.dzog.enabled=false;d.folio.start=23;d.pageNum.start=401;
 Object.assign(d.types.body,{lines:8,style:'none',sideOut:.45,sideIn:0,side:0,top:.2});
 d.text='{font:family:Times%20New%20Roman 24 l}RIGHT{r}\nCENTRE{c}\nLEFT{l}\nFINAL{r}';
 const box=E.boxes(d,d.types.body).T;
 const geometry=()=>p.locator('#table text').evaluateAll(ns=>ns.filter(n=>/^(RIGHT|CENTRE|LEFT|FINAL)$/.test(n.textContent)).map(n=>({text:n.textContent,x:+n.getAttribute('x'),y:+n.getAttribute('y'),w:n.getComputedTextLength(),font:n.getAttribute('font-family')})));
 const verify=async()=>{const rows=await geometry();assert.equal(rows.length,4);for(const [i,row] of rows.entries()){if(i)assert(row.y>rows[i-1].y);const target=row.text==='LEFT'?row.x:row.text==='CENTRE'?row.x+row.w/2:row.x+row.w;const expected=row.text==='LEFT'?box.x0:row.text==='CENTRE'?(box.x0+box.x1)/2:box.x1;assert(Math.abs(target-expected)<.2,JSON.stringify({row,target,expected}));}return rows;};
 await upload('alignment.pecha',Buffer.from(JSON.stringify(d)));await p.waitForFunction(()=>document.querySelector('#table').textContent.includes('FINAL'));const original=await verify();
 // The real insertion button at the end of the first line must affect that line.
 const plain={...d,text:d.text.replace('RIGHT{r}','RIGHT')};await upload('left-first.pecha',Buffer.from(JSON.stringify(plain)));assert.equal((await geometry())[0].x,box.x0);
 await p.locator('#text').evaluate(t=>{const at=t.value.indexOf('RIGHT')+5;t.focus();t.setSelectionRange(at,at);});await p.getByRole('button',{name:'Right',exact:true}).click();await p.waitForFunction(()=>[...document.querySelectorAll('#table text')].some(n=>n.textContent==='RIGHT'&&+n.getAttribute('x')>100));assert.deepEqual(await verify(),original);
 const saved=await download('#saveDoc');await upload('saved.pecha',saved);assert.deepEqual(await verify(),original);
 await p.getByText('Reuse text, layouts and annotations',{exact:true}).click();await upload('roundtrip.rtf',await download('#exportRtf'));assert.deepEqual(await verify(),original);
 await upload('roundtrip.pxc',await download('#exportPxc'));assert.deepEqual(await verify(),original);
 const texts=selector=>p.locator(selector+' text').evaluateAll(ns=>ns.filter(n=>n.hasAttribute('x')).map(n=>[n.textContent,n.getAttribute('x'),n.getAttribute('y'),n.getAttribute('font-size')]));await p.evaluate(()=>window.dispatchEvent(new Event('beforeprint')));assert.deepEqual(await texts('#printRoot'),await texts('#table'));const printed=await p.locator('#printRoot').textContent();assert(printed.includes('ཉི་ཤུ་རྩ་གསུམ་')&&printed.includes('401'));
 const pdf=await p.pdf({preferCSSPageSize:true,printBackground:true});assert.equal(pdf.subarray(0,5).toString(),'%PDF-');if(process.env.QA_PDF)fs.writeFileSync(process.env.QA_PDF,pdf);if(process.env.QA_SCREENSHOT)await p.screenshot({path:process.env.QA_SCREENSHOT,fullPage:true});
 const before=await p.locator('#text').inputValue(),rtf=String.raw`{\rtf1{\fonttbl{\f0 Times New Roman;}}\fs48\ql RIGHT\qr\par CENTRE\qc\par LEFT\ql\par FINAL\qr}`;
 await p.locator('#text').evaluate((t,rtf)=>{t.focus();t.setSelectionRange(0,t.value.length);const clipboardData=new DataTransfer();clipboardData.setData('text/rtf',rtf);t.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData}));},rtf);await verify();await p.locator('#text').focus();await p.keyboard.press('Meta+z');assert.equal(await p.locator('#text').inputValue(),before);assert.deepEqual(await verify(),original);
 assert.deepEqual(errors,[]);console.log('PASS: trailing alignment controls, real Right insertion, right/centre/left/right geometry, Save/RTF/PXC, trailing-control paste/undo and numberedpreview/print/PDF');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
