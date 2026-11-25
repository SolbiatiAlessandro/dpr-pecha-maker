const assert=require('node:assert/strict');
global.PechaImages=require('../src/images');global.Folio=require('../src/folio');
const E=require('../src/engine'),P=require('../src/pxp'),T=require('../src/legacy-table'),D=require('../src/documents'),R=require('../src/rtf'),fixture=require('./image-dpi-fixture');
const dimensions=(doc,p)=>{const {w,h}=PechaImages.dimensions(doc,p);return [w,h];};
for(const old of [false,true])for(const extension of ['pxp','pxc']) {
 const target=E.defaultDoc();target.text='Untouched';target.paper.w=17;const before=JSON.stringify(target);
 const image=fixture.png(96,48),bytes=fixture.native(300,600,old,image),copy=Buffer.from(bytes);
 const result=P.load(bytes,extension,T,target,E),d=result.doc;
 assert.deepEqual(bytes,copy);assert.equal(JSON.stringify(target),before);
 assert.equal(d.assets[0].data,'data:image/png;base64,'+image.toString('base64'));
 assert(d.images.every(p=>p.dpi===96 && p.dpiY===48));assert(d.images.every(p=>dimensions(d,p).every(v=>v===72)));
 assert(result.warnings.some(w=>w.includes('overrides')));assert.equal(result.warnings.filter(w=>w.includes('overrides')).length,1);
 assert.equal(d.yigo.image,'native-yigo');if(extension==='pxc')assert.equal(d.paper.w,17);
 const saved=D.normalize(D.artifact(d,'document'),E);assert.deepEqual(saved.images,d.images);assert.deepEqual(saved.assets,d.assets);
 const rtf=R.read(R.write(d,E),E).doc;assert.deepEqual(dimensions(rtf,rtf.images[0]),[72,72]);
 // Original integer conversion truncates, including the common 300 DPI pHYs value.
 const fractional=P.load(fixture.native(300,150,old,fixture.png(300,150)),extension,T,target,E);
 assert(fractional.doc.images.every(p=>p.dpi===299 && p.dpiY===150));
 assert.equal(PechaImages.pngResolution(fixture.png(300,150)).x,11811*.0254,'direct web PNG insertion retains fractional DPI');
 for(const image of [fixture.png(300,150,{omitDensity:true}),fixture.png(300,150,{unit:0})]) {
  const absent=P.load(fixture.native(600,600,old,image),extension,T,target,E);
  assert(absent.doc.images.every(p=>p.dpi===72&&p.dpiY===null));
  assert(absent.doc.images.every(p=>JSON.stringify(dimensions(absent.doc,p))==='[96,48]'));
  assert(absent.warnings.some(w=>w.includes('72 DPI')));assert(!absent.warnings.some(w=>w.includes('both axes')));
  assert.equal(PechaImages.pngResolution(image),null);
 }
 for(const [x,y] of [[0,48],[96,0],[0,0],[.01,48]]) {
  const zero=P.load(fixture.native(300,600,old,fixture.png(x,y)),extension,T,target,E);
  assert(zero.doc.images.every(p=>p.dpi===96&&p.dpiY===null));assert(zero.warnings.some(w=>w.includes('both axes')));
 }
 // Valid embedded density wins even when cached table values are zero.
 const stale=P.load(fixture.native(0,0,old,image),extension,T,target,E);
 assert(stale.doc.images.every(p=>p.dpi===96&&p.dpiY===48));assert(!stale.warnings.some(w=>w.includes('both axes')));
 // Ignore DPI remains independent of the recovered source resolution.
 const ignored=Buffer.from(bytes);if(!old){const marker=Buffer.from('scale=100');const at=ignored.indexOf(marker);const withFlag=Buffer.concat([ignored.subarray(0,at),Buffer.from('ignoreImgDPI=1\n'),ignored.subarray(at)]);
  const got=P.load(withFlag,extension,T,target,E).doc,inline=got.images.find(p=>p.kind==='inline');assert(inline.ignoreDpi);assert.equal(inline.dpiY,48);assert.deepEqual(dimensions(got,inline),[72,36]);}
}
// Reading density is bounded by chunk sizes and respects a subarray's byte offset.
const png=fixture.png(),wrapped=Buffer.concat([Buffer.alloc(7),png]);
assert.deepEqual(PechaImages.pngDensity(wrapped.subarray(7)),{x:3780,y:1890,unit:1});
assert.equal(PechaImages.pngDensity(png.subarray(0,45)),null);
const oversized=Buffer.from(png);oversized.writeUInt32BE(0xffffffff,33);assert.equal(PechaImages.pngDensity(oversized),null);
console.log('PASS: PNG density overrides native cache for PXP/PXC v1.0/1.1; 72 DPI default, zero-axis fallback, truncation, independent axes, Ignore DPI, source isolation, Save/Open and RTF geometry');
