const assert=require('node:assert/strict');
global.PechaImages=require('../src/images');global.Folio=require('../src/folio');
const E=require('../src/engine'),R=require('../src/rtf'),D=require('../src/documents'),P=require('../src/pxp'),T=require('../src/legacy-table'),F=require('../src/text-format'),{picture,sample}=require('./rtf-image-scale-fixture');
const read=controls=>R.read('{\\rtf1 '+picture(controls)+'}',E,T);
const dims=d=>d.images.map(p=>{const s=PechaImages.dimensions(d,p);return [s.w,s.h];});
const close=(a,b)=>{assert.equal(a.length,b.length);a.forEach((v,i)=>assert(Math.abs(v-b[i])<1e-8,`${a} != ${b}`));};
for(const [controls,w,h] of [
 ['',72,36],['\\picscalex50',36,36],['\\picscaley50',72,18],['\\picscalex50\\picscaley200',36,72],
 ['\\picscalex150\\picscaley75',108,27],['\\picscalex500\\picscaley100',360,36],['\\picscalex1\\picscaley100',.72,36],
 ['\\picscalex100\\picscaley1',72,.36]
]){
 const got=read('\\picwgoal1440\\pichgoal720'+controls);assert.deepEqual(got.warnings,[]);close(dims(got.doc)[0],[w,h]);
 close(dims(D.normalize(D.artifact(got.doc,'document'),E))[0],[w,h]);
 const again=R.read(R.write(got.doc,E),E,T).doc;const rounded=[Math.round(w*20)/20,Math.round(h*20)/20];close(dims(again)[0],rounded);
}
// PNG dimensions/resolution supply independent defaults when RTF goals are absent.
const storedDpi=3780*.0254; // PNG pHYs stores whole pixels/metre.
close(dims(read('\\picscalex50\\picscaley200').doc)[0],[96*72/storedDpi*.5,48*72/storedDpi*2]);
close(dims(read('\\picwgoal1440\\picscalex50\\picscaley200').doc)[0],[36,48*72/storedDpi*2]);
const invalid=read('\\picwgoal1440\\pichgoal720\\picscalex0\\picscaley-2');close(dims(invalid.doc)[0],[72,36]);assert.equal(invalid.warnings.filter(w=>w.includes('invalid RTF image scale')).length,1);
const huge=read('\\picwgoal1440\\pichgoal720\\picscalex1000000\\picscaley1');assert(huge.warnings.some(w=>w.includes('limits')));assert(dims(huge.doc)[0].every(Number.isFinite));assert.deepEqual(dims(D.normalize(huge.doc,E)),dims(huge.doc));
const d=R.read(sample(),E,T).doc;assert.deepEqual(dims(d),[[36,72],[108,36],[72,18]]);assert.equal(d.assets.length,1);assert.equal(d.images.length,3);
const current=E.defaultDoc();current.text='Before OLD After';const before=JSON.stringify(current),a=current.text.indexOf('OLD'),pasted=R.insert(sample(),current,current.text,a,a+3,E,T,F);assert.deepEqual(dims({...current,...pasted}),dims(d));assert.equal(JSON.stringify(current),before);
const measure=(s,f)=>s.length*f.size*.4;measure.head=()=>({ascent:12,descent:4,height:16});
d.counts={title:0,fancy:0};d.yigo.enabled=false;d.dzog.enabled=false;d.types.body.lines=4;d.types.body.lineHeight=1.2;
const roundtrip=P.load(P.writeContent(d,E,T,measure).bytes,'pxc',T,E.defaultDoc(),E).doc;dims(roundtrip).forEach((s,i)=>close(s,dims(d)[i]));
assert.deepEqual(E.parseStream(d.text,false).filter(r=>r.k==='image').map(r=>r.style.align),['c','r','l']);
console.log('PASS: independent RTF image scale/default axes, goal/DPI fallback, feasible Save limits, explicit invalid/extreme warnings, deduplication, paste/source isolation, alignment and Save/RTF/native-content geometry');
