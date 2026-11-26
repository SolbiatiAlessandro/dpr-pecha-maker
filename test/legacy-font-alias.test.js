const assert=require('node:assert/strict');
global.PechaImages=require('../src/images');global.Folio=require('../src/folio');
const T=require('../src/legacy-table'),E=require('../src/engine'),R=require('../src/rtf'),P=require('../src/pxp'),Pdf=require('../src/pdfread'),D=require('../src/documents'),F=require('../src/text-format'),C=require('../src/legacy-characters'),{cases,expected,rtf,sample}=require('./legacy-font-alias-fixture');
const visible=text=>E.parseStream(text,false).filter(r=>r.k==='text').map(r=>r.s).join('');
const aliases={Sama:'Esama',Samb:'Esamb',Samc:'Esamc','Dedris-syma':'Ededris-sym','Ededris-syma':'Ededris-sym'};
for(const c of 'abcdefg')for(const s of ['',1,2,3])aliases['Dedris-'+c+s]='Ededris-'+c+s;
aliases['Dedris-sym']='Ededris-sym';aliases['Dedris-vowa']='Ededris-vowa';
assert.equal(Object.keys(aliases).length,35);
for(const [name,target] of Object.entries(aliases)){
 assert(Object.hasOwn(T,name));assert.equal(T[name],T[target]);assert.equal(Pdf.tableFor(name,T).map,T[target]);
 const chart=C.chart(name,T);assert.deepEqual(chart.map(s=>s.text),C.chart(target,T).map(s=>s.text));
}
for(const name of ['Dedris-unknown','dedris-a','Drutsa-a','Khamdris-a','Sama Extra','SamaNormal','Arial'])assert(!Object.hasOwn(T,name));
for(const [name,byte,text] of cases){
 assert.equal(P.decodeStream(Uint8Array.of(byte),{0:name},T).ev[0].s,text);assert.equal(Pdf.convert(String.fromCharCode(byte),T[name]),text);assert.equal(C.chart(name,T)[byte-32].text,text);
}
const imported=R.read(rtf(),E,T);assert.deepEqual(imported.warnings,[]);assert.equal(visible(imported.doc.text),expected);
const tibetan=E.parseStream(imported.doc.text,false).filter(r=>r.k==='text'&&/[\u0f00-\u0fff]/.test(r.s));assert(tibetan.every(r=>r.style.font==='jomolhari'&&r.style.size===24&&r.style.bold&&r.style.color==='#b03020'));
// Aliases also participate in the lexical legacy-font decision before DBCS parsing.
for(const name of ['Sama','Samb','Samc']){
 const input='{\\rtf1{\\fonttbl{\\f0\\fcharset128\\cpg932 '+name+';}}\\f0 '+String.fromCharCode(224)+"\\'41}";
 const result=R.read(input,E,T);assert.equal(visible(result.doc.text),T[name][224]+T[name][65]);assert.deepEqual(result.warnings,[]);
}
const unknown=R.read('{\\rtf1{\\fonttbl{\\f0 Dedris-a;}}'+"\\'22}",E,T);assert.equal(visible(unknown.doc.text),'�');assert(unknown.warnings.some(w=>w.includes('could not be mapped')));assert(!Object.hasOwn(T['Dedris-a'],34));
const base=E.defaultDoc();base.text='KEEP';const snapshot=JSON.stringify(base);
for(const ext of ['pxp','pxc','pxa']){
 const bytes=sample(ext),before=Buffer.from(bytes),out=P.load(bytes,ext,T,base,E);assert.equal(out.unknown,0);assert(!out.warnings.some(w=>w.includes('could not be converted')));assert.deepEqual(bytes,before);
 assert.equal(visible(out.doc.text),ext==='pxa'?'KEEP':expected);assert.equal(visible(out.doc.notes.sets['body.front'].inL.text),'ཀ');assert.equal(visible(out.doc.folio.rhino),'ཀ');
 if(ext!=='pxa')assert.equal(visible(out.doc.yigo.text),'ཀ');
}
assert.equal(JSON.stringify(base),snapshot);assert.equal(visible(R.insert(rtf(),base,base.text,0,4,E,T,F).text),expected);
for(const kind of ['note','phrase','yigo'])assert.equal(visible(R.insertMark(rtf(),{text:'OLD',rich:false},0,3,E,T,F,kind).text),expected);
assert.equal(visible(D.normalize(D.artifact(imported.doc,'document'),E).text),expected);assert.equal(visible(R.read(R.write(imported.doc,E),E,T).doc.text),expected);
const importedSnapshot=JSON.stringify(imported.doc);assert.throws(()=>P.writeContent(imported.doc,E,T),/cannot encode U\+F6A/);assert.equal(JSON.stringify(imported.doc),importedSnapshot);
console.log('PASS: all35 bounded aliases share corrected maps, 13 exact glyphs, native body/marks/scopes and PDF/chart agreement, RTF legacy font/size and DBCS precedence, unresolved-slot warning, paste/Save/RTF and source isolation');
