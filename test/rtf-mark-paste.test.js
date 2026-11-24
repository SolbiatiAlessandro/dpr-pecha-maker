const assert=require('node:assert/strict');
global.PechaImages=require('../src/images');global.Folio=require('../src/folio');
const E=require('../src/engine'),R=require('../src/rtf'),F=require('../src/text-format'),D=require('../src/documents'),T=require('../src/legacy-table'),{picture}=require('./rtf-picture-fixture');
const rtf=label=>'{\\rtf1\\ansi{\\fonttbl{\\f0 Arial;}{\\f1 Courier New;}}{\\colortbl;\\red176\\green48\\blue32;}\\f0\\fs100\\b\\i\\ul\\strike\\cf1 '+label+'A\\par \\f1\\fs12\\b0\\i0\\ulnone\\strike0\\cf0 '+label+'B}';
const paste=(kind,slot,input=rtf(kind))=>{const n=slot.text.indexOf('OLD');return R.insertMark(input,slot,n,n+3,E,T,F,kind);};
for(const kind of ['yigo','phrase']) {
 const slot={text:'{b} OLD!',rich:false},before=structuredClone(slot),result=paste(kind,slot);assert.deepEqual(slot,before);
 const runs=E.parseStream(result.text,false).filter(r=>r.k==='text');assert.equal(runs.map(r=>r.s).join(''),'{b} '+kind+'A '+kind+'B!');
 const a=runs.find(r=>r.s.includes(kind+'A')),b=runs.find(r=>r.s.includes(kind+'B'));
 assert.equal(a.style.font,'family:Arial');assert.equal(a.style.color,'#b03020');assert.equal(a.style.size,null);assert.equal(b.style.font,'family:Courier%20New');assert.equal(b.style.size,null);
 if(kind==='yigo'){assert.equal(a.style.bold,null);assert(!a.style.italic&&!a.style.underline&&!a.style.strike);assert(result.warnings.some(s=>s.includes('emphasis')));}
 else {assert(a.style.bold&&a.style.italic&&a.style.underline&&a.style.strike);assert(!result.warnings.some(s=>s.includes('emphasis')));}
 assert(!/[\r\n\u2028\t]/.test(result.text));assert(result.warnings.some(s=>s.includes('single-line')));
 const rich={text:'{font:noto 19 b #123456}Before OLD After',rich:true},again=paste(kind,rich),styled=E.parseStream(again.text,false).filter(r=>r.k==='text');assert.deepEqual(styled[0].style,styled.at(-1).style);
 assert(paste(kind,slot,'{\\rtf1 '+picture()+'}').empty);assert.throws(()=>paste(kind,slot,'bad'));
}
const d=E.defaultDoc();d.text='{30 #123456}ཀ་{page}ཁ་{page}ག་';d.counts={title:0,fancy:0};d.dzog.enabled=false;d.yigo.ignoreColor=false;
d.yigo.text=paste('yigo',{text:'OLD',rich:false},rtf('Yi')).text;d.yigo.rich=true;
d.folio.rhino=paste('phrase',{text:'OLD',rich:false},rtf('Fixed')).text;d.folio.rhinoRich=true;d.folio.rhinoEnabled=true;d.folio.size=17;
const measure=(s,f)=>s.length*f.size*.4;measure.head=(d,size)=>({ascent:size*.5,descent:size*.25,height:size*.75});
const svg=(doc,i=0)=>{const r=E.run(doc,measure);return E.pageSvg(r.pages[i],doc,measure,r.folioCount);};
const front=svg(d),back=svg(d,1);assert(front.includes('YiA'));assert(front.includes('FixedA'));assert(!back.includes('YiA'));assert(!back.includes('FixedA'));
assert(/font-size="30"[^>]*font-family="[^\n]*?Arial[^>]*fill="#b03020"[^>]*>YiA/.test(front));assert(/font-size="17"[^>]*font-family="[^\n]*?Arial[^>]*font-weight="700"[^>]*>FixedA/.test(front));assert(!front.includes('font-size="50"'));assert(!front.includes('font-size="6"'));
d.yigo.ignoreColor=true;assert(/fill="#123456"[^>]*>YiA/.test(svg(d)));d.yigo.ignoreColor=false;
const saved=D.normalize(D.artifact(d,'document'),E);assert.deepEqual(saved.yigo,d.yigo);assert.deepEqual(saved.folio,d.folio);
assert.equal(D.apply(E.defaultDoc(),D.artifact(d,'template'),E).yigo.text,d.yigo.text);assert.equal(D.apply(E.defaultDoc(),D.artifact(d,'annotations'),E).folio.rhino,d.folio.rhino);
assert.equal(D.newContent(d,E).yigo.text,d.yigo.text);assert.equal(D.newContent(d,E).folio.rhino,d.folio.rhino);assert(!R.write(d,E).includes('YiA'));assert(!R.write(d,E).includes('FixedA'));
console.log('PASS: yi-go font/colour-only and fixed-phrase emphasis, size ownership, literal braces and restoration, scope, front visibility, colour matching, Save/presets/New and RTF exclusion');
