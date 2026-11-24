const assert=require('node:assert/strict');
global.PechaImages=require('../src/images');global.Folio=require('../src/folio');
const Engine=require('../src/engine'),Rtf=require('../src/rtf');
const {picture,sample}=require('./rtf-picture-fixture');
const images=doc=>Engine.parseStream(doc.text,false).filter(run=>run.k==='image');
for(const [word,align] of [['ql','l'],['qc','c'],['qr','r'],['qj','j']]) {
 const source=`{\\rtf1\\ansi{\\fonttbl{\\f0 Georgia;}}\\${word}\\fs36\\b ${picture()}}`;
 const {doc,warnings}=Rtf.read(source,Engine);
 assert.deepEqual(warnings,[]);assert.equal(images(doc)[0].style.align,align);
 assert.equal(images(doc)[0].style.size,18);assert.equal(images(doc)[0].style.bold,true);
 const again=Rtf.read(Rtf.write(doc,Engine),Engine).doc;
 assert.equal(images(again)[0].style.align,align);
 const size=PechaImages.dimensions(again,again.images[0]);assert.equal(size.w,72);assert.equal(size.h,36);
}
const grouped=Rtf.read(`{\\rtf1\\ansi\\ql before{\\qc\\b ${picture()}}${picture()}after}`,Engine).doc;
assert.deepEqual(images(grouped).map(r=>r.style.align),['c','l']);assert.deepEqual(images(grouped).map(r=>r.style.bold),[true,false]);
const doc=Rtf.read(sample(),Engine).doc;
assert.deepEqual(images(doc).map(r=>r.style.align),['c','r','l','j']);
doc.counts={title:0,fancy:0};doc.yigo.enabled=false;doc.types.body.lines=6;
const measure=(s,f)=>s.length*f.size*.4;measure.head=()=>({ascent:12,descent:4,height:16});
const page=Engine.run(doc,measure).pages[0], width=page.boxes.T.x1-page.boxes.T.x0;
const pictureLines=page.lines.filter(l=>l.items.some(a=>a.image));
assert.equal(pictureLines.length,4);assert(Math.abs(pictureLines[0].items[0].x-(width-pictureLines[0].width)/2)<.001);
assert(Math.abs(pictureLines[1].items[0].x-(width-pictureLines[1].width))<.001);assert.equal(pictureLines[2].items[0].x,0);
// Formatting applied to an image must not escape a group into following text.
const text=Engine.parseStream(grouped.text,false).filter(r=>r.k==='text');assert.equal(text.at(-1).style.bold,false);
console.log('PASS: image-first paragraph alignment, inherited character style, group restoration, RTF roundtrip and rendered offsets');
