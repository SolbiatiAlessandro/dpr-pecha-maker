const assert=require('node:assert/strict');
global.PechaImages=require('../src/images');global.Folio=require('../src/folio');
const E=require('../src/engine'),P=require('../src/pxp'),T=require('../src/legacy-table'),D=require('../src/documents'),{sample}=require('./native-annotation-export-fixture');
const visible=s=>E.parseStream(s,false).filter(r=>r.k==='text').map(r=>r.s).join('');
const d=sample(E),snapshot=JSON.stringify(d),out=P.writeAnnotations(d,E,T),parsed=P.parse(out.bytes),target=E.defaultDoc();target.text='Target';target.sections=[{name:'Keep',text:'Section'}];target.paper.w=14;target.yigo.text='Keep yi-go';target.pageNum.font='Georgia';
const back=P.load(out.bytes,'pxa',T,target,E).doc;
assert.equal(JSON.stringify(d),snapshot);assert.equal(parsed.body.length,0);assert.equal(parsed.imageBlock,null);assert.deepEqual(Object.keys(parsed.template),['PechaAnnotation']);assert.equal(parsed.template.PechaAnnotation.PageNumFIndex,undefined);assert.equal(parsed.nonBody.values.FolioNumTypeface,undefined);
assert.equal(back.text,target.text);assert.deepEqual(back.sections,target.sections);assert.deepEqual(back.paper,target.paper);assert.deepEqual(back.yigo,target.yigo);assert.equal(back.pageNum.font,'Georgia');assert.equal(back.folio.start,23);assert.equal(back.pageNum.start,401);assert.equal(back.notes.outLeft,.3);assert.equal(back.notes.outRight,.45);assert.equal(back.folio.size,15);assert.equal(visible(back.folio.rhino),d.folio.rhino);
for(const side of Object.keys(d.notes.sets))for(const pos of ['inL','inR','outL','outR','inB']){
 const a=d.notes.sets[side][pos],b=back.notes.sets[side][pos];assert.equal(visible(b.text),a.rich?visible(a.text):a.text);if(a.text){assert.equal(b.on,a.on);assert.equal(b.size,a.size);assert.equal(b.inset,a.inset);}
}
const runs=E.parseStream(back.notes.sets['body.front'].inL.text,false).filter(r=>r.k==='text');assert.equal(runs[0].style.font,'family:Arial');assert(runs[0].style.bold);assert.equal(runs[0].style.color,'#a02010');assert.equal(runs.at(-1).style.font,'jomolhari');assert(runs.at(-1).style.italic&&runs.at(-1).style.underline&&runs.at(-1).style.strike);assert.equal(runs.at(-1).style.color,'#2040a0');
assert(out.warnings.some(w=>w.includes('Experimental')));assert(out.warnings.some(w=>w.includes('TCC')));assert.equal(D.normalize(back,E).notes.outRight,.45);
// Independent format-byte check: RGB, four style toggles, font ID6 (compact Arial), then ASCII A.
const plain=E.defaultDoc();plain.font='"Arial",serif';plain.notes.sets['body.front'].inL.text='A';const p=P.parse(P.writeAnnotations(plain,E,T).bytes);
assert.deepEqual([...p.nonBody.raw['AnnoInL[4].s']],[17,34,20,16,14,17,17,35,0,127,127,17,17,36,0,127,127,17,17,37,0,127,127,17,17,38,0,127,127,17,17,32,6,127,127,17,65]);
assert.equal(p.fonts[6],'Arial');assert.equal(p.fontCharsets[6],0);
plain.notes.sets['body.front'].inL.text='A'.repeat(220);assert.equal(P.parse(P.writeAnnotations(plain,E,T).bytes).nonBody.raw['AnnoInL[4].s'].length,256);
plain.notes.sets['body.front'].inL.text+='A';assert.throws(()=>P.writeAnnotations(plain,E,T),/256-byte limit/);
plain.notes.sets['body.front'].inL.text='😀';assert.throws(()=>P.writeAnnotations(plain,E,T),/U\+1F600/);
plain.notes.sets['body.front'].inL.text='A';plain.font=JSON.stringify('A'.repeat(32));assert.throws(()=>P.writeAnnotations(plain,E,T),/31-byte/);
plain.font='€Font';assert.throws(()=>P.writeAnnotations(plain,E,T),/font name uses characters/);
const empty=P.writeAnnotations(E.defaultDoc(),E,T);assert(Buffer.from(empty.bytes).toString('latin1').startsWith('.pxa 0.1 u1 u2 u3 u4 0 1 0 0 Times New Roman\0\n'));
const special=sample(E);special.notes.sets['body.front'].inL={text:'{lc}x{rc}{hs}',rich:true,on:true,size:12,inset:.1};special.notes.sets['body.back'].inB.text='Unsupported back';special.notes.sets['body.front'].inB.size=18;special.pageNum.angle=180;special.pageNum.on=false;
const s=P.writeAnnotations(special,E,T),loaded=P.load(s.bytes,'pxa',T,target,E).doc;assert.equal(visible(loaded.notes.sets['body.front'].inL.text),'{x}\uE00D');assert(!loaded.pageNum.on);assert(s.warnings.some(w=>w.includes('on backs')));assert(s.warnings.some(w=>w.includes('share the upper-left')));assert(s.warnings.some(w=>w.includes('rotations')));
// Representative mapped glyphs from each of the five implicit TCC slots retain their Unicode text.
for(let i=0;i<5;i++){const name=i?'TibetanMachineSkt'+i:'TibetanMachine',text=Object.entries(T[name]).find(([b,s])=>+b>=32&&s.length>1&&/[\u0f00-\u0fff]/.test(s))[1],doc=E.defaultDoc();doc.folio.rhino=text;assert.equal(visible(P.load(P.writeAnnotations(doc,E,T).bytes,'pxa',T,target,E).doc.folio.rhino),text);}
console.log('PASS: experimental PXA framing/byte contract, all27 native note positions, styles/TCC/Windows1252, counters/spacing, scope/isolation, limits/rejection and explicit native-setting warnings');
