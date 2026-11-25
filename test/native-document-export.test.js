const assert=require('node:assert/strict'),fs=require('node:fs');
global.PechaImages=require('../src/images');global.Folio=require('../src/folio');
const E=require('../src/engine'),P=require('../src/pxp'),T=require('../src/legacy-table'),D=require('../src/documents'),{sample}=require('./native-document-export-fixture');
const measure=()=>0;measure.head=()=>({ascent:15,descent:5,height:20});
const visible=text=>E.parseStream(text,false).map(r=>r.k==='text'?r.s:r.k==='page'?'\f':'').join('').replace(/\u2028/g,'\n');
const d=sample(E),before=JSON.stringify(d),out=P.writeDocument(d,E,T,measure),p=P.parse(out.bytes,T),s=Buffer.from(out.bytes).toString('latin1');
assert(s.startsWith('.pxp 0.6 0 u1 u2 u3 u4 '));assert(s.includes('[END NON-BODY]\n[START TEMPLATE]\n\n[PageSetup]\n'));assert(!s.includes('[File Version'));assert(!s.includes('\r\n'));
assert.equal(JSON.stringify(d),before);assert.deepEqual(p.body,P.parse(P.writeContent(d,E,T).bytes,T).body);
const header=/u1 u2 u3 u4 (\d+) (\d+) (\d+)/.exec(s),cell=new Float32Array(1);p.body.forEach((b,i)=>{cell[0]+=100+2*i;cell[0]+=b;cell[0]+=(b*(101+2*i))|0;});assert.equal(+header[1],p.body.length);assert.equal(+header[2],cell[0]);assert.equal(+header[3],Object.keys(p.fonts).length);
assert.equal(p.fonts[p.template.PechaAnnotation.PageNumFIndex],'Verdana');assert(!Object.values(P.parse(P.writeContent(d,E,T).bytes).fonts).includes('Verdana'),'page-only font added to full header');
const base=E.defaultDoc();base.textSize=50;base.paper.w=10;base.pageNum.font='Georgia';base.sections=[{text:'Old'}];const baseBefore=JSON.stringify(base),got=P.load(out.bytes,'pxp',T,base,E).doc;
assert.equal(JSON.stringify(base),baseBefore);assert.equal(got.textSize,null);assert.deepEqual(got.sections,[]);assert.equal(visible(got.text),visible(d.text));
for(const key of ['paper','margins','pecha','normal','counts','tabWidth','tibetanRaise','shad','dzog'])assert.deepEqual(got[key],d[key],key);
for(const kind of ['title','fancy','body'])for(const key of ['lines','lineHeight','baseline','side','style','color','sideIn','sideOut','insideOn','inside','squeezeOn','squeeze'])assert.equal(key==='color'?got.types[kind][key].toLowerCase():got.types[kind][key],d.types[kind][key],kind+'.'+key);
for(const key of ['font','size','inset','position','angle','start','on','onTitle','firstTitle'])assert.equal(got.pageNum[key],d.pageNum[key],key);
for(const key of ['size','inset','start','onTitle','jyon','rhinoEnabled'])assert.equal(got.folio[key],d.folio[key]);assert.equal(visible(got.folio.rhino),visible(d.folio.rhino));
assert.equal(got.notes.outLeft,d.notes.outLeft);assert.equal(got.notes.outRight,d.notes.outRight);assert.deepEqual(E.boxes(got,got.types.body),E.boxes(d,d.types.body));
for(const [side,set] of Object.entries(d.notes.sets))for(const pos of ['inL','inR','outL','outR',...(side.endsWith('.front')?['inB']:[])])assert.equal(visible(got.notes.sets[side][pos].text),visible(set[pos].text));
assert.equal(visible(D.normalize(D.artifact(got,'document'),E).text),visible(d.text));
assert(out.warnings.some(w=>w.includes('Experimental Windows document')));assert(!out.warnings.some(w=>w.includes('Only layout')||w.includes('receiving document')));
assert(out.warnings.some(w=>w.includes('Tibetan folio-number font')));
const auto=E.defaultDoc();auto.text='Text';const automatic=P.writeDocument(auto,E,T,measure);assert(automatic.warnings.some(w=>w.includes('fixed baseline')));assert.throws(()=>P.writeDocument(auto,E,T),/measurements/);
auto.pageNum.font='Jomolhari';const substituted=P.writeDocument(auto,E,T,measure),tp=P.parse(substituted.bytes);assert.equal(tp.fonts[tp.template.PechaAnnotation.PageNumFIndex],'Times New Roman');assert(substituted.warnings.some(w=>w.includes('Times New Roman')));
const portrait=sample(E);portrait.paper={name:'Custom',w:8.5,h:11};portrait.pecha.mode=false;const normal=P.load(P.writeDocument(portrait,E,T,measure).bytes,'pxp',T,base,E).doc;assert.deepEqual(normal.paper,portrait.paper);assert.equal(normal.pecha.mode,false);
for(const change of [x=>x.paper.w=NaN,x=>x.pageNum.font='X'.repeat(32),x=>x.images=[{id:'picture'}],x=>x.text='😀']){const bad=sample(E);change(bad);assert.throws(()=>P.writeDocument(bad,E,T,measure));}
// Standalone PXT retains its text-mode wrapper and has no file-local font reference.
const template=P.writeTemplate(d,E,measure).text;assert(template.startsWith('; PechaMaker Template file.'));assert(!template.includes('PageNumFIndex'));assert(template.includes('\r\n'));
// Optional original public fixtures: web roundtrip evidence, not native opening.
if(process.argv[2])for(const file of fs.readdirSync(process.argv[2]).filter(n=>n.endsWith('.pxp'))){
 const original=P.load(fs.readFileSync(process.argv[2]+'/'+file),'pxp',T,E.defaultDoc(),E).doc;
 const roundtrip=P.load(P.writeDocument(original,E,T,measure).bytes,'pxp',T,E.defaultDoc(),E).doc;
 assert.equal(visible(roundtrip.text),visible(original.text));assert.deepEqual(roundtrip.paper,original.paper);assert.deepEqual(roundtrip.counts,original.counts);
}
console.log('PASS: PXP envelope/checksum/full layout, page-only font registration, numeric geometry/marks, source isolation, full-file override reset, Save, automatic baselines, substitutions, portrait mode and rejection');
