const assert=require('node:assert/strict');
global.PechaImages=require('../src/images');global.Folio=require('../src/folio');
const E=require('../src/engine'),R=require('../src/rtf'),F=require('../src/text-format'),D=require('../src/documents'),T=require('../src/legacy-table');
const visible=d=>E.parseStream(d.text,false).filter(r=>r.k==='text').map(r=>r.s).join('');
const cases=[[0,0xe9,'é'],[77,0x80,'Ä'],[161,0xc1,'Α'],[162,0xd0,'Ğ'],[163,0xd5,'Ơ'],[177,0xe0,'א'],[178,0xc7,'ا'],[186,0xc0,'Ą'],[204,0xc0,'А'],[222,0xa1,'ก'],[238,0xc0,'Ŕ']];
for(const [charset,byte,expected] of cases){
 for(const token of ["\\'"+byte.toString(16),String.fromCharCode(byte)]){
  const s='{\\rtf1\\ansi\\ansicpg1252\\deff0{\\fonttbl{\\f0\\fcharset'+charset+' Arial;}}\\f0 '+token+'}';
  const out=R.read(Uint8Array.from(s,c=>c.charCodeAt(0)),E,T);assert.equal(visible(out.doc),expected);assert.deepEqual(out.warnings,[]);assert.equal(visible(R.read(R.write(out.doc,E),E,T).doc),expected);
 }
}
// Switching fonts, restoring a nested group, and plain/default-font reset all select the right encoding.
const fixture="{\\rtf1\\ansi\\ansicpg1252\\deff1{\\fonttbl{\\f0\\fcharset0 Arial;}{\\f1\\fcharset204 Courier New;}{\\f2\\fcharset161 Times New Roman;}}\\fs36\\b\\cf0 \\'cf\\'f0\\'e8\\'e2\\'e5\\'f2 {\\f2\\i \\'c1\\'e2} \\'cc\\'e8\\'f0 \\f0\\b0 \\'e9 \\plain \\'c4}";
const out=R.read(fixture,E,T);assert.equal(visible(out.doc),'Привет Αβ Мир é Д');assert.deepEqual(out.warnings,[]);
const runs=E.parseStream(out.doc.text,false).filter(r=>r.k==='text');assert(runs.find(r=>r.s.includes('Привет')).style.bold);assert(runs.find(r=>r.s.includes('Αβ')).style.italic);assert.equal(runs.find(r=>r.s.includes('Д')).style.font,'family:Courier%20New');assert(!runs.find(r=>r.s.includes('Д')).style.bold);
// Missing/default charset inherits the document code page; an explicit ANSI font switches back to 1252.
for(const charset of ['', '\\fcharset1']){const out=R.read("{\\rtf1\\ansi\\ansicpg1251{\\fonttbl{\\f0"+charset+" Arial;}{\\f1\\fcharset0 Arial;}}\\f0 \\'c0\\f1 \\'c0}",E,T);assert.equal(visible(out.doc),'АÀ');}
const name=R.read("{\\rtf1\\ansi{\\fonttbl{\\f0\\fcharset204 \\'cc\\'ee\\'e9;}}\\f0 \\'c0}",E,T);assert.equal(E.fontFamily(E.parseStream(name.doc.text,false)[0].style.font).split(',')[0],'"Мой"');
const unicode=R.read("{\\rtf1\\ansi{\\fonttbl{\\f0\\fcharset204 Arial;}}\\uc1\\u3904\\'ff\\u-10179?\\u-8704?\\'c0}",E,T);assert.equal(visible(unicode.doc),'ཀ😀А');assert.deepEqual(unicode.warnings,[]);
const legacyName=Object.keys(T).find(n=>n==='TibetanMachine'),legacyByte=Object.keys(T[legacyName]).find(b=>+b>=32&&T[legacyName][b]);const legacy=R.read('{\\rtf1{\\fonttbl{\\f0\\fcharset2 '+legacyName+';}}\\f0 \\'+"'"+(+legacyByte).toString(16).padStart(2,'0')+'}',E,T);assert.equal(visible(legacy.doc),T[legacyName][legacyByte]);
for(const declaration of ['\\fcharset2','\\fcharset128','\\fcharset42']){const bad=R.read("{\\rtf1{\\fonttbl{\\f0"+declaration+" Unknown;}}\\f0 \\'ff}",E,T);assert.equal(visible(bad.doc),'�');assert(bad.warnings.some(s=>s.includes('unsupported')));}
const symbol=R.read('{\\rtf1{\\fonttbl{\\f0\\fcharset2 Symbol;}}ABC}',E,T);assert.equal(visible(symbol.doc),'���');assert(symbol.warnings.length);
const unknown=R.read("{\\rtf1\\ansicpg99999 \\'e9}",E,T);assert.equal(visible(unknown.doc),'�');assert(unknown.warnings.length);
const undefinedByte=R.read("{\\rtf1\\ansicpg1252 \\'81}",E,T);assert.equal(visible(undefinedByte.doc),'�');assert(undefinedByte.warnings.some(s=>s.includes('undefined')));
const d=E.defaultDoc();d.text='OLD';const pasted=R.insert(fixture,d,d.text,0,3,E,T,F);assert.equal(visible({text:pasted.text}),visible(out.doc));assert.equal(d.text,'OLD');assert.equal(visible(D.normalize({...d,text:pasted.text},E)),visible(out.doc));
for(const kind of ['note','phrase','yigo']){const pasted=R.insertMark(fixture,{text:'OLD',rich:false},0,3,E,T,F,kind);assert.equal(visible({text:pasted.text}),visible(out.doc));}
console.log('PASS: RTF font charsets, raw/escaped bytes, all supported single-byte pages, nested/default font changes, encoded names, Unicode fallback, legacy Tibetan precedence, explicit unsupported/undefined handling, body/mark paste and Save/RTF roundtrip');
module.exports={fixture,expected:'Привет Αβ Мир é Д'};
