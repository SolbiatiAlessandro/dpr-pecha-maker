const assert=require('node:assert/strict');
global.PechaImages=require('../src/images');global.Folio=require('../src/folio');
const Engine=require('../src/engine'),Pxp=require('../src/pxp'),Rtf=require('../src/rtf'),TABLE=require('../src/legacy-table'),Documents=require('../src/documents'),TextFormat=require('../src/text-format'),{sample}=require('./native-font-fixture');
const runs=text=>Engine.parseStream(text,false).filter(r=>r.k==='text'&&r.s.replace(/[\s\u2028]/g,''));
const families=text=>runs(text).map(r=>[r.s.replace(/[\s\u2028]/g,''),Engine.primaryFont(Engine.fontFor(Engine.defaultDoc(),r,23).family),r.style.size]);
const expected=[['Arial','Arial',28],['Mono','Courier New',28],['A','Arial',28],['W','Courier New',28],['B','Arial',28],['ཀཀྐཀ','Jomolhari',21],['C','Arial',28],['ཀ','Jomolhari',21],['D','Arial',28]];
for(const extension of ['pxp','pxc','pxa']) {
 const base=Engine.defaultDoc();base.text='Retained';
 const {doc}=Pxp.load(sample(extension),extension,TABLE,base,Engine);
 assert.deepEqual(families(doc.notes.sets['body.front'].inL.text),expected);
 if(extension==='pxa')assert.equal(doc.text,'Retained');else {
  assert.deepEqual(families(doc.text),expected);
  assert.deepEqual(families(Documents.normalize(Documents.artifact(doc,'document'),Engine).text),expected);
  const rtf=Rtf.write(doc,Engine);assert(rtf.includes('Courier New;'));assert(rtf.includes('Arial;'));
  assert.deepEqual(families(Rtf.read(rtf,Engine).doc.text),expected);
  const edited=TextFormat.apply(doc.text,0,doc.text.length,{size:32},Engine).text;
  assert.deepEqual(families(edited),expected.map(r=>[r[0],r[1],32]));
  // A selected font replacement restores the exact imported family afterward.
  const start=doc.text.indexOf('Mono'),changed=TextFormat.apply(doc.text,start,start+2,{font:'serif'},Engine).text;
  assert.deepEqual(families(changed).filter(r=>['Mo','no'].includes(r[0])),[['Mo','Georgia',28],['no','Courier New',28]]);
 }
}
for(const name of ['Times New Roman','A "quoted" \\face','Font{braces},fallback','__proto__','Tibetan Test','日本語書体','Café']) {
 const token=Engine.fontToken(name);assert(token);const family=Engine.fontFamily(token);
 assert.equal(Engine.primaryFont(family),name);
 const doc=Engine.defaultDoc();doc.text=`{font:${token}}Hello`;
 assert.equal(families(doc.text)[0][1],name);
 assert.equal(families(Rtf.read(Rtf.write(doc,Engine),Engine).doc.text)[0][1],name);
}
for(const name of ['',null,'x'.repeat(129),'bad\nface','bad;face','\ud800'])assert.equal(Engine.fontToken(name),null);
for(const token of ['family:%ZZ','family:%0A','family:','__proto__','family:'+'x'.repeat(1601)])assert.equal(Engine.fontFamily(token),null);
assert.equal(Pxp.eventsToText([],()=>false,true),'');
console.log('PASS: native named families and one-glyph font/size restoration; PXP/PXC/PXA, Tibetan stacks, Save, size-only edits, selected font restoration, RTF names/escaping and invalid-token handling');
