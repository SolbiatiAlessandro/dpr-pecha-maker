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
const unsupported=Dct.read(wrap([21,128,22,66,16,0]),Engine,TABLE);assert.equal(unsupported.unknown,3);assert.equal(plain(unsupported.doc),'���');
assert.equal(plain(Dct.read(wrap([33,25,98,27,49,33]),Engine,TABLE).doc),'ཀཀ');
for(const bytes of [wrap([17]),wrap([25]),wrap([27]),wrap([24]),wrap([0]),Buffer.from('1 2 TibetD 3\n'),wrap([33],'UTF8'),Buffer.concat([wrap([33]),Buffer.from('\r\n2\t!\tA')]),new Uint8Array(4000001)])assert.throws(()=>Dct.read(bytes,Engine,TABLE));
assert.equal(plain(Dct.read(publicFile.subarray(1),Engine,TABLE).doc).trim(),expected,'optional leading NUL');
const current=Engine.defaultDoc();current.text='old';current.notes.sets['body.front'].inL.text='keep';current.yigo.text='༄༅།';current.sections=[{text:'old',name:'old'}];
const imported=Dct.read(publicFile,Engine,TABLE,Documents.newContent(current,Engine)).doc;
assert.equal(imported.notes.sets['body.front'].inL.text,'keep');assert.equal(imported.yigo.text,'༄༅།');assert.deepEqual(imported.sections,[]);assert.equal(current.text,'old');
const roundtrip=Documents.normalize(Documents.artifact(imported,'document'),Engine);assert.equal(roundtrip.text,imported.text);
const m=(s,f)=>s.length*f.size*.4;m.head=()=>({ascent:12,descent:4,height:16});assert(Engine.run(imported,m).pages.length>0);
console.log('PASS: public DCT fixture (documented ornament discrepancy), per-glyph fonts, Latin/tab/page/line controls, warnings, rejection bounds, retention and web save/load');

assert.deepEqual(Dct.importSettings({},Engine),{tibetanSize:28,latinSize:18,latinFont:'family:Times%20New%20Roman',diacriticSize:18,diacriticFont:'serif',remapDiacritics:true});
for(const options of [{tibetanSize:6},{latinSize:4},{latinSize:201},{tibetanSize:NaN},{latinFont:'bad'},{tibetanSize:28.5}])assert.throws(()=>Dct.importSettings(options,Engine));
const notoBase=Engine.defaultDoc();notoBase.fontName='Noto Serif Tibetan';notoBase.font="'Noto Serif Tibetan','Jomolhari',serif";
const chosen=Dct.read(wrap([33,16,65,33]),Engine,TABLE,notoBase,{tibetanSize:40,latinSize:22,latinFont:'jomolhari'}).doc;
const runs=Engine.parseStream(chosen.text,false).filter(r=>r.k==='text');
assert.deepEqual(runs.map(r=>[r.style.font,r.style.size]),[['noto',30],['jomolhari',22],['noto',30]]);
assert(Object.values(chosen.types).every(t=>t.fontSize===30));
assert.equal(Documents.normalize(chosen,Engine).text,chosen.text);
assert.equal(Documents.normalize(chosen,Engine).types.body.fontSize,30);
console.log('PASS: DCT import settings defaults, validation, current Tibetan face, independent Latin font/size and normalized Save');

// Independently stated core diacritic examples, including both native remap modes.
const pairs = [['a','ā'],['A','Ā'],['i','ī'],['I','Ī'],['u','ū'],['U','Ū'],
 ['p','ṛ'],['P','Ṛ'],['q','ṝ'],['Q','Ṝ'],['k','ḷ'],['K','Ḷ'],['l','ḹ'],['L','Ḹ'],
 ['o','ṅ'],['O','Ṅ'],['t','ṭ'],['T','Ṭ'],['d','ḍ'],['D','Ḍ'],['n','ṇ'],['N','Ṇ'],
 ['s','ś'],['S','Ś'],['r','ṣ'],['R','Ṣ'],['m','ṃ'],['M','Ṃ'],['h','ḥ'],['H','Ḥ'],['Ñ','Ñ']];
for(const [source,unicode] of pairs) {
 const result=Dct.read(wrap([21,source.charCodeAt(0),16,65,33]),Engine,TABLE);
 assert.equal(plain(result.doc),unicode+'Aཀ');assert.equal(result.unknown,0);
}
const csxBytes=[164,165,224,225,226,227,228,229,230,231,232,233,234,235,236,237,238,239,240,241,242,243,244,245,246,247,248,249,250,251,252,253,254,255];
assert.equal(plain(Dct.read(wrap(csxBytes.flatMap(b=>[21,b])),Engine,TABLE,null,{remapDiacritics:false}).doc),'ñÑāßĀīĪūŪṛṚṝṜḷḶḹḸṅṄṭṬḍḌṇṆśŚṣṢ”ṃṂḥḤ');
assert.equal(plain(Dct.read(wrap([21,97,21,98,21,123,21,125]),Engine,TABLE,null,{remapDiacritics:false}).doc),'ab{}');
const mixed=Dct.read(wrap([16,65,21,97,33,21,128,22,65]),Engine,TABLE,null,{diacriticFont:'noto',diacriticSize:24});
assert.equal(plain(mixed.doc),'Aāཀ��');assert.equal(mixed.unknown,2);
const mixedRuns=Engine.parseStream(mixed.doc.text,false).filter(r=>r.k==='text');
assert.deepEqual(mixedRuns.map(r=>[r.style.font,r.style.size]),[['family:Times%20New%20Roman',18],['noto',24],['jomolhari',21],['noto',24],['family:Times%20New%20Roman',18]]);
assert(mixed.warnings.some(w=>w.includes('Extended CSX+')));
for(const options of [{diacriticSize:0},{diacriticSize:201},{diacriticSize:18.5},{diacriticFont:'legacy'},{remapDiacritics:'true'}])assert.throws(()=>Dct.importSettings(options,Engine));
assert.equal(Dct.importSettings({tibetanSize:40,latinFont:'noto',latinSize:22},Engine).diacriticSize,18,'previous saved preferences migrate');
assert.throws(()=>Dct.read(wrap([21]),Engine,TABLE));
assert.equal(Documents.normalize(Documents.artifact(mixed.doc,'document'),Engine).text,mixed.doc.text);
console.log('PASS: all 31 DCT diacritic remaps, 34 core CSX+ bytes, raw mode, one-glyph scope, independent style, unsupported counts, migration and Save');
