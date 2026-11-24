const assert=require('node:assert/strict');
global.PechaImages=require('../src/images');global.Folio=require('../src/folio');
const E=require('../src/engine'),F=require('../src/text-format'),D=require('../src/documents'),R=require('../src/rtf'),TABLE=require('../src/legacy-table');
const d=E.defaultDoc(),token=E.fontToken('Verdana');
d.text=`{font:${token} b 18 #b03020}Red{font:serif /b 12}End`;d.sections=[{name:'Other',text:`{font:${E.fontToken('Trebuchet MS')}}Second`,folioStart:1,restartLayout:false}];
const choices=F.fontChoices(d,E);assert(choices.some(([v,n])=>v===token&&n==='Verdana'));assert(choices.some(([,n])=>n==='Trebuchet MS'));assert.equal(choices.filter(([v])=>v===token).length,1);
const start=d.text.indexOf('Red'),end=d.text.indexOf('End')+3;
for(const name of ['Courier New','O\'Brien "Display", Serif','སྐད་ཡིག']) {
 const font=E.fontToken(name),result=F.apply(d.text,start,end,{font},E),runs=E.parseStream(result.text,false).filter(r=>r.k==='text');
 assert.deepEqual(runs.map(r=>r.s),['Red','End']);assert(runs.every(r=>r.style.font===font));
 assert.equal(runs[0].style.bold,true);assert.equal(runs[0].style.size,18);assert.equal(runs[0].style.color,'#b03020');assert.equal(runs[1].style.bold,false);assert.equal(runs[1].style.size,12);
 const edited={...d,text:result.text,sections:[]};assert.equal(D.normalize(edited,E).text,result.text);
 const back=R.read(R.write(edited,E),E,TABLE).doc;assert(E.parseStream(back.text,false).filter(r=>r.k==='text').every(r=>r.style.font===font));
 const inserted=F.apply(d.text,start,start,{font},E);assert.equal(inserted.start,inserted.end);assert(inserted.text.includes(`{font:${font}}Red`));
}
const partial=F.apply(d.text,start,start+3,{font:E.fontToken('Arial')},E);const runs=E.parseStream(partial.text,false).filter(r=>r.k==='text');assert.equal(runs[1].style.font,'serif');
for(const name of ['','bad;font','a\nb','x'.repeat(129)])assert.equal(E.fontToken(name),null);
console.log('PASS: document font choices, sections, named font selection with style preservation, adjacent restoration, insertion, Save and RTF roundtrip');
