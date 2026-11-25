const assert=require('node:assert/strict');
global.PechaImages=require('../src/images');global.Folio=require('../src/folio');
const E=require('../src/engine'),P=require('../src/pxp'),T=require('../src/legacy-table'),D=require('../src/documents'),R=require('../src/rtf');
const {native,font}=require('./native-charset-fixture'),{cases,fonts,code,stream,sample,expected}=require('./native-multibyte-fixture');
const visible=text=>E.parseStream(text,false).filter(r=>r.k==='text').map(r=>r.s).join('').replace(/\u2028/g,'\n');
const eventText=result=>result.ev.filter(e=>e.t==='text').map(e=>e.s).join('');
const decode=bytes=>P.decodeStream(Uint8Array.from(bytes),{0:'Arial',1:'Arial'},T,0,{0:128,1:0});
for(const c of cases){
 const bytes=[...Buffer.from(c.hex,'hex')];
 for(const extension of ['pxp','pxc','pxa']){
  const id=extension==='pxa'?5:0,s=[...font(id),...bytes],base=E.defaultDoc();base.text='Keep body';
  const before=JSON.stringify(base),got=P.load(native({extension,fonts:[{name:'Arial',charset:c.charset}],body:extension==='pxa'?[]:s,note:s,yigo:s,rhino:s}),extension,T,base,E);
  assert.equal(visible(got.doc.notes.sets['title.front'].inL.text),c.text);assert.equal(visible(got.doc.folio.rhino),c.text);
  if(extension==='pxa')assert.equal(got.doc.text,'Keep body');else {assert.equal(visible(got.doc.text),c.text);assert.equal(visible(got.doc.yigo.text),c.text);}
  assert.equal(got.unknown,0);assert(!got.warnings.some(w=>/could not be decoded|unsupported/.test(w)));
  assert.equal(JSON.stringify(base),before);assert.equal(visible(D.normalize(got.doc,E).text),visible(got.doc.text));
 }
}
const mixed=P.load(sample(),'pxp',T,E.defaultDoc(),E).doc;assert.equal(visible(mixed.text),expected);assert.equal(visible(R.read(R.write(mixed,E),E,T).doc.text),expected);
const runs=E.parseStream(mixed.text,false).filter(r=>r.k==='text');assert(runs.some(r=>r.s.includes('中文')&&r.style.bold));assert(runs.some(r=>r.s.includes('한국어')&&r.style.italic));
// Every structural boundary must finish an incomplete sequence before processing the record.
for(const boundary of [font(0),code(35,1),code(34,200,0,0),[10],[13,10],[12],[9],[11],[19,0,0,0,0,19]]){
 const got=decode([0x93,...boundary,0x41]);assert(eventText(got).startsWith('�'));assert(eventText(got).endsWith('A'));assert(got.warnings.length);assert(Object.keys(got.unknown).length);
}
// A font switch does not carry a lead byte into another charset.
assert.equal(eventText(decode([0x93,...font(1),0xe9,...font(0),0x93,0xfa])),'�é日');
// Framed glyphs contain one byte; normal DBCS on either side cannot consume it.
const glyph=[20,0,0,0xa6,0,20];assert.equal(eventText(decode([0x93,0xfa,...glyph,0x96,0x7b])),'日ｦ本');
assert.equal(eventText(decode([0x93,20,0,0,0x93,0,20,0x41])),'��A');
// End of input, invalid trails, tabs and incomplete format markers report replacements.
for(const bytes of [[0x93],[0x93,0xff],[0x93,17,32]])assert(decode(bytes).warnings.length);
assert.equal(eventText(decode([65,9,66])),'A\tB');
// Flush bounded chunks without breaking a character spanning the 16 KiB boundary.
const long=[...Array(16383).fill(65),0x93,0xfa,0x96,0x7b];const got=decode(long);assert.equal(eventText(got),'A'.repeat(16383)+'日本');assert.deepEqual(got.warnings,[]);
// Legacy font conversion remains byte-based even if the source charset says DBCS.
const tib=P.decodeStream(Uint8Array.from([33]),{0:'TibetanMachine'},T,0,{0:128});assert.equal(eventText(tib),'ཀ');assert.deepEqual(tib.warnings,[]);
// An unfinished stream cannot contaminate a subsequent body or annotation decode.
decode([0x93]);assert.equal(eventText(decode([0x93,0xfa])),'日');
console.log('PASS: native Shift-JIS/GBK/Korean/Big5 in PXP/PXC/PXA body/marks, styles, Save/RTF, source isolation, bounded streaming, record/font/glyph boundaries, malformed warnings and TCC priority');
