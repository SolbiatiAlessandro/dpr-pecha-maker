const assert=require('node:assert/strict');
global.PechaImages=require('../src/images');global.Folio=require('../src/folio');
const E=require('../src/engine'),R=require('../src/rtf'),F=require('../src/text-format'),T=require('../src/legacy-table'),{picture}=require('./rtf-picture-fixture');
const text='Before {commentary font:family:Courier%20New 24 b i u s #b03020 r}CUT{heading font:noto 16 /b /i /u /s #123456 l}After';
const d=E.defaultDoc();d.text=text;const start=text.indexOf('font:')+2,end=text.indexOf('After'),clip=R.copySelection(d,text,start,end,E,F),cut=F.removeRich(text,clip.start,clip.end,E);
assert.equal(clip.plain,'CUT');assert.equal(cut.start,text.indexOf('{'));assert.equal(cut.end,end);assert.equal(cut.cursor,cut.start);assert.equal(cut.text,text.slice(0,cut.start)+cut.replacement+text.slice(end));
const before=E.parseStream(text,false).filter(r=>r.k==='text'),after=E.parseStream(cut.text,false).filter(r=>r.k==='text');assert.equal(after.map(r=>r.s).join(''),'Before After');assert.deepEqual(after[0].style,before[0].style);assert.deepEqual(after.at(-1).style,before.at(-1).style);
const decoded=E.parseStream(R.read(clip.rtf,E,T).doc.text,false).filter(r=>r.k==='text');assert.equal(decoded.map(r=>r.s).join(''),'CUT');assert.equal(decoded[0].style.font,'family:Courier%20New');assert.equal(decoded[0].style.size,24);assert(decoded[0].style.bold&&decoded[0].style.italic&&decoded[0].style.underline&&decoded[0].style.strike);
// Typing after the cut uses preceding style while the following run keeps its own attributes.
const typed=cut.text.slice(0,cut.cursor)+'X'+cut.text.slice(cut.cursor),typedRuns=E.parseStream(typed,false).filter(r=>r.k==='text');assert.equal(typedRuns[0].s,'Before X');assert.deepEqual(typedRuns.at(-1).style,before.at(-1).style);
const plain=F.removeRich('A CUT B',2,6,E);assert.equal(plain.text,'A B');assert.equal(plain.replacement,'');
assert.equal(F.removeRich(text,0,text.length,E).text,'');assert.equal(F.removeRich(text,end,text.length,E).replacement,'');assert.equal(F.removeRich(text,4,4,E).text,text);
const unicode='{font:noto 20}ཀི་😀{lc}x{rc}{hs}';const n=unicode.indexOf('ཀ');assert.equal(R.copySelection(d,unicode,n,unicode.length,E,F).plain,'ཀི་😀{x}།');assert.equal(F.removeRich(unicode,n,unicode.length,E).text,unicode.slice(0,n));
const measure=(s,f)=>s.length*f.size*.4;measure.head=(d,size)=>({ascent:size*.5,descent:size*.25,height:size*.75});
const page=E.defaultDoc();page.counts={title:0,fancy:0};page.text='A{page}B';assert.equal(E.run(page,measure).pages.length,2);page.text=F.removeRich(page.text,1,7,E).text;assert.equal(page.text,'AB');assert.equal(E.run(page,measure).pages.length,1);
const images=R.read('{\\rtf1 A'+picture()+'B}',E,T).doc,token=images.text.match(/\{image:[^}]+\}/)[0],at=images.text.indexOf(token),snapshot=JSON.stringify(images);
const imageClip=R.copySelection(images,images.text,at,at+token.length,E,F),removed=F.removeRich(images.text,at,at+token.length,E);assert.equal(imageClip.plain,'\uFFFC');assert(!removed.text.includes('image:'));assert.equal(JSON.stringify(images),snapshot);
const moved=R.insert(imageClip.rtf,images,removed.text,removed.text.length,removed.text.length,E,T,F);assert.equal(moved.assets.length,1);assert.equal(moved.images.length,2,'retain original placement for browser undo');assert.equal((moved.text.match(/\{image:/g)||[]).length,1);assert.notEqual(moved.images[0].id,moved.images[1].id);
console.log('PASS: formatted Cut payload, atomic boundaries, surrounding role/font/style restoration, caret inheritance, plain/all/tail/empty ranges, Unicode, page removal and image move with undo resources');
