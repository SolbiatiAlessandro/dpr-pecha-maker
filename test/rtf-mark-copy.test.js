const assert=require('node:assert/strict');
global.PechaImages=require('../src/images');global.Folio=require('../src/folio');
const E=require('../src/engine'),R=require('../src/rtf'),F=require('../src/text-format'),T=require('../src/legacy-table');
const d=E.defaultDoc();d.text='EXCLUDED BODY';d.textSize=80;d.sections=[{name:'Excluded',text:'EXCLUDED SECTION'}];
const slot={text:'{font:family:Arial 88 b i u s #b03020}Before Red{font:family:Courier%20New 6 /b /i /u /s #123456}Blue Tail',rich:true,size:21};
const start=slot.text.indexOf('Red'),end=slot.text.indexOf(' Tail'),snapshot=JSON.stringify({d,slot}),copy=R.copyMark(d,slot,start,end,E,F);
assert.equal(copy.plain,'RedBlue');assert.equal(JSON.stringify({d,slot}),snapshot);assert(!copy.rtf.includes('Before'));assert(!copy.rtf.includes('Tail'));assert(!copy.rtf.includes('EXCLUDED'));
const runs=E.parseStream(R.read(copy.rtf,E,T).doc.text,false).filter(r=>r.k==='text');assert.equal(runs[0].style.font,'family:Arial');assert(runs[0].style.bold&&runs[0].style.italic&&runs[0].style.underline&&runs[0].style.strike);assert.equal(runs[0].style.color,'#b03020');assert.equal(runs[1].style.font,'family:Courier%20New');assert(!runs[1].style.bold);assert.equal(runs[1].style.color,'#123456');assert(runs.every(r=>r.style.size===21));
const plain={text:'Before {b}ཀི་😀{page} end',rich:false,size:17,font:E.fontFamily('noto')},a=plain.text.indexOf('{b}'),b=plain.text.indexOf(' end'),literal=R.copyMark(d,plain,a,b,E,F);
assert.equal(literal.plain,'{b}ཀི་😀{page}');const literalRuns=E.parseStream(R.read(literal.rtf,E,T).doc.text,false).filter(r=>r.k==='text');assert(literalRuns.every(r=>r.style.font==='noto'&&r.style.size===17&&!r.style.bold));
assert(R.copyMark(d,slot,2,9,E,F).empty);assert(R.copyMark(d,slot,start,start,E,F).empty);
const ignored={text:'A{page b}B{image:missing}\nC\tD{lc}page{rc}',rich:true,size:13};const filtered=R.copyMark(d,ignored,0,ignored.text.length,E,F);assert.equal(filtered.plain,'AB C D{page}');assert(!filtered.rtf.includes('\\page'));assert(!filtered.rtf.includes('\\pict'));assert(E.parseStream(R.read(filtered.rtf,E,T).doc.text,false).filter(r=>r.k==='text').some(r=>r.s.startsWith('B')&&r.style.bold));
// The copied source uses its position size, while a destination note still owns its own size.
const target={text:'OLD',rich:false,size:11},pasted=R.insertMark(copy.rtf,target,0,3,E,T,F,'note');assert.equal(E.parseStream(pasted.text,false).filter(r=>r.k==='text').map(r=>r.s).join(''),copy.plain);assert(E.parseStream(pasted.text,false).filter(r=>r.k==='text').every(r=>r.style.size===null));
for(const side of Object.keys(d.notes.sets))for(const key of ['inL','inB','inR','outL','outR']){const one={text:side+'-'+key,rich:false,size:14};const result=R.copyMark(d,one,0,one.text.length,E,F);assert.equal(result.plain,one.text);assert(E.parseStream(R.read(result.rtf,E,T).doc.text,false).filter(r=>r.k==='text').every(r=>r.style.size===14));}
console.log('PASS: mark selection copy, position-size override, inherited fonts/styles, plain literal braces/Unicode and font context, ignored layout/images, source isolation, destination sizing and all 30 note slots');
