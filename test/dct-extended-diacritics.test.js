const assert=require('node:assert/strict');
global.PechaImages=require('../src/images');global.Folio=require('../src/folio');
const E=require('../src/engine'),Dct=require('../src/dct'),D=require('../src/documents'),R=require('../src/rtf'),T=require('../src/legacy-table'),P=require('../src/pxp'),{cases,expected,body,sample,wrap}=require('./dct-extended-diacritics-fixture'),{fixture}=require('./dct-header-fixture');
const visible=text=>E.parseStream(text,false).filter(r=>r.k==='text').map(r=>r.s).join('').replace(/\u2028/g,'\n');
const raw={remapDiacritics:false,diacriticFont:'family:Times%20New%20Roman',diacriticSize:24};
for(const [byte,sequence] of cases){
 const result=Dct.read(wrap([21,byte,16,65,17,33],'Ansi'),E,T,null,raw);assert.equal(visible(result.doc.text),sequence.normalize('NFC')+'Aཀ');assert.equal(result.unknown,0);
 const runs=E.parseStream(result.doc.text,false).filter(r=>r.k==='text');assert.equal(runs[0].style.font,raw.diacriticFont);assert.equal(runs[0].style.size,24);assert.equal(runs[2].style.font,'jomolhari');
}
let supported=0;
for(let byte=128;byte<=255;byte++){
 const result=Dct.read(wrap([21,byte],'Ansi'),E,T,null,raw),text=visible(result.doc.text);
 if([160,200,202,204].includes(byte)){assert.equal(text,'�');assert.equal(result.unknown,1);}
 else {assert.equal(result.unknown,0);assert(!text.includes('�'));assert.equal(text,text.normalize('NFC'));supported++;}
}
assert.equal(supported,124); // 34 established core + 90 extended byte positions.
// Remapping happens first and affects one diacritic glyph, independent of old-TCC versions.
for(const remapDiacritics of [false,true]){
 const result=Dct.read(wrap([21,209,16,209,21,97,65],'Ansi'),E,T,null,{...raw,remapDiacritics});assert.equal(visible(result.doc.text),remapDiacritics?'ÑÑāA':'ĩÑaA');
}
const original=sample(),before=Buffer.from(original),base=E.defaultDoc();base.text='KEEP';const snapshot=JSON.stringify(base);
const out=Dct.read(original,E,T,base,raw);assert.equal(visible(out.doc.text),expected);assert.equal(out.unknown,0);assert.deepEqual(original,before);assert.equal(JSON.stringify(base),snapshot);
for(const version of [2,3,4,5])assert.equal(visible(Dct.read(fixture({header:`1 2 TibetD ${version}`,body,settings:'1 5 123 9 0 Ansi'}),E,T,base,raw).doc.text),expected);
assert.equal(visible(D.normalize(D.artifact(out.doc,'document'),E).text),expected);const round=R.read(R.write(out.doc,E),E,T).doc;assert.equal(visible(round.text),expected);
const unchanged=JSON.stringify(out.doc);assert.throws(()=>P.writeContent(out.doc,E,T),/cannot encode U\+/);assert.equal(JSON.stringify(out.doc),unchanged);
console.log('PASS: 29 explicit extended CSX+ examples, all124 supported/four unresolved high-byte positions, remap/raw209 distinction and per-glyph scope, versions2–5, typography/source isolation, Save/RTF and bounded native rejection');
