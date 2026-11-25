const assert=require('node:assert/strict');
global.PechaImages=require('../src/images');global.Folio=require('../src/folio');
const E=require('../src/engine'),P=require('../src/pxp'),T=require('../src/legacy-table'),D=require('../src/documents'),{sample}=require('./native-page-image-export-fixture');
const measure=(s,f)=>s.length*f.size*.4;measure.head=(_,size)=>({ascent:size*.7,descent:size*.3,height:size});
const d=sample(E);assert.equal(E.run(d,measure).pages.length,3);
d.images.push(PechaImages.placement({id:'future',asset:'pixels',kind:'page',page:4,anchor:'text-left',dpi:111,scale:50}));
const before=JSON.stringify(d),out=P.writeContent(d,E,T,measure),parsed=P.parse(out.bytes),text=Buffer.from(parsed.imageBlock).toString('latin1');
assert.equal(JSON.stringify(d),before);assert(text.includes('PageImageInfoCount=6'));assert(!text.includes('pageNbr=4'));assert(text.includes('usageCount=8\n'));
assert(out.warnings.some(w=>w.includes('1 page-image placement(s) beyond the current 3 web page(s)')));assert(out.warnings.some(w=>w.includes('receiving layout')));
assert(!out.warnings.some(w=>w.includes('Unused inline')));assert(!parsed.template.PageSetup);
const base=E.defaultDoc();base.paper.w=12;base.types.body.side=.2;base.text='Replace';base.textSize=40;const prior=JSON.stringify(base),got=P.load(out.bytes,'pxc',T,base,E).doc;
assert.equal(JSON.stringify(base),prior);assert.equal(got.paper.w,12);assert.deepEqual(got.types,base.types);assert.equal(got.textSize,null);assert(got.text.includes('Third'));
assert.equal(got.images.filter(p=>p.kind==='page').length,6);assert.equal(got.assets.length,3);assert.equal(got.yigo.image,'native-yigo');
assert.deepEqual(got.images.filter(p=>p.kind==='page').map(p=>p.anchor),PechaImages.anchors);assert.deepEqual(got.images.filter(p=>p.kind==='page').map(p=>p.page),[1,2,3,3,2,1]);
assert.deepEqual(D.normalize(D.artifact(got,'document'),E).images,got.images);
assert.equal(P.load(P.writeDocument(d,E,T,measure).bytes,'pxp',T,E.defaultDoc(),E).doc.images.filter(p=>p.kind==='page').length,7);
assert(!P.parse(P.writeAnnotations(d,E,T).bytes).imageBlock);
assert.throws(()=>P.writeContent(d,E,T),/Font measurements/);
// Prune all page-only placements without serializing their PNGs or mutating the document.
const only=sample(E);only.text='One';only.yigo.image='';only.images=only.images.filter(p=>p.kind==='page').map(p=>({...p,page:2}));
const original=JSON.stringify(only),empty=P.writeContent(only,E,T,measure);assert.equal(P.parse(empty.bytes).imageBlock,null);assert.equal(JSON.stringify(only),original);assert(empty.warnings.some(w=>w.includes('6 page-image placement(s) beyond the current 1 web page(s)')));
// Recompute after edits: explicit page/section counts must not use a stale preview.
only.text='One{page}Two';assert.equal(P.readImages(P.parse(P.writeContent(only,E,T,measure).bytes).imageBlock).images.length,6);
only.text='One';only.sections=[{name:'A',text:'A',folioStart:1,restartLayout:false},{name:'B',text:'B',folioStart:1,restartLayout:false}];only.images.forEach(p=>p.page=3);
assert.equal(E.run(only,measure).pages.length,3);assert.equal(P.readImages(P.parse(P.writeContent(only,E,T,measure).bytes).imageBlock).images.length,6);
only.pecha.mode=false;assert.equal(E.run(only,measure).pages.length,2);assert.equal(P.parse(P.writeContent(only,E,T,measure).bytes).imageBlock,null);
for(const page of [0,-1,1.5,3001,Infinity]){const bad=sample(E);bad.images.find(p=>p.kind==='page').page=page;assert.throws(()=>P.writeContent(bad,E,T,measure),/page number/);}
console.log('PASS: PXC current-page image pruning, boundary retention, six anchors, shared asset/usage counts, all-pruned blocks, fresh pagination, receiving-layout scope, Save, source isolation and PXP/PXA distinction');
