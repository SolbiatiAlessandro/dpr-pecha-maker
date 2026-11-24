const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
global.PechaImages=require('../src/images');global.Folio=require('../src/folio');
const E=require('../src/engine'),P=require('../src/pxp'),D=require('../src/documents'),T=require('../src/legacy-table'),{sample}=require('./native-number-font-fixture');
const measure=(s,f)=>s.length*f.size*.4;measure.head=(d,size)=>({ascent:size*.5,descent:size*.25,height:size*.75});
const base=()=>{const d=E.defaultDoc();d.counts={title:0,fancy:0};d.text='Retained';d.pageNum.font='Arial';d.yigo.enabled=false;return d;};
const svg=d=>{const r=E.run(d,measure);return E.pageSvg(r.pages[0],d,measure,r.folioCount);};
for(const extension of ['pxp','pxc']) {
 const d=P.load(sample({extension}),extension,T,base(),E).doc;
 assert.equal(d.pageNum.font,'Courier New');assert.equal(d.pageNum.size,16);assert(svg(d).includes('&quot;Courier New&quot;'));
 const saved=D.normalize(D.artifact(d,'document'),E);assert.deepEqual(saved.pageNum,d.pageNum);assert.equal(svg(saved),svg(d));
 assert.deepEqual(D.apply(base(),D.artifact(d,'annotations'),E).pageNum,d.pageNum);
}
for(const name of ['Times New Roman','O\'Brien "Display", Serif','missing local font','Jomolhari','Noto Serif Tibetan']) {
 const d=P.load(sample({name}),'pxp',T,base(),E).doc;assert.equal(d.pageNum.font,name);
 assert.equal(D.normalize(d,E).pageNum.font,name);assert(svg(d).includes('>1</text>'));
}
// An absent field or invalid/unresolvable reference never silently selects an unrelated face.
assert.equal(P.load(sample({withTemplate:false}),'pxc',T,base(),E).doc.pageNum.font,'Arial');
for(const index of [-1,999,1.5,'bogus','']) {const r=P.load(sample({index}),'pxp',T,base(),E);assert.equal(r.doc.pageNum.font,'Arial');assert(r.warnings.some(s=>s.includes('page-number font')));}
const invalid=P.load(sample({name:'bad;font'}),'pxp',T,base(),E);assert.equal(invalid.doc.pageNum.font,'Arial');assert(invalid.warnings.some(s=>s.includes('page-number font')));
const tcc=P.load(sample({name:'TibetanMachine'}),'pxp',T,base(),E);assert.equal(tcc.doc.pageNum.font,'Jomolhari');assert(tcc.warnings.some(s=>s.includes('page-number font')));
// PXA stores the unremapped source-document ID, not a portable compact-font reference.
const pxa=P.load(sample({extension:'pxa',index:6}),'pxa',T,base(),E);assert.equal(pxa.doc.pageNum.font,'Arial');assert.equal(pxa.doc.text,'Retained');assert(pxa.warnings.some(s=>s.includes('page-number font')));
const pxt=Buffer.from('[PageSetup]\nPechaMode=1\n[PechaControl]\nPechaHeight=2.5\n[PechaAnnotation]\nPageNumFIndex=5\n');
const template=P.load(pxt,'pxt',T,base(),E);assert.equal(template.doc.pageNum.font,'Arial');assert(template.warnings.some(s=>s.includes('page-number font')));
for(const name of ['bad;font','\u0000bad','x'.repeat(129),'']) {const d=base();d.pageNum.font=name;assert.equal(D.normalize(d,E).pageNum.font,'Georgia');}
if(process.argv[2]) for(const file of fs.readdirSync(process.argv[2]).filter(f=>f.endsWith('.pxp'))) {const d=P.load(fs.readFileSync(path.join(process.argv[2],file)),'pxp',T,null,E).doc;assert.equal(d.pageNum.font,'Times New Roman',file);console.log('PASS public numbering font:',file);}
console.log('PASS: native page-number fonts, quoted names, Save/annotation persistence, invalid references, TCC substitution and nonportable partial-file warnings');
