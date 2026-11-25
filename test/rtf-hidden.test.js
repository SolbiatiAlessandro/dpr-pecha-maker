const assert=require('node:assert/strict');
global.PechaImages=require('../src/images');global.Folio=require('../src/folio');
const E=require('../src/engine'),R=require('../src/rtf'),T=require('../src/legacy-table'),F=require('../src/text-format'),D=require('../src/documents'),{picture}=require('./rtf-picture-fixture'),{fixture,expected,hiddenPicture}=require('./rtf-hidden-fixture');
const runs=text=>E.parseStream(text,false).filter(r=>r.k==='text'),plain=text=>runs(text).map(r=>r.s).join('');
const source=fixture(),got=R.read(source,E,T),d=got.doc;assert.equal(plain(d.text),expected);assert(!d.text.includes('HIDDEN'));assert(!d.text.includes('{page}'));assert.equal(d.assets.length,1);assert.equal(d.images.length,1);assert.equal(got.warnings.filter(w=>w.includes('Hidden RTF')).length,1);
assert(runs(d.text).some(r=>r.s==='Visible'&&r.style.bold&&r.style.color==='#b03020'));assert(runs(d.text).some(r=>r.s==='Shown'&&r.style.italic&&!r.style.bold));assert(!runs(d.text).at(-1).style.italic);
for(const [input,expected] of [
 ['A\\v hide\\v0 B','AB'],
 ['A{\\v hide{\\v0 B}hide}C','ABC'],
 ['A\\v hide\\plain B','AB'],
 ['A\\v hide\\pard stillHidden\\v0 B','AB'],
 ['A{\\v\\uc1\\u3904\\v0 stillHidden}B','AB'],
 ['A{\\v\\uc2\\u-10179?\\u-8704??}B','AB'],
 ['A{\\v\\b hide}B','AB'],
 ['A\\v\\b hide\\v0 B','AB'],
 ['A{\\webhidden B}C','ABC'],
 ['A{\\v{\\upr{hidden}{\\*\\ud\\u3904?}}}B','AB'],
 ['A{\\v \\{hide\\}\\~\\_\\line\\tab\\page}B','AB']
])assert.equal(plain(R.read('{\\rtf1 '+input+'}',E,T).doc.text),expected,input);
assert(runs(R.read('{\\rtf1 A\\v\\b hidden\\v0 B}',E,T).doc.text).at(-1).style.bold);
const allHidden='{\\rtf1\\v HIDDEN\\page'+hiddenPicture()+'}',empty=R.read(allHidden,E,T);assert.equal(empty.doc.text,'');assert.equal(empty.doc.assets.length,0);assert.equal(empty.doc.images.length,0);assert(empty.warnings.some(w=>w.includes('Hidden RTF')));
const base=E.defaultDoc();base.text='{font:noto 21 b}Before OLD After';const original=JSON.stringify(base),at=base.text.indexOf('OLD');
const pasted=R.insert(source,base,base.text,at,at+3,E,T,F);assert.equal(plain(pasted.text),'Before '+expected+' After');assert.equal(JSON.stringify(base),original);assert.equal(pasted.assets.length,1);assert.equal(runs(pasted.text).at(-1).style.size,21);
assert(R.insert(allHidden,base,base.text,at,at+3,E,T,F).empty);assert(R.insertNote(allHidden,{text:'Keep',rich:false},0,4,E,T,F).empty);
const note=R.insertNote(source,{text:'OLD',rich:false},0,3,E,T,F);assert.equal(plain(note.text),expected);assert(!note.text.includes('image:'));
assert.equal(D.normalize(D.artifact(d,'document'),E).text,d.text);assert.equal(plain(R.read(R.write(d,E),E,T).doc.text),expected);assert(!R.write(d,E).includes('HIDDEN'));
// A hidden picture does not remove an existing retained yi-go image.
const image=R.read('{\\rtf1 '+picture()+'}',E,T).doc;image.images[0].kind='yigo';image.yigo.image=image.images[0].id;const prior=JSON.stringify(image),retained=R.read(allHidden,E,T,image).doc;assert.equal(retained.images.length,1);assert.equal(retained.yigo.image,image.yigo.image);assert.equal(JSON.stringify(image),prior);
console.log('PASS: hidden RTF text/pictures/breaks omitted, group/explicit/plain resets, formatting and Unicode fallback, web-only hiding distinction, paste retention, marks, assets, source isolation and Save/RTF');
