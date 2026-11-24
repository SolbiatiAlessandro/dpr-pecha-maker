const assert=require('node:assert/strict');
global.PechaImages=require('../src/images');global.Folio=require('../src/folio');
const E=require('../src/engine'),Pxp=require('../src/pxp'),TABLE=require('../src/legacy-table'),D=require('../src/documents'),Rtf=require('../src/rtf'),{sample}=require('./native-rhino-fixture');
const measure=(s,f)=>s.length*f.size*.4;measure.head=(d,size)=>({ascent:size*.5,descent:size*.25,height:size*.75});
const base=()=>{const d=E.defaultDoc();d.text='First{page}Second{page}Third';d.counts={title:1,fancy:0};d.yigo.enabled=false;d.dzog.enabled=false;d.folio.size=18;return d;};
const svg=(doc,index=0)=>{const r=E.run(doc,measure);return E.pageSvg(r.pages[index],doc,measure,r.folioCount);};
for(const ext of ['pxp','pxc','pxa']) {
 const d=Pxp.load(sample(ext),ext,TABLE,base(),E).doc;
 assert(d.folio.rhinoEnabled);assert(d.folio.rhinoRich);assert.equal(d.folio.start,0);assert.equal(d.folio.onTitle,false);
 for(const i of [0,2]) {const s=svg(d,i);assert(s.includes('Fixed '));assert(s.includes('Phrase'));assert(s.includes('Arial'));assert(s.includes('Courier New'));assert(s.includes('fill="#b03020"'));assert(s.includes('underline line-through'));assert(!s.includes('font-size="50"'));assert(!s.includes('བྱོན།'));}
 assert(!svg(d,1).includes('Fixed '));
 for(const angle of [-90,0,90]){d.folio.angle=angle;assert(svg(d).includes(`rotate(${angle})`));}
 const save=D.normalize(D.artifact(d,'document'),E);assert.deepEqual(save.folio,d.folio);assert.equal(svg(save),svg(d));
 assert.deepEqual(D.apply(base(),D.artifact(d,'annotations'),E).folio,d.folio);
 const fresh=D.newContent(d,E);assert.equal(fresh.folio.rhino,d.folio.rhino);assert(fresh.folio.rhinoEnabled);assert(fresh.folio.rhinoRich);
 assert(!Rtf.write(d,E).includes('Fixed'),'automatic phrase is not body text');
 const off=Pxp.load(sample(ext,false),ext,TABLE,base(),E).doc;
 assert(!off.folio.rhinoEnabled);assert.equal(off.folio.rhino,d.folio.rhino);assert(!svg(off).includes('Fixed '));
 off.folio.start=1;off.folio.onTitle=true;assert(svg(off).includes('གཅིག་'));assert(svg(off,2).includes('བྱོན།'));
 const empty=Pxp.load(sample(ext,true,true),ext,TABLE,base(),E).doc;empty.folio.start=1;empty.folio.onTitle=true;
 assert(empty.folio.rhinoEnabled);assert.equal(empty.folio.rhino,'');assert(!svg(empty).includes('གཅིག་'),'empty fixed phrase does not fall back to numbers');
}
// Backward-compatible plain web phrases stay literal, with no formatting interpretation.
const old=base();old.folio.rhino='{b}Literal';delete old.folio.rhinoEnabled;delete old.folio.rhinoRich;
const migrated=D.normalize(old,E);assert(migrated.folio.rhinoEnabled);assert(!migrated.folio.rhinoRich);assert(svg(migrated).includes('{b}Literal'));
const oldAnnotations={format:'web-pecha-part',version:1,kind:'annotations',settings:{folio:old.folio}};
assert(D.apply(base(),oldAnnotations,E).folio.rhinoEnabled);
const disabled=D.normalize({...old,folio:{...old.folio,rhinoEnabled:false}},E);assert(!disabled.folio.rhinoEnabled);
const tpl=Pxp.load(sample('pxp'),'pxt',TABLE,migrated,E).doc;assert.deepEqual(tpl.folio,migrated.folio);
console.log('PASS: native fixed-folio mode, front/title/zero-start rules, stored disabled and empty phrases, fonts/styles/colours, size/rotation, Save/annotations/new content, legacy migration and body-only RTF');
