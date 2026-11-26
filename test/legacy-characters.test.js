const assert=require('node:assert/strict');
global.PechaImages=require('../src/images');global.Folio=require('../src/folio');
const Chart=require('../src/legacy-characters'),TABLE=require('../src/legacy-table'),Engine=require('../src/engine'),TextFormat=require('../src/text-format'),Documents=require('../src/documents'),Rtf=require('../src/rtf'),Pxp=require('../src/pxp');
const snapshot=JSON.stringify(TABLE);
for(const font of Chart.fonts){
 const slots=Chart.chart(font,TABLE);assert.equal(slots.length,224);assert.equal(slots[0].byte,32);assert.equal(slots.at(-1).byte,255);
 assert.equal(slots[0].text,' ');assert.equal(slots.at(-1).text,null);
 assert(slots.every((s,i)=>s.byte===i+32));assert(slots.some(s=>s.text===null));
 for(const s of slots)if(s.text!==null){assert(s.text===' '||/^[\u0f00-\u0fff]+$/.test(s.text));assert.notEqual(s.text,'༠༠༠༠');}
}
const base=Chart.chart('TibetanMachine',TABLE),slot=b=>base[b-32];
assert.equal(slot(33).text,'ཀ');assert.equal(slot(128).text,'སྒྱ');assert.equal(slot(220).text,'ི');assert(slot(220).combining);
assert.equal(slot(254).text,'སྐྱ');assert.equal(slot(254).code,'254 / 0xFE');assert(slot(254).name.includes('U+0F66 U+0F90 U+0FB1'));
for(const b of [127,157,166,255])assert.equal(slot(b).text,null);
assert.equal(Chart.chart('TibetanMachineSkt1',TABLE)[33-32].text,'ཀྐ');assert.equal(Chart.chart('TibetanMachineSkt4',TABLE)[249-32].text,null);
assert.throws(()=>Chart.chart('Other',TABLE));assert.equal(Chart.chart('TibetanMachine',{})[1].text,null);assert.equal(JSON.stringify(TABLE),snapshot);
const source='{font:serif 18 b #aa0000}AB',start=source.indexOf('AB');
const result=TextFormat.insertCharacter(source,start,start+1,slot(254).text,'noto',Engine);
const runs=Engine.parseStream(result.text,false).filter(r=>r.k==='text');assert.deepEqual(runs.map(r=>r.s),['སྐྱ','B']);
assert.equal(runs[0].style.font,'noto');assert.equal(runs[1].style.font,'serif');assert(runs.every(r=>r.style.bold&&r.style.size===18&&r.style.color==='#aa0000'));
assert.equal(TextFormat.insertCharacter('ཀ',1,1,slot(220).text,'',Engine).text,'ཀི');
assert.equal(TextFormat.insertCharacter('A{b}B',3,3,slot(33).text,'',Engine).text,'A{b}ཀB');
const doc=Engine.defaultDoc();doc.text=result.text;const before=JSON.stringify(doc);
assert.equal(Documents.normalize(Documents.artifact(doc,'document'),Engine).text,result.text);
const plain=d=>Engine.parseStream(d.text,false).filter(r=>r.k==='text').map(r=>r.s).join('');
assert.equal(plain(Rtf.read(Rtf.write(doc,Engine),Engine,TABLE).doc),'སྐྱB');
assert.equal(plain(Pxp.load(Pxp.writeContent(doc,Engine,TABLE).bytes,'pxc',TABLE,null,Engine).doc),'སྐྱB');
assert.equal(JSON.stringify(doc),before);
console.log('PASS: five bounded legacy charts, all byte slots, exact Tibetan examples/hex labels, unavailable and ambiguous exclusions, source isolation, multi-codepoint insertion/style restoration, combining marks and Save/RTF/native-content roundtrip');
