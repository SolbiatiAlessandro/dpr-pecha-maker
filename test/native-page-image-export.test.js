const assert=require('node:assert/strict');
global.PechaImages=require('../src/images');global.Folio=require('../src/folio');
const E=require('../src/engine'),P=require('../src/pxp'),T=require('../src/legacy-table'),D=require('../src/documents'),{sample}=require('./native-page-image-export-fixture');
const measure=(s,f)=>s.length*f.size*.4;measure.head=(_,size)=>({ascent:size*.7,descent:size*.3,height:size});
const d=sample(E),before=JSON.stringify(d),out=P.writeDocument(d,E,T,measure),parsed=P.parse(out.bytes,T),block=Buffer.from(parsed.imageBlock),text=block.toString('latin1');
const matches=[...text.matchAll(/([^\[\]]*)\[END PIINFO (\d+)\]/g)],records=matches.map(m=>Object.fromEntries([...m[1].matchAll(/^(\w+)=(-?[\d.]+)$/gm)].map(v=>[v[1],+v[2]])));
assert.equal(JSON.stringify(d),before);assert.equal(records.length,6);assert(text.includes('PageImageInfoCount=6'));assert.deepEqual(records.map(r=>r.slot),[0,1,2,4,5,6]);assert.deepEqual(records.map(r=>r.pageNbr),[1,2,3,3,2,1]);
for(const r of records){assert.equal(r.iInfoIndex,1);assert.equal(r.ignoreImgDPI,0);assert.equal(r.scale,25);assert.equal(r.drawWidth,24);assert.equal(r.drawHeight,24);assert.equal(r.yAdj_float,.12);assert.equal(r.xAdj_float,.06);assert.equal(r.xMar_float,.04);assert(!Object.hasOwn(r,'addTFA'));assert(!Object.hasOwn(r,'sideSp_float'));}
assert(text.includes('usageCount=8\n'),'shared PNG usage includes repeated inline and page placements');
const got=P.load(out.bytes,'pxp',T,E.defaultDoc(),E).doc,pages=got.images.filter(p=>p.kind==='page');assert.equal(pages.length,6);assert.equal(got.assets.length,3);assert.equal(got.yigo.image,'native-yigo');assert.equal(got.pageNum.start,401);assert.equal(got.folio.start,23);
for(let i=0;i<6;i++){
 const original=d.images.filter(p=>p.kind==='page')[i],p=pages[i];for(const k of ['kind','page','anchor','scale','dpi','dpiY','ignoreDpi','down','inward','margin'])assert.equal(p[k],original[k]);
 const a=PechaImages.pageRect(d,original,E.boxes(d,d.types.body),d.types.body),b=PechaImages.pageRect(got,p,E.boxes(got,got.types.body),got.types.body);
 for(const key of ['x','y','w','h'])assert.equal(b[key],a[key]);
}
assert.deepEqual(D.normalize(D.artifact(got,'document'),E).images,got.images);assert(out.warnings.some(w=>w.includes('one-based')));assert(out.warnings.some(w=>w.includes('96-DPI reference')));
assert.throws(()=>P.writeContent(d,E,T),/page images/);assert(!P.parse(P.writeAnnotations(d,E,T).bytes).imageBlock);
// Full files retain future page assignments and support a block with no inline records.
const only=sample(E);only.images=only.images.filter(p=>p.kind==='page');only.yigo.image='';only.text='Body';only.images[0].page=3000;only.images[1].ignoreDpi=true;
const alone=P.writeDocument(only,E,T,measure),raw=Buffer.from(P.parse(alone.bytes).imageBlock).toString('latin1');assert(raw.includes('LineImageInfoCount=0'));assert(raw.includes('pageNbr=3000'));
assert.equal(P.load(alone.bytes,'pxp',T,E.defaultDoc(),E).doc.images.length,6);
// Native1.1 clamps both shifts at reload; margin is separate and may be zero.
for(const offset of [-.5,0,.005,.01,.2]){
 const source=sample(E),p=source.images.find(p=>p.kind==='page');p.down=offset;p.inward=offset;p.margin=0;const snapshot=JSON.stringify(source),result=P.writeDocument(source,E,T,measure),loaded=P.load(result.bytes,'pxp',T,E.defaultDoc(),E).doc.images.find(p=>p.kind==='page');
 assert.equal(loaded.down,Math.max(.01,offset));assert.equal(loaded.inward,Math.max(.01,offset));assert.equal(loaded.margin,0);assert.equal(JSON.stringify(source),snapshot);assert.equal(result.warnings.some(w=>w.includes('below 0.01')),offset<.01);
}
// Mutate only metadata, leaving binary body and PNG bytes intact, to test external native input.
const encoded=Buffer.from(out.bytes),from=Buffer.from('yAdj_float=0.120000\nxAdj_float=0.060000'),at=encoded.indexOf(from);assert(at>0);
const fixture=Buffer.concat([encoded.subarray(0,at),Buffer.from('yAdj_float=-0.500000\nxAdj_float=0.000000'),encoded.subarray(at+from.length)]),clamped=P.load(fixture,'pxp',T,E.defaultDoc(),E);
assert.equal(clamped.doc.images.find(p=>p.kind==='page').down,.01);assert.equal(clamped.doc.images.find(p=>p.kind==='page').inward,.01);assert(clamped.warnings.some(w=>w.includes('below 0.01')));
for(const change of [p=>p.anchor='center',p=>p.anchor='constructor',p=>p.page=0,p=>p.page=1.5,p=>p.page=3001,p=>p.down=Infinity,p=>p.inward=-31,p=>p.margin=-1,p=>p.scale=19,p=>p.asset='missing']){
 const bad=sample(E);change(bad.images.find(p=>p.kind==='page'));assert.throws(()=>P.writeDocument(bad,E,T,measure));
}
console.log('PASS: PXP six page-image anchors, physical page assignments, shared PNG counts, exact PIINFO/cache fields, geometry, Save, no-inline blocks, native offset clamps, source isolation and PXC/PXA scopes');
