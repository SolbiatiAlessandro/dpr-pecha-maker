const assert=require('node:assert/strict');
global.PechaImages=require('../src/images');global.Folio=require('../src/folio');
const C=require('../src/legacy-characters'),T=require('../src/legacy-table'),E=require('../src/engine'),F=require('../src/text-format'),R=require('../src/rtf'),D=require('../src/documents'),{cases}=require('./legacy-chart-families-fixture');
const before=JSON.stringify(T),names=C.fontNames(T);assert.equal(names.length,56);assert.equal(new Set(names).size,56);assert.deepEqual(names.slice(0,5),C.fonts);
assert.deepEqual(new Set(names),new Set(Object.keys(T)));
const extra=Object.create({Inherited:{33:'ཀ'}});Object.assign(extra,{Empty:null,Array:[],Text:'bad',Valid:{33:'ཀ'}});
assert.deepEqual(C.fontNames(extra),[...C.fonts,'Valid']);assert.throws(()=>C.chart('Inherited',extra));
for(const name of names){
 const slots=C.chart(name,T);assert.equal(slots.length,224);assert.equal(slots[0].text,' ');
 for(const [i,s] of slots.entries()){
  assert.equal(s.byte,i+32);assert(s.name.startsWith(name+' slot '));assert.equal(s.code,`${i+32} / 0x${(i+32).toString(16).toUpperCase().padStart(2,'0')}`);
  if(s.text!==null){assert(s.text===' '||/^[\u0f00-\u0fff]+$/.test(s.text));assert.notEqual(s.text,'༠༠༠༠');assert.equal(s.combining,/^\p{M}/u.test(s.text));}
 }
}
const visible=text=>E.parseStream(text,false).filter(r=>r.k==='text').map(r=>r.s).join('');
for(const [name,byte,text] of cases){
 const slot=C.chart(name,T)[byte-32];assert.equal(slot.text,text);
 const imported=R.read('{\\rtf1{\\fonttbl{\\f0 '+name+';}}\\f0 '+"\\'"+byte.toString(16)+'}',E,T);assert.equal(visible(imported.doc.text),text);
 const source='{font:serif 18 b #aa0000}AB',start=source.indexOf('AB'),inserted=F.insertCharacter(source,start,start+1,text,'noto',E);
 const runs=E.parseStream(inserted.text,false).filter(r=>r.k==='text');assert.deepEqual(runs.map(r=>r.s),[text,'B']);assert.equal(runs[0].style.font,'noto');assert.equal(runs[1].style.font,'serif');assert(runs.every(r=>r.style.bold&&r.style.size===18&&r.style.color==='#aa0000'));
 const doc=E.defaultDoc();doc.text=inserted.text;assert.equal(D.normalize(D.artifact(doc,'document'),E).text,inserted.text);assert.equal(visible(R.read(R.write(doc,E),E,T).doc.text),text+'B');
}
for(const c of 'abcdefg')for(const suffix of ['',1,2,3])assert.equal(C.chart('Ededris-'+c+suffix,T)[34-32].text,null);
for(const [name,byte] of [['LMantra',33],['Esamc',126],['Ededris-vowa',126],['TCRC Bod-Yig',33],['TibetanMachineWeb',127]])assert.equal(C.chart(name,T)[byte-32].text,null);
assert.equal(JSON.stringify(T),before);
console.log('PASS: all56 chart names/224slots, map isolation and inherited/invalid exclusions, 17 exact examples and RTF parity, font/style restoration, Save/RTF and unresolved/ambiguous/non-Tibetan disabled slots');
