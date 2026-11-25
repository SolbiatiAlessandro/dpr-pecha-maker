const assert=require('node:assert/strict');
global.PechaImages=require('../src/images');global.Folio=require('../src/folio');
const E=require('../src/engine'),R=require('../src/rtf'),T=require('../src/legacy-table'),D=require('../src/documents'),F=require('../src/text-format'),{raw,cases,fixture,expected}=require('./rtf-raw-dbcs-fixture');
const visible=d=>E.parseStream(d.text,false).filter(r=>r.k==='text').map(r=>r.s).join('');
for(const c of [...cases,{page:949,charset:129,hex:'c7d1b1b9beee',text:'한국어'}])for(const declaration of ['\\ansicpg'+c.page,'{\\fonttbl{\\f0\\fcharset'+c.charset+' Arial;}}','{\\fonttbl\\f0\\fcharset0\\cpg'+c.page+' Arial;}']){
 const s='{\\rtf1'+declaration+'\\f0 '+raw(c.hex)+'{\\b B}Z}',out=R.read(Buffer.from(s,'latin1'),E,T);
 assert.equal(visible(out.doc),c.text+'BZ');assert.deepEqual(out.warnings,[]);
 const runs=E.parseStream(out.doc.text,false).filter(r=>r.k==='text');assert(runs.find(r=>r.s==='B').style.bold);assert(!runs.find(r=>r.s==='Z').style.bold);
}
const out=R.read(Buffer.from(fixture,'latin1'),E,T);assert.equal(visible(out.doc),expected);assert.deepEqual(out.warnings,[]);
assert.equal(visible(D.normalize(out.doc,E)),expected);assert.equal(visible(R.read(R.write(out.doc,E),E,T).doc),expected);
// Raw syntax-valued bytes inside primary font names and ignored metadata.
const named='{\\rtf1{\\fonttbl{\\f0\\fcharset128 '+raw('967b835c')+';}{\\f1\\fcharset0 Arial;}}\\f0 '+raw('967b')+'{\\f1 é}'+raw('835c')+'}';
const namedOut=R.read(named,E,T);assert.equal(visible(namedOut.doc),'本éソ');const nr=E.parseStream(namedOut.doc.text,false).filter(r=>r.k==='text');assert.equal(E.primaryFont(E.fontFamily(nr[0].style.font)),'本ソ');
const nested='{\\rtf1\\ansicpg1252\\deff1{\\fonttbl{\\f0\\fcharset0 Arial;}{\\f1\\cpg932{\\*\\fontemb{\\*\\fontfile\\cpg1251 ignored}}Arial;}}'+raw('967b')+'{\\f0 é}'+raw('835c')+'\\f0 X\\plain '+raw('817d')+'}';
assert.equal(visible(R.read(nested,E,T).doc),'本éソX±');
// A skipped fallback encoding command must not change the lexical code page.
const skipped='{\\rtf1\\ansicpg932\\uc1\\u65\\ansicpg1252\n'+raw('967b')+'}';assert.equal(visible(R.read(skipped,E,T).doc),'A本');
const fallback='{\\rtf1\\ansicpg932\\uc2\\u26412'+raw('967b')+raw('835c')+'}';assert.equal(visible(R.read(fallback,E,T).doc),'本ソ');
const fontFallback='{\\rtf1{\\fonttbl{\\f0\\fcharset128\\uc1\\u65\\cpg1252 '+raw('967b')+';}}'+raw('835c')+'}';assert.equal(visible(R.read(fontFallback,E,T).doc),'ソ');
// Legacy Tibetan glyph maps take precedence over a declared DBCS code page.
for(const name of ['TibetanMachine','\\uc1\\u84?ibetanMachine','Tibetan{\\*\\falt ignored}Machine']){
 const legacy=R.read('{\\rtf1{\\fonttbl{\\f0\\cpg932 '+name+';}}'+raw('81')+'{\\b '+raw('81')+'}}',E,T);
 assert.equal(visible(legacy.doc),T.TibetanMachine[129].repeat(2));assert.deepEqual(legacy.warnings,[]);
}
// Raw high bytes in a single-byte font must leave real group/control syntax intact.
const single=R.read('{\\rtf1\\ansicpg1252 é{\\b X}\\i Y}',E,T);assert.equal(visible(single.doc),'éXY');
// Escaped lead bytes continue to allow escaped syntax and raw ASCII trails.
assert.equal(visible(R.read("{\\rtf1\\ansicpg932 \\'96\\{\\'83\\\\\\'81@}",E,T).doc),'本ソ　');
// Binary data and raw byte pairs are separate lexical units.
assert.equal(visible(R.read('{\\rtf1\\ansicpg932 {\\*\\unknown\\bin3 {\\}}'+raw('967b')+'}',E,T).doc),'本');
const long='A'.repeat(16383)+raw('967b835c817d');assert.equal(visible(R.read('{\\rtf1\\ansicpg932 '+long+'}',E,T).doc),'A'.repeat(16383)+'本ソ±');
const bad=R.read('{\\rtf1\\ansicpg932 '+raw('8120')+'X}',E,T);assert(visible(bad.doc).includes('�'));assert(bad.warnings.some(w=>w.includes('invalid sequence')));
assert.throws(()=>R.read('{\\rtf1\\ansicpg932 '+raw('967b'),E,T),/Incomplete/);
const d=E.defaultDoc();d.text='OLD';assert.equal(visible({text:R.insert(fixture,d,d.text,0,3,E,T,F).text}),expected);assert.equal(d.text,'OLD');
for(const kind of ['note','phrase','yigo'])assert.equal(visible({text:R.insertMark(fixture,{text:'OLD',rich:false},0,3,E,T,F,kind).text}),expected.replace(/\u2028/g,' '));
console.log('PASS: raw RTF-J syntax-valued DBCS trails, header/font encodings, primary names, group/plain/default restoration, fallback/metadata isolation, binary/chunk boundaries, malformed input, paste and Save/RTF roundtrip');
