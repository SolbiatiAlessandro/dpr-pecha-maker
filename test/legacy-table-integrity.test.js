const assert=require('node:assert/strict');
global.PechaImages=require('../src/images');global.Folio=require('../src/folio');
const T=require('../src/legacy-table'),E=require('../src/engine'),R=require('../src/rtf'),P=require('../src/pxp'),Pdf=require('../src/pdfread'),D=require('../src/documents'),F=require('../src/text-format'),{cases,rtf,sample}=require('./legacy-table-integrity-fixture');
const visible=text=>E.parseStream(text,false).filter(r=>r.k==='text').map(r=>r.s).join('').replace(/\u2028/g,'\n');
// A mapping is one glyph's text, never serialized rows or an entire text file.
for(const [name,map] of Object.entries(T))for(const [key,value] of Object.entries(map)){
 assert.equal(typeof value,'string');assert(!/[\r\n]/.test(value),`${name}:${key} contains source lines`);
 assert(value.length<40,`${name}:${key} is not a bounded glyph mapping`);
}
for(const [name,left,right] of cases){
 assert(!Object.hasOwn(T[name],34));assert.equal(T[name][33],left);assert.equal(T[name][35],right);
 const decoded=P.decodeStream(Uint8Array.from([33,34,35]),{0:name},T);
 assert.equal(decoded.ev.filter(e=>e.t==='text').map(e=>e.s).join(''),left+right);assert.equal(decoded.unknown[name+':34'],1);
 assert.equal(Pdf.convert('!"#',T[name]),left+right);
 assert.equal(Pdf.convert(left+'"'+right,T[name]),left+'"'+right,'already Unicode PDF content is not converted');
}
for(const c of 'abcdefg')for(const suffix of ['1','3'])assert.equal(T['Ededris-'+c+suffix][34],'','existing empty mappings remain unchanged');
const expected=cases.map(([,a,b])=>a+'�'+b).join('\n'),source=rtf(),got=R.read(source,E,T);
assert.equal(visible(got.doc.text),expected);assert(got.warnings.some(w=>w.includes('could not be mapped')));
assert.equal(visible(D.normalize(D.artifact(got.doc,'document'),E).text),expected);
assert.equal(visible(R.read(R.write(got.doc,E),E,T).doc.text),expected);
const current=E.defaultDoc();current.text='OLD';const snapshot=JSON.stringify(current);
assert.equal(visible(R.insert(source,current,current.text,0,3,E,T,F).text),expected);assert.equal(JSON.stringify(current),snapshot);
for(const kind of ['note','phrase','yigo'])assert(visible(R.insertMark(source,{text:'OLD',rich:false},0,3,E,T,F,kind).text).includes('ཀ�ཁ'));
for(const extension of ['pxp','pxc','pxa']){
 const bytes=sample(extension,true),before=Buffer.from(bytes),out=P.load(bytes,extension,T,current,E);
 assert.equal(out.unknown,extension==='pxa'?0:14);assert(out.warnings.some(w=>w.includes('annotation or yi-go characters could not be converted')));assert.deepEqual(bytes,before);assert.equal(JSON.stringify(current),snapshot);
 if(extension!=='pxa')assert.equal(visible(out.doc.text),cases.map(([,a,b])=>a+b).join('\n'));
 assert(!JSON.stringify(out.doc).includes('Ededris-a,35'));assert(!out.doc.text.includes('Ededris-'));
}
console.log('PASS: bounded table integrity, all 14 corrupt slots unresolved/reported, adjacent glyphs intact, native body/marks/scope, RTF file/paste/Save/export and PDF conversion without source-text expansion');
