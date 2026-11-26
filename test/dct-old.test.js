const assert=require('node:assert/strict');
global.PechaImages=require('../src/images');global.Folio=require('../src/folio');
const E=require('../src/engine'),D=require('../src/dct'),T=require('../src/legacy-table'),Docs=require('../src/documents'),R=require('../src/rtf'),{wrap,sample,expected}=require('./dct-old-fixture');
const visible=d=>E.parseStream(d.doc?.text ?? d.text,false).map(r=>r.k==='text'?r.s:r.k==='page'?'[PAGE]':'').join('').replace(/\u2028/g,'\n');
const read=(body,v=2,mode='TibetanAnsi',base)=>D.read(wrap(body,v,mode),E,T,base);
for(const v of [2,3]){
 const input=sample(v),before=Buffer.from(input),out=D.read(input,E,T);assert.equal(visible(out.doc),expected);assert.equal(out.unknown,1);assert.deepEqual(input,before);
 assert(out.warnings.some(s=>s.includes('Older TibetDoc')));assert(out.warnings.some(s=>s.includes('1 DCT glyphs')));
 const basePairs=[[205,'་'],[45,'པ'],[127,'སྐྱ'],[158,'དྲྭ'],[159,'ཕྱྭ'],[142,'�'],[166,'ུ'],[253,'་']];
 for(const [byte,text] of basePairs){assert.equal(visible(read([byte],v)),text);assert.equal(visible(read([17,byte],v,'Ansi')),text);}
 // Cyclic old slots are substituted once, never recursively.
 assert.equal(visible(read([205,45,253],v)),'་པ་');
 const bytes=[45,127,142,158,160,166];
 for(const [marker,texts] of [[18,['ྈྣ','ཛྫྙ','ཌྮླ','ཌྐ','ཌྡྷ','ཋྱ']],[19,['ཊྤྲ','ཎྨ','པྙ','བྣ','བྦྷ','བྷྨ']],[20,['ཪྡྷྱ','ཧྙ','ཀྵ','�','�','�']],[23,['�','�','�','�','�','�']]]){
  bytes.forEach((b,i)=>{const out=read([marker,b],v);assert.equal(visible(out.doc),texts[i]);assert.equal(out.unknown,texts[i]==='�'?1:0);});
 }
 // Latin and CSX+ have separate conversion, independent of the old TCC slots.
 assert.equal(visible(read([45,205,127,158,159,166,253],v,'Ansi')),'-Í�žŸ¦ý');
 assert.equal(visible(read([16,45,45,21,97,45],v)),'-པāཔ');
 assert.equal(visible(read([18,128,19,128,20,128,23,130],v)),'ཛྫྭནྦྷྱཧྤ༖','unmodified slots use resolved modern byte aliases');
 assert.equal(visible(read([25,101,45,25,101,127,9,45,12,127],v)),'པ\nསྐྱ\tཔ[PAGE]སྐྱ');
 const kept=E.defaultDoc();kept.text='Prior';kept.textSize=80;kept.sections=[{text:'Old'}];kept.notes.sets['body.front'].inL.text='Keep';const snap=JSON.stringify(kept),got=read([45],v,'TibetanAnsi',kept).doc;
 assert.equal(JSON.stringify(kept),snap);assert.equal(got.notes.sets['body.front'].inL.text,'Keep');assert.equal(got.textSize,null);assert.deepEqual(got.sections,[]);
 assert.equal(visible(Docs.normalize(Docs.artifact(out.doc,'document'),E)),expected);assert.equal(visible(R.read(R.write(out.doc,E),E,T).doc),expected);
 for(const body of [[17],[18],[19],[20],[23],[25],[33,10,...Buffer.from('2\t!\tmore')]])assert.throws(()=>read(body,v));
}
for(const v of [4,5]){assert.equal(visible(read([45,17,45,18,45,16,45],v)),'་་༠༠༠༠-');assert(!read([45],v).warnings.some(s=>s.includes('Older TibetDoc')));}
console.log('PASS: TibetDoc2/3 base and all subfont corrections, single-pass cycles, unresolved-slot counts, Latin/CSX independence, modern bypass, source/layout retention, controls/framing and Save/RTF');
