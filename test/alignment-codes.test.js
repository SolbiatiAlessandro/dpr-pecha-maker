const assert=require('node:assert/strict');
global.PechaImages=require('../src/images');global.Folio=require('../src/folio');
const E=require('../src/engine'),R=require('../src/rtf'),P=require('../src/pxp'),D=require('../src/documents'),T=require('../src/legacy-table');
const measure=s=>s.length*10;measure.head=()=>({ascent:8,descent:2,height:10});
function sample(text,width=100){const d=E.defaultDoc();Object.assign(d,{text:'{10 l}'+text,flow:false,paper:{name:'Custom',w:width/72,h:4},margins:{left:0,right:0,top:0,bottom:0}});d.pecha.mode=false;d.yigo.enabled=false;d.dzog.enabled=false;return d;}
const lines=d=>E.run(d,measure).pages.flatMap(p=>p.lines), aligns=d=>lines(d).map(l=>l.align);
for(const [text,expected] of [
 ['AB{r}',['r']],['AB{c}{r}{l}',['l']],['AB{right}',['r']],
 ['AB{r}\nCD{c}\nEF{l}',['r','c','l']],['AB\n{r}CD',['l','r']],
 ['AB{r}{page}CD',['r','r']],['AB{page}{r}CD',['l','r']],
 ['AB{r}\tCD',['r']],['AB\t{r}',['r']],['AB{r} {c}',['c']],
 ['AB\n{r}',['l']],['AB{r}\n\nCD',['r','r','r']],
 ['A{r}B{c}C',['c']],['ཀ་{r}',['r']],['{r}',[]]
])assert.deepEqual(aligns(sample(text)),expected,text);
assert.equal(lines(sample('AB{r}'))[0].items[0].x,80);
assert.equal(lines(sample('AB{c}'))[0].items[0].x,40);
assert.deepEqual(aligns(sample('A{r} BCDE',50)),['r','r'],'code before break space belongs to preceding line');
assert.deepEqual(aligns(sample('A {r}BCDE',50)),['l','r'],'code after break space follows next word');
assert.deepEqual(aligns(sample('AB CD EF{r}',50)),['l','r'],'end code affects only final wrapped line');
const flow=sample('AB{r}\n\nCD{c}');flow.flow=true;assert.deepEqual(aligns(flow),['r','c']);
const sectioned=sample('ignored');sectioned.sections=[{id:'a',name:'A',text:'AB{r}',folioStart:1},{id:'b',name:'B',text:'CD{c}',folioStart:1}];assert.deepEqual(aligns(sectioned).filter(Boolean),['r','c']);
// A trailing code after an image aligns the image line even without following text.
const im=sample('{image:i}{r}');im.assets=[{id:'a',data:'data:image/png;base64,AA==',width:20,height:10}];im.images=[PechaImages.placement({id:'i',asset:'a',dpi:72,space:0})];assert.equal(lines(im)[0].align,'r');assert.equal(lines(im)[0].items[0].x,80);
im.text='{10 l}AB {r}{image:i}';im.paper.w=40/72;assert.deepEqual(aligns(im),['l','r']);
// Save plus native/RTF exports retain trailing controls and recurring modes.
const d=sample('{font:family:Times%20New%20Roman}AB{r}\nCD{c}\nEF{l}\nGH{r}'),before=JSON.stringify(d);
assert.equal(D.normalize(D.artifact(d,'document'),E).text,d.text);
const expected=aligns(d);
for(const [name,imported] of [
 ['RTF',R.read(R.write(d,E),E,T,d).doc],
 ['PXC',P.load(P.writeContent(d,E,T).bytes,'pxc',T,d,E).doc],
 ['PXP',P.load(P.writeDocument(d,E,T,measure).bytes,'pxp',T,E.defaultDoc(),E).doc]
]){assert.deepEqual(aligns(imported),expected,name);assert.equal(lines(imported).map(l=>l.items.map(a=>a.s).join('')).join(''),'ABCDEFGH');}
assert.equal(JSON.stringify(d),before);
assert.deepEqual(aligns(R.read(String.raw`{\rtf1\ql AB\qr\par CD\qc\par EF\ql\par GH\qr}`,E,T,d).doc),expected);
assert.deepEqual(aligns(R.read(String.raw`{\rtf1\qr AB\pard}`,E,T,d).doc),['l'],'paragraph default at end is retained');
assert.deepEqual(aligns(R.read(String.raw`{\rtf1\ql AB{\v\qr hidden}}`,E,T,d).doc),['l'],'hidden alignment-only content does not leak into visible layout');
console.log('PASS: last alignment at EOF/return/page/tab, recurring modes, wrap-space ownership, Flow/sections/images, exact offsets, Save/RTF/PXC/PXP and hidden/paragraph-default boundaries');
