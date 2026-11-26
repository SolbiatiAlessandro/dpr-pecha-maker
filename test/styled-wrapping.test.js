const assert=require('node:assert/strict');
global.PechaImages=require('../src/images');global.Folio=require('../src/folio');
const E=require('../src/engine'),R=require('../src/rtf'),P=require('../src/pxp'),D=require('../src/documents'),T=require('../src/legacy-table');
const measure=s=>Array.from(s).length*10;measure.head=()=>({ascent:8,descent:2,height:10});
function sample(text,width=50){const d=E.defaultDoc();d.text='{10 l}'+text;d.flow=false;d.pecha.mode=false;d.paper={name:'Custom',w:width/72,h:4};d.margins={left:0,right:0,top:0,bottom:0};d.yigo.enabled=false;d.dzog.enabled=false;return d;}
const layout=d=>E.run(d,measure).pages.flatMap(p=>p.lines), lines=d=>layout(d).map(l=>l.items.map(a=>a.s).join(''));
assert.deepEqual(lines(sample('X AB{b}CD{/b}')),['X','ABCD']);
assert.deepEqual(lines(sample('X AB{font:serif #f00 16}CD')),['X','ABCD']);
assert.deepEqual(lines(sample('X AB{b} CD')),['XAB','CD'],'an explicit space is still breakable');
assert.deepEqual(lines(sample('X ཀ{b}ི{/b}་ཁ་')),['Xཀི་','ཁ་']);
assert.deepEqual(lines(sample('X ཀ{b}།{/b}ཁ་',40)),['Xཀ།','ཁ་'],'closing punctuation keeps its original boundary');
assert.deepEqual(lines(sample('A{b}BC{/b}DEFG',30)),['ABCDEFG'],'an oversized styled word is retained whole');
// Inserting colour/bold boundaries at every code-point position cannot introduce
// a new break. Metrics deliberately do not change, isolating the break decision.
for(const plain of ['X ABCDE Y Z','ཀི་ཁ་ ག།ང་','X ཀ་། །ཁ་','ABCཀ་ཁ་DEF','X A\u00a0BB Y','X A\tBC\nDE','X ཀ༔ཁ་']){
  for(const width of [20,40,60,100]){
    const expected=lines(sample(plain,width));
    for(let i=0;i<=plain.length;i++){
      const styled=plain.slice(0,i)+'{b #c00000}'+plain.slice(i);
      assert.deepEqual(lines(sample(styled,width)),expected,JSON.stringify({plain,width,i}));
    }
    const styled=Array.from(plain,(c,i)=>`{${i%2?'b':'/b'} #${i%2?'c00000':'000000'}}${c}`).join('');
    assert.deepEqual(lines(sample(styled,width)),expected,'many style changes preserve breaks');
  }
}
// Real style metrics are summed; every piece retains its own font, size and colour.
const d=sample('X AB{font:serif 18 b i u s #123456}CD{/b} Y',70);
const pieces=layout(d).flatMap(l=>l.items),cd=pieces.find(a=>a.s==='CD');
assert.equal(cd.f.size,18);assert.equal(cd.f.weight,700);assert(cd.f.italic&&cd.f.underline&&cd.f.strike);assert.equal(cd.style.color,'#123456');
assert.equal(E.primaryFont(cd.f.family),'Georgia');
const metrics=(s,f)=>s.length*f.size;metrics.head=measure.head;
const sized=sample('X A{20}B',40);assert.deepEqual(E.run(sized,metrics).pages.flatMap(p=>p.lines).map(l=>l.items.map(a=>a.s).join('')),['X','AB']);
// No artificial justification opportunity inside a styled word.
const j=sample('X AB{b}CD{/b} Y Z',90);j.text=j.text.replace('{10 l}','{10 j}');
const first=layout(j)[0].items,a=first.find(a=>a.s==='AB'),b=first.find(a=>a.s==='CD');assert.equal(b.x,a.x+a.w);
// Inline images/hard controls retain their boundaries, and spaces after an image
// accumulate even when the spaces themselves contain a formatting change.
const im=sample('A{image:i} {b}  B',100);im.assets=[{id:'a',data:'data:image/png;base64,AA==',width:20,height:10}];im.images=[PechaImages.placement({id:'i',asset:'a',dpi:72,space:0})];
assert.equal(layout(im)[0].items.find(a=>a.image).spaces,3);
for(const control of ['\n','{page}','\t'])assert.equal(lines(sample('AB{b}'+control+'CD',30)).join(''),'ABCD');
const yi=sample('AB{b}CDEFG',20);yi.yigo.enabled=true;yi.pageOffset=1;yi.yigo.text='༄';assert(lines(yi).join('').includes('ABCDEFG'));
const rt=sample('X AB{b #ff0000}CD{/b color}',50);rt.paper=E.defaultDoc().paper;const before=JSON.stringify(rt);
assert.equal(D.normalize(D.artifact(rt,'document'),E).text,rt.text);
for(const imported of [R.read(R.write(rt,E),E,T).doc,P.load(P.writeContent(rt,E,T).bytes,'pxc',T,rt,E).doc]){
  imported.paper=sample('',50).paper;imported.margins=sample('').margins;imported.pecha.mode=false;imported.yigo.enabled=false;
  assert.deepEqual(lines(imported),['X','ABCD']);
  const c=layout(imported).flatMap(l=>l.items).find(a=>a.s==='CD');assert.equal(c.f.weight,700);assert.equal(c.style.color,'#ff0000');
}
assert.equal(JSON.stringify(rt),before);
console.log('PASS: styled-word/syllable/punctuation wrapping, exhaustive format-boundary invariance, font metrics/emphasis/colour, justification, oversize/yi-go retention, controls/images and Save/RTF/PXC');
