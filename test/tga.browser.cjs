const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright'),{tga}=require('./tga-fixture');
global.PechaImages=require('../src/images');global.Folio=require('../src/folio');const E=require('../src/engine');
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const p=await browser.newPage({viewport:{width:1440,height:1100}}),errors=[];p.setDefaultTimeout(15000);p.on('pageerror',e=>errors.push(e.message));await p.goto(process.argv[2]);await p.locator('#pasteText').click();
 const d=E.defaultDoc();d.text='{font:jomolhari 24 l}ཀྱུ་ {font:family:Times%20New%20Roman}TARGA ';d.counts={title:0,fancy:0};d.yigo.enabled=false;d.dzog.enabled=false;d.types.body.top=.6;d.folio.start=23;d.pageNum.start=401;
 const upload=async(name,buffer)=>{await p.locator('#toast').evaluate(n=>n.textContent='');await p.locator('#openFile').setInputFiles({name,mimeType:'application/octet-stream',buffer});await p.waitForFunction(()=>document.querySelector('#toast').textContent.length>0);};
 const fresh=()=>upload('fixture.pecha',Buffer.from(JSON.stringify(d)));
 const download=async id=>{const next=p.waitForEvent('download');await p.locator(id).click();return fs.readFileSync(await(await next).path());};
 const add=async(buffer,kind='inline',name='generated.tga')=>{await p.locator('#newImageKind').selectOption(kind);const count=await p.locator('#imagePick option').count();await p.locator('#imageFile').setInputFiles({name,mimeType:'application/octet-stream',buffer});await p.waitForFunction(n=>document.querySelectorAll('#imagePick option').length===n+1,count);};
 const state=()=>p.evaluate(()=>({assets:doc.assets,images:doc.images}));
 const corners=async()=>p.evaluate(async()=>{const im=new Image();im.src=doc.assets[0].data;await im.decode();const c=document.createElement('canvas');c.width=im.naturalWidth;c.height=im.naturalHeight;const ctx=c.getContext('2d');ctx.drawImage(im,0,0);return [[1,1],[c.width-2,1],[1,c.height-2],[c.width-2,c.height-2]].map(([x,y])=>[...ctx.getImageData(x,y,1,1).data]);});
 const checkGeometry=async(expected)=>p.waitForFunction(expected=>{const ns=[...document.querySelectorAll('#table image')].map(n=>[+n.getAttribute('width'),+n.getAttribute('height')]).sort((a,b)=>a[0]-b[0]);expected.sort((a,b)=>a[0]-b[0]);return ns.length===expected.length&&ns.every((n,i)=>Math.abs(n[0]-expected[i][0])<.02&&Math.abs(n[1]-expected[i][1])<.02);},expected);
 await fresh();await p.getByText('Images',{exact:true}).click();assert((await p.locator('#imageFile').getAttribute('accept')).includes('.tga'));
 const rgb=[[255,0,0,255],[0,255,0,255],[0,0,255,255],[255,255,0,255]],alpha=[[255,0,0,255],[0,0,0,0],[0,0,255,128],[255,255,0,255]],gray=[[0,0,0,255],[85,85,85,255],[170,170,170,255],[255,255,255,255]];
 const cases=[...Array.from({length:4},(_,i)=>({type:2,bits:24,origin:i*16})),...Array.from({length:4},(_,i)=>({type:10,bits:32,origin:i*16})),{type:1,bits:8,paletteBits:24},{type:9,bits:16,paletteBits:32,first:300},{type:2,bits:15},{type:10,bits:16},{type:3,bits:8},{type:11,bits:16},...Array.from({length:5},(_,alphaType)=>({type:10,bits:32,alphaType}))];
 for(const options of cases){
  await fresh();await add(tga(options),'inline',options.alphaType===undefined?'generated.TARGA':'footer-identified.bin');
  let expected=structuredClone((options.type&7)===3?gray:(options.bits===32||options.paletteBits===32)?alpha:rgb);
  if((options.type&7)===3&&options.bits===16){expected[1]=[0,0,0,0];expected[2][3]=128;}
  if((options.type&7)===2&&options.bits===16)expected[1]=[0,0,0,0];
  if(options.alphaType===0||options.alphaType===1)expected=rgb;
  const actual=await corners();for(let i=0;i<4;i++){assert.equal(actual[i][3],expected[i][3],JSON.stringify(options));for(let c=0;c<3;c++)assert(Math.abs(actual[i][c]-expected[i][c])<=(expected[i][3]>0&&expected[i][3]<255?1:0),JSON.stringify({options,actual,expected}));}await checkGeometry([[12.75,6.75]]);assert.equal((await state()).images[0].dpi,96);
 }
 const before=JSON.stringify(await state());const invalid=tga({width:1,height:1,type:10});invalid[21]=255;
 for(const bad of [Buffer.alloc(10),invalid,tga().subarray(0,22)]){await p.locator('#toast').evaluate(n=>n.textContent='');await p.locator('#imageFile').setInputFiles({name:'bad.tga',mimeType:'application/octet-stream',buffer:bad});await p.waitForFunction(()=>document.querySelector('#toast').textContent.length>0);assert.equal(JSON.stringify(await state()),before);}
 await fresh();const raw=tga({width:96,height:48,bits:32}),rle=tga({width:96,height:48,type:10,bits:32,origin:48,footer:true});await add(raw);await checkGeometry([[72,36]]);const png=await download('#exportImage');assert.equal(PechaImages.sourceFormat(png),'png');await add(rle,'yigo');await add(raw,'page');assert.equal((await state()).assets.length,1,'raw/RLE and different origins deduplicate');await checkGeometry([[72,36],[72,36],[72,36]]);assert.deepEqual(await corners(),alpha);
 const saved=await download('#saveDoc');await upload('saved.pecha',saved);await checkGeometry([[72,36],[72,36],[72,36]]);assert.deepEqual(await corners(),alpha);
 await p.getByText('Reuse text, layouts and annotations',{exact:true}).click();await upload('roundtrip.rtf',await download('#exportRtf'));await checkGeometry([[72,36],[72,36]]);assert.deepEqual(await corners(),alpha);
 await upload('saved.pecha',saved);await upload('roundtrip.pxc',await download('#exportPxc'));await checkGeometry([[72,36],[72,36],[72,36]]);assert.deepEqual(await corners(),alpha);
 await upload('saved.pecha',saved);await upload('roundtrip.pxp',await download('#exportPxp'));await checkGeometry([[72,36],[72,36],[72,36]]);assert.deepEqual(await corners(),alpha);
 await p.evaluate(()=>window.dispatchEvent(new Event('beforeprint')));const geometry=selector=>p.locator(selector+' image').evaluateAll(ns=>ns.map(n=>[n.getAttribute('width'),n.getAttribute('height')]));assert.deepEqual(await geometry('#printRoot'),await geometry('#table'));assert((await p.locator('#printRoot').textContent()).includes('ཉི་ཤུ་རྩ་གསུམ་'));assert((await p.locator('#printRoot').textContent()).includes('401'));
 const pdf=await p.pdf({preferCSSPageSize:true,printBackground:true});assert.equal(pdf.subarray(0,5).toString(),'%PDF-');if(process.env.QA_PDF)fs.writeFileSync(process.env.QA_PDF,pdf);if(process.env.QA_SCREENSHOT)await p.screenshot({path:process.env.QA_SCREENSHOT,fullPage:true});assert.deepEqual(errors,[]);
 console.log('PASS: all six Targa types, palettes/orientation/alpha pixels, filename/footer detection, invalid nonmutation, raw/RLE dedup, PNG/Save/RTF/PXC/PXP and numberedpreview/print/PDF');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
