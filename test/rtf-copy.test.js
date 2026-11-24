const assert=require('node:assert/strict');
global.PechaImages=require('../src/images');global.Folio=require('../src/folio');
const E=require('../src/engine'),R=require('../src/rtf'),F=require('../src/text-format'),T=require('../src/legacy-table'),{picture}=require('./rtf-picture-fixture');
const d=E.defaultDoc();d.roles.commentary={font:'Courier New',size:27,bold:true};d.text='{commentary i u s #b03020 r}Before ཀ་Red{font:family:Arial 18 /b /i /u /s #123456}Blue After';
d.sections=[{name:'Excluded',text:'OTHER SECTION',folioStart:1,restartLayout:true}];d.notes.sets['body.front'].inL=E.noteSlot('EXCLUDED NOTE');
const snapshot=JSON.stringify(d),start=d.text.indexOf('ཀ་Red'),end=d.text.indexOf(' After'),copy=R.copySelection(d,d.text,start,end,E,F);
assert.equal(copy.plain,'ཀ་RedBlue');assert.equal(JSON.stringify(d),snapshot);assert(!copy.rtf.includes('Before'));assert(!copy.rtf.includes('After'));assert(!copy.rtf.includes('OTHER SECTION'));assert(!copy.rtf.includes('EXCLUDED NOTE'));
const decoded=R.read(copy.rtf,E,T).doc,runs=E.parseStream(decoded.text,false).filter(r=>r.k==='text');assert.equal(runs.map(r=>r.s).join(''),copy.plain);
const red=runs.find(r=>r.s.includes('Red')).style,blue=runs.find(r=>r.s==='Blue').style;
assert.equal(red.font,'family:Courier%20New');assert.equal(red.size,27);assert(red.bold&&red.italic&&red.underline&&red.strike);assert.equal(red.color,'#b03020');assert.equal(red.align,'r');assert.equal(blue.font,'family:Arial');assert.equal(blue.size,18);assert(!blue.bold&&!blue.italic&&!blue.underline&&!blue.strike);assert.equal(blue.color,'#123456');
const over=R.read(R.copySelection({...d,textSize:35},d.text,start,end,E,F).rtf,E,T).doc;assert(E.parseStream(over.text,false).filter(r=>r.k==='text').every(r=>r.style.size===35));
assert(R.copySelection(d,d.text,start,start,E,F).empty);assert(R.copySelection(d,d.text,1,9,E,F).empty);
const boundary=R.copySelection(d,d.text,3,start+2,E,F);assert.equal(boundary.start,0);assert.equal(boundary.plain,'Before ཀ་');
const chars='{lc}x{rc}{hs}\nNext{page}Last';const special=R.copySelection(d,chars,0,chars.length,E,F);assert.equal(special.plain,'{x}།\nNext\fLast');const specialDoc=R.read(special.rtf,E,T).doc;assert(specialDoc.text.includes('{page}'));assert(specialDoc.text.includes('{lc}'));
// Only selected inline placements are serialized. Fixed-page/automatic images and other sections stay out.
const images=R.read('{\\rtf1 A'+picture()+'B'+picture()+'C}',E,T).doc,token=images.text.match(/\{image:[^}]+\}/)[0],at=images.text.indexOf(token);
const imageCopy=R.copySelection(images,images.text,at,at+token.length,E,F);assert.equal(imageCopy.plain,'\uFFFC');assert.equal((imageCopy.rtf.match(/\\pngblip/g)||[]).length,1);const imported=R.read(imageCopy.rtf,E,T).doc;assert.equal(imported.images.length,1);assert.equal(imported.assets[0].data,images.assets[0].data);
assert(R.copySelection(d,'{image:missing}',0,15,E,F).empty);
// Copying selected body text supplies formatted source for each automatic-mark paste workflow.
for(const kind of ['note','phrase','yigo']){const result=R.insertMark(copy.rtf,{text:'OLD',rich:false},0,3,E,T,F,kind);const parsed=E.parseStream(result.text,false).filter(r=>r.k==='text');assert.equal(parsed.map(r=>r.s).join(''),copy.plain);assert(parsed.every(r=>r.style.size===null));assert.equal(parsed.find(r=>r.s.includes('Red')).style.font,'family:Courier%20New');}
console.log('PASS: selection-only RTF/plain copy, inherited role/font/style/colour, global size, Unicode/literal braces/hard shad/breaks, token boundaries, inline-image scope and body-to-mark roundtrip');
