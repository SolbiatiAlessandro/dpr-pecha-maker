const assert=require('node:assert/strict');
global.PechaImages=require('../src/images');global.Folio=require('../src/folio');
const E=require('../src/engine'),R=require('../src/rtf'),T=require('../src/legacy-table'),D=require('../src/documents'),F=require('../src/text-format');
const {fixture}=require('./rtf-codepage-fixture'),{cases,hex}=require('./rtf-multibyte-fixture');
const visible=text=>E.parseStream(text,false).filter(r=>r.k==='text').map(r=>r.s).join('');
const read=s=>R.read(s,E,T),expected='Привет Café 日本語 '+T.TibetanMachine[107];
assert.equal(visible(read(fixture).doc.text),expected);assert.deepEqual(read(fixture).warnings,[]);
// Explicit pages win over charset hints in either order, including Default/Symbol/unknown.
for(const charset of [0,1,2,204,42]) for(const declaration of [`\\fcharset${charset}\\cpg1251`,`\\cpg1251\\fcharset${charset}`]){
 for(const grouped of [true,false]) for(const byte of [String.raw`\'c0`,'\xc0']){
  const entry='\\f0'+declaration+' Arial;',s='{\\rtf1\\ansicpg1252{\\fonttbl'+(grouped?'{'+entry+'}':entry)+'}'+byte+'}';
  const got=read(s);assert.equal(visible(got.doc.text),'А');assert.deepEqual(got.warnings,[]);
 }
}
// Code pages work without fcharset, including multi-byte sequences and UTF-8.
for(const c of [...cases,{page:65001,hex:'e0bd80f09f9880',text:'ཀ😀'}]){
 const got=read('{\\rtf1\\ansicpg1252{\\fonttbl{\\f0\\cpg'+c.page+' Arial;}}'+hex(c.hex)+'}');
 assert.equal(visible(got.doc.text),c.text);assert.deepEqual(got.warnings,[]);
}
// Font names use the same encoding; embedded file paths have their own ignored metadata.
const named=read(String.raw`{\rtf1\ansi{\fonttbl{\f0\fcharset0\cpg1251{\*\fontemb{\*\fontfile\cpg932 ignored.ttf}data}\'cc\'ee\'e9;}{\f1 Arial;}}\f0 \'c0{\f1 \'e9}\'c1\plain \'c2}`);
assert.equal(visible(named.doc.text),'АéБВ');assert.deepEqual(named.warnings,[]);
assert.equal(E.primaryFont(E.fontFamily(E.parseStream(named.doc.text,false)[0].style.font)),'Мой');
// Nested or body cpg controls are not font declarations, and fallback tokens do not set pages.
const isolated=read(String.raw`{\rtf1\ansi{\fonttbl{\f0\fcharset0{\*\fontemb{\*\fontfile\cpg1251 unused}}Arial;}{\f1\uc1 \u65\cpg1251 rial;}}\cpg1251\f0 \'e9\f1 \'e9}`);
assert.equal(visible(isolated.doc.text),'éé');assert.deepEqual(isolated.warnings,[]);
// An unsupported explicit page must not silently fall back to a supported charset.
for(const page of [99999,1361,0,-1]){
 const got=read('{\\rtf1{\\fonttbl{\\f0\\fcharset0\\cpg'+page+' Arial;}}'+String.raw`\'e9}`);
 assert.equal(visible(got.doc.text),'�');assert(got.warnings.some(w=>w.includes('unsupported')));
}
const bad=read(String.raw`{\rtf1{\fonttbl{\f0\cpg932 Arial;}}\'93}`);assert.equal(visible(bad.doc.text),'�');assert(bad.warnings.some(w=>w.includes('invalid sequence')));
const d=E.defaultDoc();d.text='OLD';d.notes.sets['body.front'].inL.text='Keep';const snapshot=JSON.stringify(d),imported=R.read(fixture,E,T,d).doc;
assert.equal(JSON.stringify(d),snapshot);assert.equal(imported.notes.sets['body.front'].inL.text,'Keep');assert.equal(visible(D.normalize(imported,E).text),expected);
assert.equal(visible(read(R.write(imported,E)).doc.text),expected);
assert.equal(visible(R.insert(fixture,d,d.text,0,3,E,T,F).text),expected);
for(const kind of ['note','phrase','yigo'])assert.equal(visible(R.insertMark(fixture,{text:'OLD',rich:false},0,3,E,T,F,kind).text),expected);
console.log('PASS: explicit RTF code-page precedence, grouped/flat entries, raw/hex/multibyte/UTF-8 bytes, font names and metadata isolation, group/plain restoration, legacy Tibetan, invalid/unsupported warnings, source isolation, Save/RTF roundtrip and paste');
