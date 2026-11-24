const assert=require('node:assert/strict');
global.PechaImages=require('../src/images');global.Folio=require('../src/folio');
const Engine=require('../src/engine'),Pxp=require('../src/pxp'),Rtf=require('../src/rtf'),TABLE=require('../src/legacy-table'),Documents=require('../src/documents'),{code,sample}=require('./native-style-fixture');
const styles=text=>Engine.parseStream(text,false).filter(r=>r.k==='text'&&/Marked|Black|Plain/.test(r.s)).map(r=>[r.s.trim(),r.style.color,r.style.bold,r.style.italic,r.style.underline,r.style.strike]);
const expected=[['Marked','#b03020',true,true,true,true],['Black','#000000',true,true,true,false],['Plain','#000000',false,false,false,false]];
for(const extension of ['pxp','pxc','pxa']) {
 const base=Engine.defaultDoc();base.text='Keep';base.counts={title:0,fancy:0};base.types.body.color='#3456ab';
 const result=Pxp.load(sample(extension),extension,TABLE,base,Engine);
 assert.equal(result.unknown,0);
 if(extension==='pxa')assert.equal(result.doc.text,'Keep');else assert.deepEqual(styles(result.doc.text),expected);
 // Rich annotations flatten line returns to spaces, but keep every text attribute.
 assert.deepEqual(styles(result.doc.notes.sets['body.front'].inL.text),expected);
 const saved=Documents.normalize(Documents.artifact(result.doc,'document'),Engine);assert.equal(saved.text,result.doc.text);
 if(extension!=='pxa') {
  assert.deepEqual(styles(Rtf.read(Rtf.write(result.doc,Engine),Engine).doc.text),expected);
  const m=(s,f)=>s.length*f.size*.4;m.head=()=>({ascent:12,descent:4,height:16});
  const layout=Engine.run(result.doc,m),svg=Engine.pageSvg(layout.pages[0],result.doc,m,layout.folioCount);
  assert(svg.includes('line-through'));assert(svg.includes('fill="#000000"'));
 }
}
const direct=Pxp.decodeStream(Uint8Array.from([...code(0x26,2),65,...code(0x26,0),66]),{0:'Georgia'},TABLE);
assert.equal(Pxp.eventsToText(direct.ev,()=>false),'{s}A{/s}B','nonzero native strike enables; zero disables');
console.log('PASS: native strike enable/disable and explicit black in PXP/PXC/PXA, independent bold/italic/underline, custom base color, rich notes, SVG, web Save and RTF roundtrip');
