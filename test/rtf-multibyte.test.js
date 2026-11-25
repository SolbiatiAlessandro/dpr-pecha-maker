const assert=require('node:assert/strict');
global.PechaImages=require('../src/images');global.Folio=require('../src/folio');
const E=require('../src/engine'),R=require('../src/rtf'),F=require('../src/text-format'),D=require('../src/documents'),T=require('../src/legacy-table'),{hex,cases,fixture,expected}=require('./rtf-multibyte-fixture');
const visible=d=>E.parseStream(d.text,false).filter(r=>r.k==='text').map(r=>r.s).join('');
for(const c of cases){
 for(const header of ['\\ansicpg1252{\\fonttbl{\\f0\\fcharset'+c.charset+' Arial;}}','\\ansicpg'+c.page]){
  const out=R.read('{\\rtf1\\ansi'+header+'\\f0 '+hex(c.hex)+'}',E,T);assert.equal(visible(out.doc),c.text);assert.deepEqual(out.warnings,[]);
 }
}
const out=R.read(fixture,E,T);assert.equal(visible(out.doc),expected);assert.deepEqual(out.warnings,[]);assert.equal(visible(R.read(R.write(out.doc,E),E,T).doc),expected);assert.equal(visible(D.normalize(out.doc,E)),expected);
// Escaped leads may use raw or escaped trails; RTF-J raw leads require raw trails.
const mixed='{\\rtf1\\ansicpg932 '+hex('93fa')+hex('96')+'\\{'+hex('83')+'\\\\}';assert.equal(visible(R.read(Uint8Array.from(mixed,c=>c.charCodeAt(0)),E,T).doc),'日本ソ');
const nested='{\\rtf1{\\fonttbl{\\f0\\fcharset128 Arial;}{\\f1\\fcharset134 Courier New;}}\\f0 '+hex('93fa')+'{\\f1\\b '+hex('d6d0')+'}'+hex('967b')+'\\f1 '+hex('cec4')+'\\plain '+hex('8cea')+'}';
const nestedOut=R.read(nested,E,T);assert.equal(visible(nestedOut.doc),'日中本文語');assert.deepEqual(nestedOut.warnings,[]);const nr=E.parseStream(nestedOut.doc.text,false).filter(r=>r.k==='text');assert(nr.find(r=>r.s==='中').style.bold);assert(!nr.find(r=>r.s==='本').style.bold);
const named=R.read('{\\rtf1{\\fonttbl{\\f0\\fcharset128 '+hex('93fa967b8cea')+';}}'+hex('93fa')+'}',E,T);assert.equal(E.primaryFont(E.fontFamily(E.parseStream(named.doc.text,false)[0].style.font)),'日本語');assert.equal(visible(named.doc),'日');
const unicode=R.read('{\\rtf1\\ansicpg932\\uc2\\u26085'+hex('93fa')+hex('967b')+'\\uc0\\u3904'+hex('8cea')+'}',E,T);assert.equal(visible(unicode.doc),'日本ཀ語');assert.deepEqual(unicode.warnings,[]);
const utf8Text='ཀི་😀中文',utf8=Buffer.from(utf8Text).toString('hex');for(const token of [hex(utf8),Buffer.from(utf8Text).toString('latin1')]){const data=R.read('{\\rtf1\\ansi\\ansicpg65001 '+token+'}',E,T);assert.equal(visible(data.doc),utf8Text);assert.deepEqual(data.warnings,[]);}
// A bounded-buffer flush can bisect a DBCS or UTF-8 character without losing it.
for(const [page,encoded,plain] of [[932,'93fa','日'],[65001,utf8,utf8Text]]){const prefix='A'.repeat(16383),result=R.read('{\\rtf1\\ansicpg'+page+' '+prefix+hex(encoded)+'}',E,T);assert.equal(visible(result.doc),prefix+plain);assert.deepEqual(result.warnings,[]);}
// Incomplete characters stop at group/font boundaries and never consume another style's bytes.
for(const tail of ['', '{X}', '\\b X']){const bad=R.read('{\\rtf1\\ansicpg932 '+hex('82')+tail+'}',E,T);assert(visible(bad.doc).startsWith('�'));assert(bad.warnings.some(s=>s.includes('invalid sequence')));}
const d=E.defaultDoc();d.text='OLD';const inserted=R.insert(fixture,d,d.text,0,3,E,T,F);assert.equal(visible({text:inserted.text}),expected);assert.equal(d.text,'OLD');for(const kind of ['note','phrase','yigo'])assert.equal(visible({text:R.insertMark(fixture,{text:'OLD',rich:false},0,3,E,T,F,kind).text}),expected);
console.log('PASS: RTF Shift-JIS/GBK/Korean/Big5 and UTF-8, mixed raw/escaped trails, font/group/default boundaries, encoded font names, Unicode fallback, bounded streaming, malformed sequences, body/mark paste and Save/RTF roundtrip');
