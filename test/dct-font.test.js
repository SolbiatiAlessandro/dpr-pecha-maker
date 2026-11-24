const assert=require('node:assert/strict');
global.PechaImages=require('../src/images');global.Folio=require('../src/folio');
const E=require('../src/engine'),Dct=require('../src/dct'),D=require('../src/documents'),R=require('../src/rtf'),T=require('../src/legacy-table'),{wrap}=require('./dct-alignment-fixture');
const bytes=wrap([65,21,97,17,33,66,21,115],'Ansi');
assert.equal(Dct.importSettings({},E).latinFont,'family:Times%20New%20Roman');
assert.equal(Dct.importSettings({latinFont:'serif'},E).latinFont,'serif','saved substitute preference is preserved');
for(const [latin,diacritic] of [['Courier New','Arial'],['O\'Brien "Display", Serif','སྐད་ཡིག']]) {
 const options={latinFont:E.fontToken(latin),diacriticFont:E.fontToken(diacritic),latinSize:22,diacriticSize:26};
 assert.deepEqual(Dct.importSettings(options,E),Dct.importSettings(JSON.parse(JSON.stringify(options)),E));
 const d=Dct.read(bytes,E,T,null,options).doc,runs=E.parseStream(d.text,false).filter(r=>r.k==='text');
 assert.deepEqual(runs.map(r=>r.s),['A','ā','ཀ','B','ś']);
 assert.deepEqual(runs.map(r=>[r.style.font,r.style.size]),[[options.latinFont,22],[options.diacriticFont,26],['jomolhari',21],[options.latinFont,22],[options.diacriticFont,26]]);
 assert.equal(D.normalize(d,E).text,d.text);
 const back=R.read(R.write(d,E),E,T).doc;assert.deepEqual(E.parseStream(back.text,false).filter(r=>r.k==='text').map(r=>r.style.font),runs.map(r=>r.style.font));
}
for(const token of ['custom','family:','family:%','family:bad%3Bfont','family:a%0Ab','family:'+('x'.repeat(129)),null,{}])for(const key of ['latinFont','diacriticFont'])assert.throws(()=>Dct.importSettings({[key]:token},E));
console.log('PASS: independent named DCT fonts, native Latin default, previous preferences, one-glyph restoration, sizes, invalid tokens, Unicode/quoted names, Save and RTF');
