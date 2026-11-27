const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright'),F=require('./jpeg-density-fixture');
global.PechaImages=require('../src/images');global.Folio=require('../src/folio');const E=require('../src/engine');
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const p=await browser.newPage({viewport:{width:1440,height:1100}}),errors=[];p.setDefaultTimeout(15000);p.on('pageerror',e=>errors.push(e.message));await p.goto(process.argv[2]);await p.locator('#pasteText').click();
 const pixels=Buffer.from(await p.evaluate(()=>{const c=document.createElement('canvas');c.width=96;c.height=48;const ctx=c.getContext('2d');for(const [x,y,color] of [[0,0,'#ff0000'],[48,0,'#00ff00'],[0,24,'#0000ff'],[48,24,'#ffff00']]){ctx.fillStyle=color;ctx.fillRect(x,y,48,24);}return c.toDataURL('image/jpeg',1).split(',')[1];}),'base64');
 const d=E.defaultDoc();d.text='{font:jomolhari 24 l}ཀྱུ་ TEST';d.counts={title:0,fancy:0};d.yigo.enabled=false;d.dzog.enabled=false;d.types.body.top=.5;d.folio.start=23;d.pageNum.start=401;
 const upload=async(name,buffer)=>{await p.locator('#toast').evaluate(n=>n.textContent='');await p.locator('#openFile').setInputFiles({name,mimeType:'application/octet-stream',buffer});await p.waitForFunction(()=>document.querySelector('#toast').textContent.length>0);};
 const fresh=()=>upload('fixture.pecha',Buffer.from(JSON.stringify(d)));
 const download=async id=>{const next=p.waitForEvent('download');await p.locator(id).click();return fs.readFileSync(await(await next).path());};
 const add=async(buffer,kind='inline')=>{await p.locator('#newImageKind').selectOption(kind);const count=await p.locator('#imagePick option').count();await p.locator('#imageFile').setInputFiles({name:'generated.jpg',mimeType:'image/jpeg',buffer});await p.waitForFunction(n=>document.querySelectorAll('#imagePick option').length===n+1,count);};
 const imageState=()=>p.evaluate(()=>({assets:doc.assets,images:doc.images}));
 const geometry=()=>p.locator('#table image').evaluateAll(ns=>ns.map(n=>[+n.getAttribute('width'),+n.getAttribute('height')]));
 const checkGeometry=async(expected)=>{await p.waitForFunction(expected=>{const ns=[...document.querySelectorAll('#table image')];return ns.length===expected.length&&ns.every((n,i)=>Math.abs(+n.getAttribute('width')-expected[i][0])<.02&&Math.abs(+n.getAttribute('height')-expected[i][1])<.02);},expected);};
 await fresh();await p.getByText('Images',{exact:true}).click();
 for(const orientation of [1,2,3,4,5,6,7,8]){
  await fresh();await add(F.jpeg(pixels,[F.jfif(72,72),F.exif({x:192,y:144,orientation,little:orientation%2===1})]));
  const s=await imageState(),rotated=orientation>=5;assert.deepEqual([s.assets[0].width,s.assets[0].height],rotated?[48,96]:[96,48]);assert.deepEqual([s.images[0].dpi,s.images[0].dpiY],rotated?[144,192]:[192,144]);await checkGeometry([rotated?[24,36]:[36,24]]);
  const rgb=await p.evaluate(async data=>{const im=new Image();im.src=data;await im.decode();const c=document.createElement('canvas');c.width=im.naturalWidth;c.height=im.naturalHeight;const ctx=c.getContext('2d');ctx.drawImage(im,0,0);return [...ctx.getImageData(8,8,1,1).data].slice(0,3);},s.assets[0].data);
  const expected=[[255,0,0],[0,255,0],[255,255,0],[0,0,255],[255,0,0],[0,0,255],[255,255,0],[0,255,0]][orientation-1];assert(rgb.every((v,i)=>Math.abs(v-expected[i])<5),'oriented pixels match Exif '+orientation);
 }
 for(const [segments,dpi,size] of [[ [F.jfif(192,144)], [192,144],[36,24] ],[[F.jfif(100,50,2)],[254,127],[96*72/254,48*72/127]],[[F.jfif(10,5,0)],[96,null],[72,36]],[[F.exif({denominator:0})],[96,null],[72,36]],[[F.jfif(3000,5)],[2400,10],[2.88,345.6]]]){
  await fresh();await add(F.jpeg(pixels,segments));assert.deepEqual((await imageState()).images.map(x=>[x.dpi,x.dpiY]),[dpi]);await checkGeometry([size]);if(dpi[0]===2400)assert((await p.locator('#toast').textContent()).includes('10–2400'));
 }
 await fresh();const rotated=F.jpeg(pixels,[F.exif({x:192,y:144,orientation:6})]);await add(rotated);
 await p.locator('#f_images_0_ignoreDpi').check();await checkGeometry([[36,72]]);await p.locator('#f_images_0_ignoreDpi').uncheck();await checkGeometry([[24,36]]);
 const png=await download('#exportImage'),res=PechaImages.pngResolution(png);assert(Math.abs(res.x-144)<.013&&Math.abs(res.y-192)<.013);
 await add(rotated,'yigo');await add(rotated,'page');assert.equal((await imageState()).assets.length,1,'identical converted PNGs deduplicate');await checkGeometry([[24,36],[24,36],[24,36]]);
 const saved=await download('#saveDoc');await upload('saved.pecha',saved);await checkGeometry([[24,36],[24,36],[24,36]]);
 await p.getByText('Reuse text, layouts and annotations',{exact:true}).click();
 await upload('roundtrip.rtf',await download('#exportRtf'));await checkGeometry([[24,36],[24,36]]);
 await upload('saved.pecha',saved);await upload('roundtrip.pxc',await download('#exportPxc'));await checkGeometry([[24,36],[24,36],[24,36]]);
 await upload('saved.pecha',saved);await upload('roundtrip.pxp',await download('#exportPxp'));await checkGeometry([[24,36],[24,36],[24,36]]);
 await p.evaluate(()=>window.dispatchEvent(new Event('beforeprint')));const print=await p.locator('#printRoot image').evaluateAll(ns=>ns.map(n=>[+n.getAttribute('width'),+n.getAttribute('height')]));assert.deepEqual(print,await geometry());assert((await p.locator('#printRoot').textContent()).includes('ཉི་ཤུ་རྩ་གསུམ་'));assert((await p.locator('#printRoot').textContent()).includes('401'));
 const pdf=await p.pdf({preferCSSPageSize:true,printBackground:true});assert.equal(pdf.subarray(0,5).toString(),'%PDF-');if(process.env.QA_PDF)fs.writeFileSync(process.env.QA_PDF,pdf);if(process.env.QA_SCREENSHOT)await p.screenshot({path:process.env.QA_SCREENSHOT,fullPage:true});assert.deepEqual(errors,[]);
 console.log('PASS: JPEG JFIF/Exif DPI, all8 orientations and pixels, invalid/relative fallback, Ignore DPI, PNG metadata, inline/yi-go/page dedup, Save/RTF/PXC/PXP and numberedpreview/print/PDF');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
