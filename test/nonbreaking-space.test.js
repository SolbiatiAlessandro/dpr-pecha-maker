const assert=require('node:assert/strict');
global.PechaImages=require('../src/images');global.Folio=require('../src/folio');
const E=require('../src/engine'),D=require('../src/documents'),R=require('../src/rtf'),P=require('../src/pxp'),T=require('../src/legacy-table');
const measure=(s,f)=>Array.from(s).length*10;measure.head=()=>({ascent:8,descent:2,height:10});
function sample(text,width=50){const d=E.defaultDoc();d.text='{10 l}'+text;d.flow=false;d.pecha.mode=false;d.paper={name:'Custom',w:width/72,h:4};d.margins={left:0,right:0,top:0,bottom:0};d.yigo.enabled=false;d.dzog.enabled=false;return d;}
const lines=d=>E.run(d,measure).pages.flatMap(p=>p.lines).map(l=>l.items.map(a=>a.s).join(''));
for(const text of ['X A\u00a0BB','X A{b}\u00a0BB','X A\u00a0{b}BB','X A{b}\u00a0{/b}BB'])assert.deepEqual(lines(sample(text)),['X','A\u00a0BB']);
assert.deepEqual(lines(sample('X A BB')),['XA','BB'],'ordinary spaces still allow wrapping');
assert.deepEqual(lines(sample('X ཀ་{b}\u00a0{/b}ཁ་',60)),['X','ཀ་\u00a0ཁ་']);
assert.deepEqual(lines(sample('A{b}\u00a0{/b}BBBB',20)),['A\u00a0BBBB'],'oversize chain remains intact');
for(const boundary of ['\n','{page}','\t']){const d=sample('A\u00a0'+boundary+'BB',30);assert.equal(lines(d).join(''),'A\u00a0BB');assert(lines(d).length>=2||boundary==='\t');}
assert.deepEqual(lines(sample('\u00a0A')),['\u00a0A'],'leading nonbreaking space is retained');
assert.deepEqual(lines(sample('A\u00a0')),['A\u00a0'],'trailing nonbreaking space is retained');
const flowing=sample('\u00a0A\u00a0');flowing.flow=true;
assert.deepEqual(lines(flowing),['\u00a0A\u00a0'],'flow retains nonbreaking spaces at paragraph edges');
for(const text of ['X A\u00a0\nBB','X A\n\u00a0BB']){
  const d=sample(text);d.flow=true;assert.deepEqual(lines(d),['X','A\u00a0BB'],'flow does not insert a break beside an existing nonbreaking space');
}
// Justification must not stretch a hidden Tibetan atom boundary inside the joined span.
const j=sample('X ཀ་{b}\u00a0{/b}ཁ་ Y Z',100);j.text=j.text.replace('{10 l}','{10 j}');const line=E.run(j,measure).pages[0].lines[0];
for(let i=1;i<line.items.length;i++){const a=line.items[i-1],b=line.items[i];if(a.s.endsWith('\u00a0')||b.s.startsWith('\u00a0'))assert.equal(b.x,a.x+a.w);}
// A too-wide first span after an automatic yi-go must not drop its first atom.
const yi=sample('ཀ་{b}\u00a0{/b}ཁ་',20);yi.yigo.enabled=true;yi.pageOffset=1;yi.yigo.text='༄';const output=lines(yi).join('');assert(output.includes('ཀ་\u00a0ཁ་'));assert(output.startsWith('༄'));
// Inline images are characters for nonbreaking adjacency, but hard controls remain boundaries.
const im=sample('X A\u00a0{image:i}',50);im.assets=[{id:'a',data:'data:image/png;base64,AA==',width:20,height:10}];im.images=[PechaImages.placement({id:'i',asset:'a',dpi:72,space:0})];
const imageLines=E.run(im,measure).pages[0].lines;assert.equal(imageLines[0].items[0].s,'X');assert.equal(imageLines[1].items.at(-1).image.id,'i');
const d=sample('A{b}\u00a0{/b}B');d.paper=E.defaultDoc().paper;const before=JSON.stringify(d);
assert.equal(D.normalize(D.artifact(d,'document'),E).text,d.text);const visible=s=>E.parseStream(s,false).filter(r=>r.k==='text').map(r=>r.s).join('');
assert.equal(visible(R.read(R.write(d,E),E,T).doc.text),'A\u00a0B');assert.equal(visible(R.read(String.raw`{\rtf1 A\~B}`,E,T).doc.text),'A\u00a0B');
assert.equal(visible(P.load(P.writeContent(d,E,T).bytes,'pxc',T,E.defaultDoc(),E).doc.text),'A\u00a0B');assert.equal(JSON.stringify(d),before);
console.log('PASS: nonbreaking spans across styles/Tibetan boundaries, ordinary-space wrapping, leading/trailing NBSP, hard controls, no internal justification gap, oversize/yi-go retention, inline-image adjacency and Save/RTF/PXC preservation');
