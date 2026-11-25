const assert=require('node:assert/strict');
global.PechaImages=require('../src/images');global.Folio=require('../src/folio');
const E=require('../src/engine'),R=require('../src/rtf'),F=require('../src/text-format'),D=require('../src/documents'),T=require('../src/legacy-table'),{fixture}=require('./rtf-font-table-fixture');
const runs=text=>E.parseStream(text,false).filter(r=>r.k==='text'),visible=text=>runs(text).map(r=>r.s).join('');
const expected='Привет Café 日本語 '+T.TibetanMachine[107],out=R.read(fixture,E,T);
assert.equal(visible(out.doc.text),expected);assert.deepEqual(out.warnings,[]);
const styles=runs(out.doc.text);
assert.equal(styles.find(r=>r.s.includes('Привет')).style.font,'family:Courier%20New');assert(styles.find(r=>r.s.includes('Привет')).style.bold);
assert.equal(styles.find(r=>r.s.includes('Café')).style.font,'family:Arial');assert(styles.find(r=>r.s.includes('Café')).style.italic);
assert.equal(styles.find(r=>r.s.includes('日本語')).style.font,'family:Arial');assert.equal(styles.at(-1).style.font,'jomolhari');
// Grouped and older flat definitions both ignore nested metadata, including misleading font/charset controls.
for(const grouped of [true,false]){
 const entries=[String.raw`\f0\fcharset204{\*\fontemb{\*\fontfile\f9\fcharset0 Bad;}data}Courier New{\*\falt Wrong;};`,String.raw`\f1\fcharset0{\*\panose 0123456789}Arial;`];
 const input=String.raw`{\rtf1\ansi{\fonttbl`+entries.map(s=>grouped?'{'+s+'}':s).join('')+String.raw`}\f0 \'c0\f1 \'e9}`;
 const got=R.read(input,E,T);assert.equal(visible(got.doc.text),'Аé');assert.deepEqual(runs(got.doc.text).map(r=>r.style.font),['family:Courier%20New','family:Arial']);assert.deepEqual(got.warnings,[]);
}
// Unicode fallback length is inherited from outer groups and restored after each font entry.
for(const prefix of ['',String.raw`\uc2`]){
 const fallback=prefix?'??':'?';
 const input=String.raw`{\rtf1`+prefix+String.raw`{\fonttbl{\f0\uc0 \u26085;}{\f1 \u26412`+fallback+String.raw`Name;}}\f0 A\f1 B}`;
 const got=R.read(input,E,T);assert.deepEqual(runs(got.doc.text).map(r=>E.primaryFont(E.fontFamily(r.style.font))),['日','本Name']);
}
// Metadata after a primary name cannot overwrite it, even when it contains semicolons or byte escapes.
const after=R.read(String.raw`{\rtf1{\fonttbl{\f0 Arial;{\*\falt Wrong;}{\*\panose deadbeef}}}text}`,E,T);assert.equal(runs(after.doc.text)[0].style.font,'family:Arial');
const d=E.defaultDoc();d.text='OLD';d.notes.sets['body.front'].inL.text='Keep';const snapshot=JSON.stringify(d),imported=R.read(fixture,E,T,d).doc;
assert.equal(JSON.stringify(d),snapshot);assert.equal(imported.notes.sets['body.front'].inL.text,'Keep');assert.equal(visible(D.normalize(imported,E).text),expected);
assert.equal(visible(R.read(R.write(imported,E),E,T).doc.text),expected);
const pasted=R.insert(fixture,d,d.text,0,3,E,T,F);assert.equal(visible(pasted.text),expected);
for(const kind of ['note','phrase','yigo'])assert.equal(visible(R.insertMark(fixture,{text:'OLD',rich:false},0,3,E,T,F,kind).text),expected);
console.log('PASS: grouped/flat RTF font tables, metadata isolation, font/charset selection, legacy Tibetan mapping, Unicode fallback scope, source isolation, Save/RTF roundtrip and all paste destinations');
