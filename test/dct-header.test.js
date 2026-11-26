const assert=require('node:assert/strict');
global.PechaImages=require('../src/images');global.Folio=require('../src/folio');
const Engine=require('../src/engine'),Dct=require('../src/dct'),TABLE=require('../src/legacy-table'),Documents=require('../src/documents'),{fixture,modern}=require('./dct-header-fixture');
const read=(bytes,base,options)=>Dct.read(bytes,Engine,TABLE,base,options);
const plain=doc=>Engine.parseStream(doc.text,false).filter(r=>r.k==='text').map(r=>r.s).join('');
const expected=read(modern);
for(const version of [4,5])for(const nul of [false,true])for(const eol of ['\n','\r\n'])for(const count of [5,6]) {
 const bytes=fixture({header:` +1\t-2 TibetD +0${version} `,settings:[1,5,2501751258070,9,0,...(count===6?[0]:[])].join(' \t')+' TibetanAnsi\t12\tTimes New Roman',nul,eol});
 const snapshot=Buffer.from(bytes),result=read(bytes);
 assert.equal(result.doc.text,expected.doc.text);assert.equal(result.unknown,0);assert.deepEqual(bytes,snapshot);
 assert(result.warnings.some(w=>w.includes(`numeric TibetDoc version ${version}`)));
}
for(const settings of ['1 2 3 4 5 Ansi','1\t2\t3\t4\t5\t6\tAnsi',' +1 -2 3 4 5 Ansi  ']) {
 assert.equal(plain(read(fixture({settings,body:[65,17,33,66]})).doc),'AཀB');
}
assert.equal(read(fixture({header:'PKTC\x01\x1a\x05TibetDoc'})).doc.text,expected.doc.text,'PKTC five-field settings');
// Versions 4/5 must bypass the old-font byte corrections, including base byte45.
for(const version of [4,5]) {
 const doc=read(fixture({header:`1 2 TibetD ${version}`,body:[45,17,45,18,45,16,45,33]})).doc;
 assert.equal(plain(doc),'་་'+TABLE.TibetanMachineSkt1[45]+'-ཀ');
}
for(const header of ['1 2 TibetD 1','1 2 TibetD 6','1 2 TibetD 0','1 2 TibetD -4','1 2 TibetD 4.0','1 2 TibetD 4 extra','1 x TibetD 4','1 2 TibetDoc 4','PKTC\x01\x1a\x04TibetDoc','1 2 TibetD 4294967300'])assert.throws(()=>read(fixture({header})));
for(const settings of ['1 2 3 4 Ansi','1 2 3 4 5 6 7 Ansi','1 2 3 x 5 Ansi','1 2 3 4 5 UTF8','1 2 3 4 5 AnsiBad','1 2 3 4 5 TibetanAnsiBad','1 2 3 4 5.0 Ansi','1 2 3 4 5 Ansi trailing'])assert.throws(()=>read(fixture({settings})));
for(const bytes of [Buffer.from('1 2 TibetD 4\n'),fixture({body:[17]}),fixture({body:[33,10,...Buffer.from('2\t!\tmore')]}),fixture({header:'1'.repeat(65537)+' 2 TibetD 4'})])assert.throws(()=>read(bytes));
const base=Engine.defaultDoc();base.text='Prior';base.sections=[{text:'old'}];base.flow=true;base.textSize=70;base.notes.sets['body.front'].inL.text='Retained';base.paper.width=12;
const before=JSON.stringify(base),result=read(fixture(),base,{tibetanSize:40,latinSize:24});
assert.equal(JSON.stringify(base),before);assert.equal(result.doc.paper.width,12);assert.equal(result.doc.notes.sets['body.front'].inL.text,'Retained');
assert.deepEqual(result.doc.sections,[]);assert.equal(result.doc.flow,false);assert.equal(result.doc.textSize,null);assert.equal(result.doc.types.body.fontSize,30);
assert.equal(Documents.normalize(Documents.artifact(result.doc,'document'),Engine).text,result.doc.text);
console.log('PASS: synthetic numeric TibetDoc4/5 and PKTC5 headers, five/six fields, whitespace/signs/large metadata, existing glyph path, bounds/rejection, source isolation, receiving layout/notes, settings and Save');
