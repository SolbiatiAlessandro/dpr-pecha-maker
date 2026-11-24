const assert=require('node:assert/strict');
global.PechaImages=require('../src/images');global.Folio=require('../src/folio');
const E=require('../src/engine'),Pxp=require('../src/pxp'),TABLE=require('../src/legacy-table'),D=require('../src/documents'),Rtf=require('../src/rtf'),{sample}=require('./native-yigo-fixture');
const measure=(s,f)=>s.length*f.size*.4;measure.head=(doc,size)=>({ascent:size*.5,descent:size*.25,height:size*.75});
const base=()=>{const d=E.defaultDoc();d.counts={title:0,fancy:0};d.yigo.text='Keep';d.dzog.enabled=false;return d;};
const yi=doc=>{const line=E.run(doc,measure).pages[0].lines[0];return line.items.slice(0,line.yigoCount);};
for(const ext of ['pxp','pxc']) {
 const d=Pxp.load(sample(ext),ext,TABLE,base(),E).doc;
 assert(d.yigo.rich);assert(d.yigo.text.includes('font:family:Arial'));assert(d.yigo.text.endsWith('Black '));
 assert(!d.yigo.text.includes('{b}'));assert(!d.yigo.text.includes('{5}'));
 assert.deepEqual(yi(d).map(a=>[a.s,a.f.size,a.f.weight,E.primaryFont(a.f.family),a.style.color]),
  [['Dflt',30,400,'Arial','#123456'],['Red',30,400,'Arial','#123456'],['Black',30,400,'Courier New','#123456']]);
 d.yigo.ignoreColor=false;
 assert.deepEqual(yi(d).map(a=>a.style.color),['#123456','#b03020','#000000']);
 const pages=E.run(d,measure).pages;assert.equal(pages.length,3);assert.deepEqual(pages.map(p=>p.lines[0].yigoCount),[3,0,3]);
 d.textSize=36;assert(yi(d).every(a=>a.f.size===36));
 const copy=D.normalize(D.artifact(d,'document'),E);assert.deepEqual(copy.yigo,d.yigo);assert.deepEqual(yi(copy),yi(d));
 const template=D.apply(base(),D.artifact(d,'template'),E);assert.deepEqual(template.yigo,d.yigo);
 assert(!Rtf.write(d,E).includes('Dflt'),'automatic yi-go remains excluded from body export');
 const current=base();current.yigo.ignoreColor=false;assert.equal(Pxp.load(sample(ext),ext,TABLE,current,E).doc.yigo.ignoreColor,false);
 const empty=Pxp.load(sample(ext,[]),ext,TABLE,base(),E).doc;assert.equal(empty.yigo.text,'');assert.equal(yi(empty).length,0);
 const absent=Pxp.load(sample(ext,null),ext,TABLE,base(),E).doc;assert.equal(absent.yigo.text,'Keep');assert.equal(absent.yigo.rich,false);
}
for(const ext of ['pxa','pxt']) {
 const current=base();current.yigo.ignoreColor=false;
 assert.deepEqual(Pxp.load(sample(ext),ext,TABLE,current,E).doc.yigo,current.yigo);
}
// Explicit reset in custom rich text resumes the first character's colour.
const d=base();d.text='{#123456 30}ཀ་';d.yigo.rich=true;d.yigo.ignoreColor=false;d.yigo.text='{#b03020}Red {color}Default';
assert.deepEqual(yi(d).map(a=>a.style.color),['#b03020','#123456']);
// Shad exclusion follows rendered yi-go characters, including a fixed shad mark.
for(const ornament of ['{font:jomolhari}།','{font:jomolhari}{hs}']) {
 const d=base();d.text='ཀ། །';d.yigo.rich=true;d.yigo.text=ornament;
 let line=E.run(d,measure).pages[0].lines[0];assert.equal(line.items[line.yigoCount].s,'ཀ།');
 d.shad.ignoreYigo=true;line=E.run(d,measure).pages[0].lines[0];assert.equal(line.items[line.yigoCount].s,'ཀ༑');
}
console.log('PASS: native yi-go fonts/colours, first-character size/colour, ignored native style codes, page eligibility, scope, empty/missing streams, full Save/layout and body-only RTF export');
