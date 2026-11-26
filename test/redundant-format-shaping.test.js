const assert=require('node:assert/strict');
global.PechaImages=require('../src/images');global.Folio=require('../src/folio');
const E=require('../src/engine'),R=require('../src/rtf'),P=require('../src/pxp'),D=require('../src/documents'),T=require('../src/legacy-table');
const measure=(s,f)=>s.length*10-(f.kerning!=='none'?(s.match(/AV/g)||[]).length*5:0);measure.head=()=>({ascent:8,descent:2,height:10});
function sample(text,width=36){const d=E.defaultDoc();Object.assign(d,{text:'{font:family:Times%20New%20Roman 10 l}'+text,flow:false,paper:{name:'Custom',w:width/72,h:4},margins:{left:0,right:0,top:0,bottom:0}});d.pecha.mode=false;d.yigo.enabled=false;d.dzog.enabled=false;return d;}
const lines=d=>E.run(d,measure).pages.flatMap(p=>p.lines), strings=d=>lines(d).map(l=>l.items.map(a=>a.s).join(''));
for(const text of ['X A{10}V','X A{font:family:Times%20New%20Roman}V','X A{b /b}V','X A{#14100e}V','X {#abc}A{#aabbcc}V']){
 const d=sample(text);assert.deepEqual(strings(d),['XAV']);const word=lines(d)[0].items.at(-1);assert.equal(word.s,'AV');assert.equal(word.w,15);
}
const off=sample('X A{10}V');off.kerning=false;assert.deepEqual(strings(off),['X','AV']);assert.equal(lines(off)[1].items[0].w,20);
for(const code of ['b','i','u','s','#ff0000','font:serif','20']){
 const d=sample('A{'+code+'}V',100),pieces=lines(d)[0].items;assert.equal(pieces.length,2,'real attribute stays separate: '+code);assert.deepEqual(pieces.map(a=>a.s),['A','V']);
}
const overriding=sample('A{20}V',100);overriding.textSize=10;assert.equal(lines(overriding)[0].items[0].s,'AV','effective whole-text size is used');
const aligned=sample('A{r}V',100);assert.equal(lines(aligned)[0].align,'r');assert.equal(lines(aligned)[0].items[0].x,85);assert.equal(lines(aligned)[0].items.length,1);
const plainTib=sample('{font:jomolhari}ཀྱུ',100),splitTib=sample('{font:jomolhari}ཀ{font:jomolhari 10}ྱ{10}ུ',100);assert.equal(lines(splitTib)[0].items.length,1);assert.equal(lines(splitTib)[0].items[0].s,'ཀྱུ');
assert.equal(E.pageSvg(E.run(splitTib,measure).pages[0],splitTib,measure,1),E.pageSvg(E.run(plainTib,measure).pages[0],plainTib,measure,1));
for(const boundary of [' ','\t','\n','{page}'])assert.equal(strings(sample('A'+boundary+'{10}V',100)).join(''),'AV');
// A single-line annotation with redundant codes must be measured and drawn as one
// shaping run; real colour changes are retained, and source data is unchanged.
const mark=sample('BODY',100);mark.pecha.mode=true;mark.counts={title:0,fancy:0};mark.paper=E.defaultDoc().paper;
Object.assign(mark.notes.sets['body.front'].inL,{on:true,rich:true,text:'{font:jomolhari}ཀ{font:jomolhari}ྱུ',size:24});
const rendered=E.pageSvg(E.run(mark,measure).pages[0],mark,measure,1);assert(rendered.includes('>ཀྱུ</text>'));
const d=sample('X A{font:family:Times%20New%20Roman 10}V',100),before=JSON.stringify(d);assert.equal(D.normalize(D.artifact(d,'document'),E).text,d.text);
for(const imported of [R.read(R.write(d,E),E,T,d).doc,P.load(P.writeContent(d,E,T).bytes,'pxc',T,d,E).doc]){imported.paper=sample('',36).paper;assert.deepEqual(strings(imported),['XAV']);}
assert.equal(JSON.stringify(d),before);
console.log('PASS: redundant font/size/paint codes retain kerning and Tibetan shaping, disabled kerning and genuine changes stay distinct, effective sizing/alignment, controls, annotations and Save/RTF/PXC');
