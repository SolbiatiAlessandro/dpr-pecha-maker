const assert=require('node:assert/strict');
global.PechaImages=require('../src/images');global.Folio=require('../src/folio');
const T=require('../src/legacy-table'),E=require('../src/engine'),R=require('../src/rtf'),P=require('../src/pxp'),Pdf=require('../src/pdfread'),D=require('../src/documents'),F=require('../src/text-format'),C=require('../src/legacy-characters'),{cases,expected,rtf,sample}=require('./legacy-tcc-family-fixture');
const visible=text=>E.parseStream(text,false).filter(r=>r.k==='text').map(r=>r.s).join('');
for(const family of ['TibetanClassic','TibetanChogyal']){
 assert.equal(T[family+'Skt'],T[family+'Skt1']);
 for(const suffix of ['','Skt1','Skt2','Skt3','Skt4']){
  const name=family+suffix;assert.notEqual(T[name],T['TibetanMachine'+suffix]);
  assert.equal(Pdf.tableFor(name,T).map,T[name]);
  for(const value of Object.values(T[name])){assert(value===' '||/^[\u0f00-\u0fff]*$/.test(value));assert.notEqual(value,'༠༠༠༠');assert(value.length<=32);}
 }
 for(const byte of [139,155,8250])assert(!Object.hasOwn(T[family+'Skt4'],byte));
 assert.equal(T[family+'Skt3'][128],'');assert.equal(C.chart(family+'Skt3',T)[128-32].text,null);
}
for(const name of ['TibetanClassicSkt5','TibetanChogyalSkt5','TibetanCalligraphic','tibetanclassic'])assert(!Object.hasOwn(T,name));
assert.notEqual(T.TibetanClassicSkt2[84],T.TibetanChogyalSkt2[84]);
for(const [name,byte,text] of cases){
 assert.equal(P.decodeStream(Uint8Array.of(byte),{0:name},T).ev[0].s,text);assert.equal(Pdf.convert(String.fromCharCode(byte),T[name]),text);assert.equal(C.chart(name,T)[byte-32].text,text);
}
const imported=R.read(rtf(),E,T);assert(imported.warnings.some(w=>w.includes('comparison with the original fonts')));assert.equal(visible(imported.doc.text),expected);
const tibetan=E.parseStream(imported.doc.text,false).filter(r=>r.k==='text'&&/[\u0f00-\u0fff]/.test(r.s));assert(tibetan.every(r=>r.style.font==='jomolhari'&&r.style.size===24&&r.style.bold&&r.style.color==='#b03020'));
// Aliases also participate in the lexical legacy-font decision before DBCS parsing.
for(const name of ['TibetanClassic','TibetanChogyalSkt1']){
 const input='{\\rtf1{\\fonttbl{\\f0\\fcharset128\\cpg932 '+name+';}}\\f0 '+String.fromCharCode(224)+"\\'41}";
 const result=R.read(input,E,T);assert.equal(visible(result.doc.text),T[name][224]+T[name][65]);assert(result.warnings.some(w=>w.includes('comparison with the original fonts')));
}
const unknown=R.read('{\\rtf1{\\fonttbl{\\f0 TibetanClassicSkt4;}}'+"\\'8b}",E,T);assert.equal(visible(unknown.doc.text),'�');assert(unknown.warnings.some(w=>w.includes('could not be mapped')));assert(!Object.hasOwn(T['TibetanClassicSkt4'],139));
const filtered=P.decodeStream(Uint8Array.of(33,139,128),{0:'TibetanClassicSkt4'},T);
assert.equal(filtered.ev.filter(e=>e.t==='text').map(e=>e.s).join(''),'༊');assert.equal(Object.keys(filtered.unknown).length,1);
const empty=R.read('{\\rtf1{\\fonttbl{\\f0 TibetanClassicSkt4;}}'+"\\'80}",E,T);assert.equal(visible(empty.doc.text),'');assert(!empty.warnings.some(w=>w.includes('could not be mapped')));
const base=E.defaultDoc();base.text='KEEP';const snapshot=JSON.stringify(base);
for(const ext of ['pxp','pxc','pxa']){
 const bytes=sample(ext),before=Buffer.from(bytes),out=P.load(bytes,ext,T,base,E);assert.equal(out.unknown,0);assert(out.warnings.some(w=>w.includes('comparison with the original fonts')));assert(!out.warnings.some(w=>w.includes('could not be converted')));assert.deepEqual(bytes,before);
 assert.equal(visible(out.doc.text),ext==='pxa'?'KEEP':expected);assert.equal(visible(out.doc.notes.sets['body.front'].inL.text),'༄༅');assert.equal(visible(out.doc.folio.rhino),'༄༅');
 if(ext!=='pxa')assert.equal(visible(out.doc.yigo.text),'༄༅');
}
assert.equal(JSON.stringify(base),snapshot);assert.equal(visible(R.insert(rtf(),base,base.text,0,4,E,T,F).text),expected);
for(const kind of ['note','phrase','yigo'])assert.equal(visible(R.insertMark(rtf(),{text:'OLD',rich:false},0,3,E,T,F,kind).text),expected);
assert.equal(visible(D.normalize(D.artifact(imported.doc,'document'),E).text),expected);assert.equal(visible(R.read(R.write(imported.doc,E),E,T).doc.text),expected);
const importedSnapshot=JSON.stringify(imported.doc);
assert.throws(()=>P.writeContent(imported.doc,E,T),/cannot encode U\+FC0/);
assert.equal(JSON.stringify(imported.doc),importedSnapshot);
console.log('PASS: distinct Classic/Chogyal maps and aliases, exact glyph cases, filtered unknown/empty slots, native body/mark scopes, RTF typography and raw-byte precedence, PDF/charts, paste/Save/RTF and source isolation');
