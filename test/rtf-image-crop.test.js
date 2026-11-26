const assert=require('node:assert/strict');
global.PechaImages=require('../src/images');global.Folio=require('../src/folio');
const I=PechaImages,E=require('../src/engine'),R=require('../src/rtf'),D=require('../src/documents'),P=require('../src/pxp'),T=require('../src/legacy-table'),F=require('../src/text-format'),{expected,sample,picture}=require('./rtf-image-crop-fixture'),{png}=require('./image-dpi-fixture');
const dims=d=>d.images.map(p=>{const s=I.dimensions(d,p);return [s.w,s.h];});
const out=R.read(sample(),E,T),d=out.doc;assert.deepEqual(dims(d),expected);assert.equal(d.assets.length,1);assert(out.warnings.some(w=>w.includes('cropping is experimental')));
assert.deepEqual(Buffer.from(d.assets[0].data.split(',')[1],'base64'),png(96,96));
const first=I.dimensions(d,d.images[0]);assert.equal(first.fullW,36);assert.equal(first.left,18);assert.equal(first.fullH,72);
assert.deepEqual(dims(D.normalize(D.artifact(d,'document'),E)),expected);
const rtf=R.write(d,E),again=R.read(rtf,E,T).doc;assert.deepEqual(dims(again),expected);assert(rtf.includes('\\piccropl-540'));assert.equal(again.assets[0].data,d.assets[0].data);
for(const crop of [{left:.5,right:.5},{top:1},{left:Infinity},{top:NaN},{right:21},{left:'0.5'},[]])assert.equal(I.crop(crop),null);
for(const crop of ['\\piccropl1440','\\piccropt720','\\piccropb999999999999999999']){
 const bad=R.read('{\\rtf1 '+picture('\\picwgoal1440\\pichgoal720'+crop)+'}',E,T);assert(bad.warnings.some(w=>w.includes('cropping was ignored')));assert.deepEqual(dims(bad.doc),[[72,36]]);assert.deepEqual(dims(D.normalize(bad.doc,E)),[[72,36]]);
}
const density=3780*.0254,missing=R.read('{\\rtf1 '+picture('\\piccropl360')+'}',E,T).doc;
assert(Math.abs(dims(missing)[0][0]-(96*72/density-18))<1e-8);
const current=E.defaultDoc();current.text='OLD';const before=JSON.stringify(current),pasted=R.insert(sample(),current,'OLD',0,3,E,T,F);assert.deepEqual(dims({...current,...pasted}),expected);assert.equal(JSON.stringify(current),before);
const measure=(s,f)=>s.length*f.size*.4;measure.head=()=>({ascent:12,descent:4,height:16});
d.counts={title:0,fancy:0};d.yigo.enabled=false;d.dzog.enabled=false;d.types.body.lines=4;d.types.body.lineHeight=1.2;
const result=E.run(d,measure),svg=E.pageSvg(result.pages[0],d,measure,result.folioCount);assert.equal((svg.match(/data-image-crop="true"/g)||[]).length,3);assert(svg.includes('x="-18"'));assert(svg.includes('overflow="hidden"'));
const tiny=JSON.parse(JSON.stringify(d));tiny.images[0].crop.left=.999999;assert.throws(()=>R.write(tiny,E),/too small for RTF twip precision/);
const original=JSON.stringify(d);assert.throws(()=>P.writeContent(d,E,T,measure),/Cropped images cannot yet/);assert.throws(()=>P.writeDocument(d,E,T,measure),/Cropped images cannot yet/);assert.equal(JSON.stringify(d),original);
const copy=I.transferInline(d,d.images[0].id,'copy',0,d.text.length);assert.deepEqual(copy.placement.crop,d.images[0].crop);assert.notEqual(copy.placement.crop,d.images[0].crop);assert.equal(copy.placement.scale,100);
const page={...d.images[0],id:'page',kind:'page',page:1,anchor:'text-left'};d.images.push(page);const updated=E.run(d,measure);assert(E.pageSvg(updated.pages[0],d,measure,updated.folioCount).includes('data-image-id="page" data-image-crop="true"'));assert.equal(I.pageRect(d,page,updated.pages[0].boxes,updated.pages[0].type).w,18);
console.log('PASS: positive/negative/four-edge crops, independent scaling and density defaults, source PNG/deduplication, Save/RTF/paste, invalid bounds, viewport geometry/page placement/copy and native-export rejection');
