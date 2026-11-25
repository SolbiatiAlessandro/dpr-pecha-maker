const assert=require('node:assert/strict');
global.PechaImages=require('../src/images');global.Folio=require('../src/folio');
const E=require('../src/engine'),R=require('../src/rtf'),T=require('../src/legacy-table'),F=require('../src/text-format'),D=require('../src/documents'),{picture}=require('./rtf-picture-fixture'),{fixture,expected}=require('./rtf-unicode-fallback-fixture');
const runs=text=>E.parseStream(text,false).filter(r=>r.k==='text'),visible=text=>runs(text).map(r=>r.s).join('');
const fallbacks=[String.raw`\tab `,String.raw`\line `,String.raw`\par `,String.raw`\page `,String.raw`\emdash `,String.raw`\b `,String.raw`\f1 `,String.raw`\fs48 `,String.raw`\cf1 `,String.raw`\uc0 `,String.raw`\unknown99 `,String.raw`\bin3 {\}`,String.raw`\~`,String.raw`\_`,String.raw`\{`,String.raw`\}`,String.raw`\\`,String.raw`\'ff`,'?'];
for(const fallback of fallbacks){
 const input=String.raw`{\rtf1\ansi{\fonttbl{\f0 Arial;}{\f1 Courier New;}}\fs36\u3904`+fallback+'X}';
 const got=R.read(input,E,T);assert.equal(visible(got.doc.text),'ཀX',fallback);assert.deepEqual(got.warnings,[],fallback);
 assert(!got.doc.text.includes('{page}'));for(const run of runs(got.doc.text)){assert.equal(run.style.size,18);assert(!run.style.bold);assert.equal(run.style.font,'family:Arial');}
}
for(const group of [String.raw`{\*\comment ignored}`,String.raw`{\info ignored}`,String.raw`{\*\unknown ignored}`,String.raw`{}`,String.raw`{\upr{ANSI}{\*\ud\uc0\u3905}}`]){
 const got=R.read(String.raw`{\rtf1\u3904`+group+'X}',E,T);assert.equal(visible(got.doc.text),'ཀ'+(group.includes('upr')?'ཁ':'')+'X');
}
// A Unicode branch with an unfinished fallback cannot consume text after its closing brace.
for(const group of [String.raw`{\u3904}`,String.raw`{\upr{ANSI}{\*\ud\u3904}}`,String.raw`{\upr{\u3904}}`])assert.equal(visible(R.read('{\\rtf1'+group+'X}',E,T).doc.text),'ཀX');
const image=R.read(String.raw`{\rtf1\u3904`+picture()+'X}',E,T);assert.equal(visible(image.doc.text),'ཀX');assert.equal(image.doc.images.length,1);
const scoped=R.read(String.raw`{\rtf1\uc1\u3904?{\uc2\u3905\tab ?B}\u3906?C\uc0\u3907D}`,E,T);assert.equal(visible(scoped.doc.text),'ཀཁBགCགྷD');
assert.equal(visible(R.read('{\\rtf1\\u3904\r\n?X}',E,T).doc.text),'ཀX');
for(const n of [0,1,16,32,64]){const got=R.read('{\\rtf1\\uc'+n+'\\u3904'+'?'.repeat(n)+'X}',E,T);assert.equal(visible(got.doc.text),'ཀX');}
const multibyte=R.read(String.raw`{\rtf1\ansicpg932\uc2\u26085\'93\'fa\'96\'7b}`,E,T);assert.equal(visible(multibyte.doc.text),'日本');
const emoji=R.read(String.raw`{\rtf1\uc1\u-10179\tab\u-8704\line X}`,E,T);assert.equal(visible(emoji.doc.text),'😀X');
// Font names obey the same control-token counting without changing charset or fallback length.
for(const fallback of fallbacks){const got=R.read(String.raw`{\rtf1{\fonttbl{\f0\uc1\u26085`+fallback+String.raw`Name;}}X}`,E,T);assert.equal(E.primaryFont(E.fontFamily(runs(got.doc.text)[0].style.font)),'日Name',fallback);}
const d=E.defaultDoc();d.text='OLD';d.notes.sets['body.front'].inL.text='Keep';const snapshot=JSON.stringify(d),out=R.read(fixture,E,T,d);assert.equal(visible(out.doc.text),expected);assert.deepEqual(out.warnings,[]);assert.equal(JSON.stringify(d),snapshot);assert.equal(out.doc.notes.sets['body.front'].inL.text,'Keep');assert.equal(visible(D.normalize(out.doc,E).text),expected);assert.equal(visible(R.read(R.write(out.doc,E),E,T).doc.text),expected);
assert.equal(visible(R.insert(fixture,d,d.text,0,3,E,T,F).text),expected);for(const kind of ['note','phrase','yigo'])assert.equal(visible(R.insertMark(fixture,{text:'OLD',rich:false},0,3,E,T,F,kind).text),expected);
console.log('PASS: Unicode fallback controls/binary/bytes/literals, ignored/image/dual-group boundaries, scoped lengths, surrogate pairs, font names, multibyte bytes, state isolation and Save/RTF/paste roundtrips');
