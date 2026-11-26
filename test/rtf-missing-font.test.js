const assert=require('node:assert/strict');
global.PechaImages=require('../src/images');global.Folio=require('../src/folio');
const E=require('../src/engine'),R=require('../src/rtf'),T=require('../src/legacy-table'),D=require('../src/documents'),F=require('../src/text-format'),{fixture,expected}=require('./rtf-missing-font-fixture'),{raw,cases}=require('./rtf-raw-dbcs-fixture');
const runs=s=>E.parseStream(s,false).filter(r=>r.k==='text'),visible=s=>runs(s).map(r=>r.s).join('');
const out=R.read(fixture,E,T);assert.equal(visible(out.doc.text),expected);assert.equal(out.warnings.length,1);assert(out.warnings[0].includes('font 0 is missing'));
for(const run of runs(out.doc.text)){assert.equal(run.style.size,24);assert.equal(run.style.bold,run.style.font==='jomolhari');}
for(const grouped of [true,false])for(const deff of ['',String.raw`\deff0`]){
 const entries=[String.raw`\f27\fcharset204 Courier New;`,String.raw`\f2\fcharset0 Arial;`];
 const rtf=String.raw`{\rtf1\ansi`+deff+String.raw`{\fonttbl`+entries.map(s=>grouped?'{'+s+'}':s).join('')+String.raw`}\fs36 \'c0{\f2 \'c0}\f0 \'c0\plain\fs36 \'c0}`;
 const result=R.read(rtf,E,T);assert.equal(visible(result.doc.text),'АÀАА');assert.equal(result.warnings.length,1);assert.equal(runs(result.doc.text)[0].style.font,'family:Courier%20New');
}
for(const c of cases){
 const header=String.raw`{\rtf1\ansi\deff0{\fonttbl{\f7\fcharset`+c.charset+String.raw` Arial;}{\f2\fcharset0 Times New Roman;}}`;
 const rtf=header+'\\fs36 '+raw(c.hex)+'{\\f2 A}\\plain\\fs36 '+raw(c.hex)+'}';
 const result=R.read(Buffer.from(rtf,'latin1'),E,T);assert.equal(visible(result.doc.text),c.text+'A'+c.text);assert.equal(result.warnings.length,1);
}
// A later but valid font0 wins over the first declaration; no invented fallback for missing nonzero IDs.
for(const [deff,header,body,expectedText] of [[0,String.raw`{\f7\fcharset204 Courier New;}{\f0\fcharset0 Arial;}`,String.raw`\'c0`,'À'],[7,String.raw`{\f7\fcharset128 TibetanMachine;}`,String.raw`\f7 !`,'ཀ']]){
 const result=R.read(String.raw`{\rtf1\deff`+deff+String.raw`{\fonttbl`+header+'}'+body+'}',E,T);
 assert.equal(visible(result.doc.text),expectedText);assert.deepEqual(result.warnings,[]);
}
const unknown=R.read(String.raw`{\rtf1\deff99{\fonttbl{\f7 TibetanMachine;}}A}`,E,T);assert.equal(visible(unknown.doc.text),'A');assert(!unknown.warnings.some(w=>w.includes('first declared')));
const plain=R.read(String.raw`{\rtf1 Hello}`,E,T);assert.equal(visible(plain.doc.text),'Hello');assert.deepEqual(plain.warnings,[]);
const current=E.defaultDoc();current.text='KEEP';current.notes.sets['body.front'].inL.text='NOTE';const before=JSON.stringify(current),input=Buffer.from(fixture),copy=Buffer.from(input);
const imported=R.read(input,E,T,current).doc;assert.equal(JSON.stringify(current),before);assert.deepEqual(input,copy);assert.equal(imported.notes.sets['body.front'].inL.text,'NOTE');
assert.equal(visible(D.normalize(D.artifact(imported,'document'),E).text),expected);assert.equal(visible(R.read(R.write(imported,E),E,T).doc.text),expected);
assert.equal(visible(R.insert(fixture,current,current.text,0,4,E,T,F).text),expected);
for(const kind of ['note','phrase','yigo'])assert.equal(visible(R.insertMark(fixture,{text:'KEEP',rich:false},0,4,E,T,F,kind).text),expected);
console.log('PASS: missing font0 uses declaration order, grouped/flat tables, default/plain/explicit/group scopes, raw ShiftJIS/GBK/Big5 syntax bytes, valid0/nonzero/no-table boundaries, Tibetan/style conversion, source isolation and Save/RTF/all paste scopes');
