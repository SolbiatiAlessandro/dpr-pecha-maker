const assert=require('node:assert/strict'),fs=require('node:fs');
global.PechaImages=require('../src/images');global.Folio=require('../src/folio');
const Engine=require('../src/engine'),Dct=require('../src/dct'),TABLE=require('../src/legacy-table'),Documents=require('../src/documents');
const wrap=(body,encoding='TibetanAnsi')=>Buffer.concat([Buffer.from(`\0PKTC\x01\x1a\x05TibetDoc\r\n1\t5\t12345\t9\t0\t0\t${encoding}\r\nhdr\t0\r\n1\t!\t`,'latin1'),Buffer.from(body)]);
const plain=doc=>Engine.parseStream(doc.text,false).map(r=>r.k==='text'?r.s:r.k==='page'?'[PAGE]':'').join('').replace(/\u2028/g,'\n');
const publicFile=fs.readFileSync(__dirname+'/fixtures/dct/modern-public.dct');
const result=Dct.read(publicFile,Engine,TABLE);
const expected='༆༅། །གྲུབ་ཐོབ་བརྒྱད་ཅུ་རྩ་བཞིའི་ལོ་རྒྱུས་སློབ་དཔོན་མི་འཇིགས་པ་སྦྱིན་པ་དཔལ་གྱིས་མཛད་པ་བཞུགས་སོ། །';
assert.equal(plain(result.doc).trim(),expected);assert.equal(result.unknown,0);
assert(result.warnings.some(w=>w.includes('ornament')));assert(result.warnings.some(w=>w.includes('formatting control')));
// Reference converter starts with U+0F04; existing native-font mapping uses U+0F06.
// This intentional fixture expectation records the known unresolved discrepancy.
assert.equal(plain(result.doc).trim().codePointAt(0),0x0f06);
for(const [marker,slot] of [[17,0],[18,1],[19,2],[20,3],[23,4]]) {
 const table=TABLE[slot?'TibetanMachineSkt'+slot:'TibetanMachine'];
 const [byte,glyph]=Object.entries(table).find(([b,t])=>+b>=32&&t&&!/[{}]/.test(t));
 const doc=Dct.read(wrap([marker,+byte,16,65,33]),Engine,TABLE).doc;
 assert.equal(plain(doc),glyph+'A'+TABLE.TibetanMachine[33]);
}
assert.equal(plain(Dct.read(wrap([17,33,65],'Ansi'),Engine,TABLE).doc),'ཀA','glyph markers affect only one character');
assert.equal(plain(Dct.read(wrap([65,9,66,11,67,12,68],'Ansi'),Engine,TABLE).doc),'A\tB\nC[PAGE]D');
assert.equal(plain(Dct.read(wrap([123,125],'Ansi'),Engine,TABLE).doc),'{}');
const unsupported=Dct.read(wrap([21,65,22,66,16,0]),Engine,TABLE);assert.equal(unsupported.unknown,3);assert.equal(plain(unsupported.doc),'���');
assert.equal(plain(Dct.read(wrap([33,25,98,27,49,33]),Engine,TABLE).doc),'ཀཀ');
for(const bytes of [wrap([17]),wrap([25]),wrap([27]),wrap([24]),wrap([0]),Buffer.from('1 2 TibetD 3\n'),wrap([33],'UTF8'),Buffer.concat([wrap([33]),Buffer.from('\r\n2\t!\tA')]),new Uint8Array(4000001)])assert.throws(()=>Dct.read(bytes,Engine,TABLE));
assert.equal(plain(Dct.read(publicFile.subarray(1),Engine,TABLE).doc).trim(),expected,'optional leading NUL');
const current=Engine.defaultDoc();current.text='old';current.notes.sets['body.front'].inL.text='keep';current.yigo.text='༄༅།';current.sections=[{text:'old',name:'old'}];
const imported=Dct.read(publicFile,Engine,TABLE,Documents.newContent(current,Engine)).doc;
assert.equal(imported.notes.sets['body.front'].inL.text,'keep');assert.equal(imported.yigo.text,'༄༅།');assert.deepEqual(imported.sections,[]);assert.equal(current.text,'old');
const roundtrip=Documents.normalize(Documents.artifact(imported,'document'),Engine);assert.equal(roundtrip.text,imported.text);
const m=(s,f)=>s.length*f.size*.4;m.head=()=>({ascent:12,descent:4,height:16});assert(Engine.run(imported,m).pages.length>0);
console.log('PASS: public DCT fixture (documented ornament discrepancy), per-glyph fonts, Latin/tab/page/line controls, warnings, rejection bounds, retention and web save/load');
