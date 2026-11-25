const assert=require('node:assert/strict'),fs=require('node:fs');
global.PechaImages=require('../src/images');global.Folio=require('../src/folio');
const E=require('../src/engine'),P=require('../src/pxp'),T=require('../src/legacy-table'),D=require('../src/documents');
const {sample}=require('./native-content-export-fixture');
const visible=text=>E.parseStream(text,false).map(r=>r.k==='text'?r.s:r.k==='page'?'\f':'').join('').replace(/\u2028/g,'\n');
// Independent reference uses a float32 storage cell for each native arithmetic step.
const checksum=bytes=>{const cell=new Float32Array(1);bytes.forEach((b,i)=>{cell[0]+=100+2*i;cell[0]+=b;cell[0]+=(b*(101+2*i))|0;});return cell[0];};
function verify(bytes){
 const p=P.parse(bytes,T),header=/^\.pxc 0\.6 0 u1 u2 u3 u4 (\d+) (\d+) (\d+) /.exec(Buffer.from(bytes).toString('latin1'));
 assert(header);assert.equal(+header[1],p.body.length);assert.equal(+header[2],checksum(p.body));assert.equal(+header[3],Object.keys(p.fonts).length);
 assert.deepEqual(p.template,{});assert(!p.imageBlock);assert(Buffer.from(bytes).includes(Buffer.from('iNiT Yigo.en=')));return p;
}
const d=sample(E),before=JSON.stringify(d),out=P.writeContent(d,E,T),p=verify(out.bytes);
assert.equal(JSON.stringify(d),before);assert.equal(p.fonts[0],'TibetanMachine');assert.equal(p.fonts[4],'TibetanMachineSkt4');assert.equal(p.fonts[5],'Times New Roman');assert.equal(p.fonts[6],'Arial');
assert(p.body.includes(10));assert(p.body.includes(9));assert(p.body.includes(12));assert(p.body.includes(11));
const target=E.defaultDoc();target.text='OLD';target.paper.w=14;target.pageNum.size=9;target.pageNum.font='Georgia';target.folio.size=12;target.notes.outLeft=.7;
const targetBefore=JSON.stringify(target),got=P.load(out.bytes,'pxc',T,target,E).doc;
assert.equal(JSON.stringify(target),targetBefore);assert.equal(visible(got.text),visible(d.text));assert.equal(got.paper.w,14);assert.equal(got.pageNum.size,9);assert.equal(got.pageNum.font,'Georgia');assert.equal(got.folio.size,12);assert.equal(got.notes.outLeft,.7);
assert.deepEqual(got.shad,d.shad);assert.deepEqual(got.dzog,d.dzog);assert.equal(got.yigo.enabled,true);assert.equal(got.yigo.title2,true);assert.equal(got.yigo.fancyStart,false);assert.equal(visible(got.yigo.text),visible(d.yigo.text));
assert.equal(got.folio.start,d.folio.start);assert.equal(got.pageNum.start,d.pageNum.start);assert.equal(visible(got.folio.rhino),visible(d.folio.rhino));
for(const [side,set] of Object.entries(d.notes.sets))for(const pos of ['inL','inR','outL','outR',...(side.endsWith('.front')?['inB']:[])])assert.equal(visible(got.notes.sets[side][pos].text),visible(set[pos].text));
const runs=E.parseStream(got.text,false).filter(r=>r.k==='text');assert(runs.some(r=>r.s.includes('Café')&&r.style.bold&&r.style.size===18&&r.style.color==='#c02030'));assert(runs.some(r=>r.s.includes('Second')&&r.style.italic&&r.style.underline&&r.style.strike&&r.style.size===15&&r.style.align==='c'));
assert.equal(visible(D.normalize(D.artifact(got,'document'),E).text),visible(got.text));assert(out.warnings.some(w=>w.includes('Experimental')));assert(out.warnings.some(w=>w.includes('receiving document')));
// Exact independent single-letter body contract, including native size argument positions.
const one=E.defaultDoc();one.font='"Arial"';one.text='{18 l}A';one.yigo.text='';one.folio.rhino='';
const body=verify(P.writeContent(one,E,T).bytes).body;
const command=(op,a,b=127,c=127)=>[17,op,a,b,c,17];
assert.deepEqual([...body],[...command(50,127),...command(34,20,16,14),...command(35,0),...command(36,0),...command(37,0),...command(38,0),...command(32,6),...command(33,127,18,0),65]);
one.text='A'.repeat(1000);assert(verify(P.writeContent(one,E,T).bytes).body.length>1000);
one.sections=[{text:'First',title:'Label'},{text:'Second',title:'Other'}];const volume=P.writeContent(one,E,T);assert.equal(visible(P.load(volume.bytes,'pxc',T,target,E).doc.text),'First\fSecond');assert(volume.warnings.some(w=>w.includes('Volume sections')));
for(const change of [x=>x.text='😀',x=>x.text='{image:missing}',x=>x.images=[{id:'placed'}],x=>x.text='{font:jomolhari 200}ཀ',x=>x.text='',x=>x.notes.sets['body.front'].inL.text='A'.repeat(300)]){
 const invalid=sample(E);change(invalid);assert.throws(()=>P.writeContent(invalid,E,T));
}
// Optional real public-sample checksum validation, without embedding original text.
if(process.argv[2])for(const file of fs.readdirSync(process.argv[2]).filter(n=>n.endsWith('.pxp'))){const bytes=fs.readFileSync(process.argv[2]+'/'+file),p=P.parse(bytes,T),header=/u1 u2 u3 u4 (\d+) (\d+)/.exec(bytes.toString('latin1'));assert.equal(checksum(p.body),+header[2]);}
console.log('PASS: PXC exact framing/size commands/checksum/font records, body/marks/settings, source and receiving-layout isolation, all27 notes, Save, sections, long body and unsupported/empty/image/limit rejection');
