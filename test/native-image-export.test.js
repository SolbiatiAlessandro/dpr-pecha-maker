const assert=require('node:assert/strict'),{crc32,inflateSync}=require('node:zlib');
global.PechaImages=require('../src/images');global.Folio=require('../src/folio');
const E=require('../src/engine'),P=require('../src/pxp'),T=require('../src/legacy-table'),D=require('../src/documents'),{sample}=require('./native-image-export-fixture'),{png}=require('./image-dpi-fixture');
const measure=()=>0;measure.head=()=>({ascent:15,descent:5,height:20});
function pngChunks(bytes){
 const chunks=[];for(let at=8;at<bytes.length;){const n=bytes.readUInt32BE(at),name=bytes.toString('ascii',at+4,at+8);assert.equal(bytes.readUInt32BE(at+8+n),crc32(bytes.subarray(at+4,at+8+n)));chunks.push({name,data:bytes.subarray(at+8,at+8+n)});at+=12+n;}
 return chunks;
}
for(const extension of ['pxp','pxc']){
 const d=sample(E),before=JSON.stringify(d),out=extension==='pxp'?P.writeDocument(d,E,T,measure):P.writeContent(d,E,T),parsed=P.parse(out.bytes,T),block=Buffer.from(parsed.imageBlock);
 assert.equal(JSON.stringify(d),before);assert(block.subarray(0,20).toString().startsWith('\n[START IMAGES] 1.1\n'));
 const marker=/Images_totalBytes=(\d+)\n/.exec(block.toString('latin1')),payload=block.subarray(marker.index+marker[0].length),meta=block.subarray(0,marker.index).toString();assert.equal(payload.length,+marker[1]);
 const records=kind=>[...meta.matchAll(new RegExp('([^\\[\\]]*)\\[END '+kind+' (\\d+)\\]','g'))].map(m=>Object.fromEntries([...m[1].matchAll(/^(\w+)=(-?[\d.]+)$/gm)].map(x=>[x[1],+x[2]])));
 const assets=records('IINFO'),lines=records('LIINFO');assert.equal(assets.length,3);assert.equal(lines.length,4);assert(meta.includes('PageImageInfoCount=0'));
 assert.deepEqual(assets.map(a=>a.usageCount),[1,2,1]);assert.deepEqual(lines.map(p=>p.iInfoIndex),[0,1,1,2]);
 assert.equal(parsed.nonBody.values.YigoImageEn,'1');assert.equal(parsed.nonBody.values.YigoLineImageIndex,'0');
 assert.deepEqual(lines[1],{iInfoIndex:1,ignoreImgDPI:0,scale:50,drawWidth:48,drawHeight:48,sideSp_float:.04,yAdj_float:.2,addTFA:1});
 assert.equal(lines[3].ignoreImgDPI,1);assert.equal(lines[3].drawWidth,24);assert.equal(lines[3].drawHeight,12);
 const pixels=inflateSync(Buffer.concat(pngChunks(png()).filter(c=>c.name==='IDAT').map(c=>c.data)));let offset=0;
 for(const a of assets){assert.equal(a.imageOffset,offset);const bytes=payload.subarray(offset,offset+a.compSize);offset+=a.compSize;assert.equal(a.crc,crc32(bytes)|0);assert.equal(a.dibWidth,96);assert.equal(a.dibHeight,48);
  const chunks=pngChunks(bytes),phys=chunks.filter(c=>c.name==='pHYs');assert.equal(phys.length,1);assert.equal(phys[0].data[8],1);assert.equal(Math.trunc(phys[0].data.readUInt32BE(0)*.0254),a.dibXDPI);assert.equal(Math.trunc(phys[0].data.readUInt32BE(4)*.0254),a.dibYDPI);
  assert.deepEqual(inflateSync(Buffer.concat(chunks.filter(c=>c.name==='IDAT').map(c=>c.data))),pixels);
  if(a.dibXDPI===96&&a.dibYDPI===48)assert.deepEqual(bytes,png(),'matching density retains exact PNG bytes');
 }
 assert.equal(offset,payload.length);
 const markers=[];for(let at=0;at<parsed.body.length;){const b=parsed.body[at];if(b>=17&&b<=22){if(b===19)markers.push([...parsed.body.subarray(at,at+6)]);at+=6;}else at++;}
 assert.deepEqual(markers,[[19,127,127,1,0,19],[19,127,127,2,0,19],[19,127,127,3,0,19]]);
 const header=/u1 u2 u3 u4 (\d+) (\d+)/.exec(Buffer.from(out.bytes).toString('latin1')),cell=new Float32Array(1);parsed.body.forEach((b,i)=>{cell[0]+=100+2*i;cell[0]+=b;cell[0]+=(b*(101+2*i))|0;});assert.equal(+header[1],parsed.body.length);assert.equal(+header[2],cell[0]);
 const target=E.defaultDoc();target.paper.w=17;const got=P.load(out.bytes,extension,T,target,E).doc;
 assert.equal(got.assets.length,3);assert.equal(got.images.length,5);assert.equal(got.yigo.image,'native-yigo');assert(got.text.includes('{image:native-inline-1}')&&got.text.includes('{image:native-inline-2}'));
 for(const [id,w,h] of [['native-inline-1',36,36],['native-inline-2',36,36],['native-inline-3',18,9],['native-yigo',27,27]]){const size=PechaImages.dimensions(got,got.images.find(p=>p.id===id));assert.deepEqual([size.w,size.h],[w,h]);}
 assert.deepEqual(D.normalize(D.artifact(got,'document'),E).images,got.images);if(extension==='pxc')assert.equal(got.paper.w,17);
 assert(out.warnings.some(w=>w.includes('resolution metadata')));assert(out.warnings.some(w=>w.includes('96-DPI reference')));
}
const simple=sample(E);simple.yigo.image='';simple.images=simple.images.slice(0,1);simple.text='{image:line}';
assert(P.writeContent(simple,E,T).bytes.length>0,'an image-only body is supported');
const repeat=structuredClone(simple);repeat.text='{image:line}'.repeat(257);const rp=P.parse(P.writeContent(repeat,E,T).bytes);assert.deepEqual([...rp.body.slice(-6)],[19,127,127,0,1,19],'indices use both little-endian bytes');
repeat.text='{image:line}'.repeat(1001);assert.throws(()=>P.writeContent(repeat,E,T),/1000/);
const unused=sample(E);unused.images.push(PechaImages.placement({id:'unused',asset:'pixels'}));assert(P.writeContent(unused,E,T).warnings.some(w=>w.includes('Unused')));
const fractional=sample(E);fractional.images[0].dpi=96.2;fractional.images[0].scale=50.4;assert(P.writeContent(fractional,E,T).warnings.some(w=>w.includes('rounded')));
for(const options of [{omitDensity:true},{unit:0}]){
 const d=structuredClone(simple);d.assets[0].data='data:image/png;base64,'+png(96,48,options).toString('base64');
 const got=P.load(P.writeContent(d,E,T).bytes,'pxc',T,E.defaultDoc(),E).doc;
 assert.equal(got.images[0].dpi,96);assert.equal(got.images[0].dpiY,48);
 assert.equal(pngChunks(Buffer.from(got.assets[0].data.slice(22),'base64')).filter(c=>c.name==='pHYs').length,1);
}
for(const change of [d=>d.images[0].kind='page',d=>d.images[0].dpi=NaN,d=>d.images[0].above=Infinity,d=>d.yigo.image='missing',d=>d.text='{image:missing}',d=>d.assets[0].width=1,d=>d.assets[0].data='data:image/png;base64,AAAA']){
 const d=sample(E);change(d);assert.throws(()=>P.writeContent(d,E,T));assert.throws(()=>P.writeDocument(d,E,T,measure));
}
const corrupt=sample(E),bad=png();bad[50]^=1;corrupt.assets[0].data='data:image/png;base64,'+bad.toString('base64');assert.throws(()=>P.writeContent(corrupt,E,T),/checksum/);
// PXA continues to omit image content, even page placements.
const annotation=sample(E);annotation.images[0].kind='page';assert(!P.parse(P.writeAnnotations(annotation,E,T).bytes).imageBlock);
console.log('PASS: native image records, signed CRC32 and PNG chunk CRCs, pixel-preserving density variants, marker indices/checksum, source isolation, placement geometry, partial scope, limits and rejection');
