const assert=require('node:assert/strict');
global.PechaImages=require('../src/images');global.Folio=require('../src/folio');
const E=require('../src/engine'),P=require('../src/pxp'),R=require('../src/rtf'),D=require('../src/dct'),T=require('../src/legacy-table'),C=require('../src/legacy-characters'),Docs=require('../src/documents'),{cases,name,expected,dct,rtf,sample}=require('./legacy-byte-alias-fixture');
const measure=(s,f)=>s.length*f.size*.4;measure.head=()=>({ascent:15,descent:5,height:20});
const visible=t=>E.parseStream(t,false).filter(r=>r.k==='text').map(r=>r.s).join('');
// Independent native-byte inspection, without using the Unicode decoder.
function glyphs(bytes){let font=0;const result=[];for(let i=0;i<bytes.length;i++){
 if(bytes[i]===17&&bytes[i+5]===17){if(bytes[i+1]===32)font=bytes[i+2];i+=5;continue;}
 result.push([font,bytes[i]]);
}return result;}
for(const c of cases){
 assert.equal(T[name(c.slot)][c.byte],c.text);assert.equal(C.chart(name(c.slot),T)[c.byte-32].text,c.text);
 const d=E.defaultDoc();d.text=c.text;d.folio.rhino=c.text;d.folio.rhinoRich=false;
 for(const [kind,writer] of [['pxp',P.writeDocument],['pxc',P.writeContent],['pxa',P.writeAnnotations]]){
  const before=JSON.stringify(d),out=writer(d,E,T,measure),p=P.parse(out.bytes),stream=kind==='pxa'?p.nonBody.raw.FolioRhinoStream:p.body;
  assert.deepEqual(glyphs(stream),[[c.slot,c.byte]],kind+' exact legacy glyph slot');
  assert.equal(JSON.stringify(d),before);const base=E.defaultDoc();base.text='Retain';const loaded=P.load(out.bytes,kind,T,base,E).doc;
  assert.equal(visible(kind==='pxa'?loaded.folio.rhino:loaded.text),c.text);if(kind==='pxa')assert.equal(loaded.text,'Retain');
 }
}
assert.equal(T.TibetanMachine[155],'ཕྱྭ','explicit correction wins over decoded alias');assert.equal(T.TibetanMachine[8250],'པྱྭ','PDF key retained separately');
assert.equal(T.TibetanMachineSkt1[8364],'ཛྫྭ');assert.equal(T.TibetanMachineSkt1[129],undefined,'undefined CP1252 slot not guessed');
assert.equal(T.TibetanMachine[127],'','existing empty mapping retained');
const fromDct=D.read(dct(),E,T);assert.equal(visible(fromDct.doc.text),expected);assert.equal(fromDct.unknown,0);
assert.equal(visible(R.read(rtf(),E,T).doc.text),expected);
const d=sample(E),before=JSON.stringify(d);
for(const [kind,writer] of [['pxp',P.writeDocument],['pxc',P.writeContent],['pxa',P.writeAnnotations]]){
 const got=P.load(writer(d,E,T,measure).bytes,kind,T,E.defaultDoc(),E).doc;
 if(kind!=='pxa')assert.equal(visible(got.text),expected);
 assert.equal(visible(got.folio.rhino),cases[0].text);assert.equal(visible(got.notes.sets['body.front'].inL.text),cases[2].text);
 assert.equal(visible(Docs.normalize(Docs.artifact(got,'document'),E).folio.rhino),cases[0].text);
}
assert.equal(JSON.stringify(d),before);assert.equal(visible(R.read(R.write(d,E),E,T).doc.text),expected);
// Adversarial caller-supplied maps must never overflow or round a byte key.
for(const key of ['8364','256','-1','33.5']){
 const bad=E.defaultDoc();bad.text='ཀ';bad.folio.rhino='ཀ';bad.folio.rhinoRich=false;
 for(const writer of [P.writeContent,P.writeDocument,P.writeAnnotations])assert.throws(()=>writer(bad,E,{TibetanMachine:{[key]:'ཀ'}},measure),/cannot encode/);
}
console.log('PASS: exact valid bytes in PXP/PXC/PXA, prior corrupted-stack cases, body/marks and retention, DCT/RTF/chart aliases, override/undefined-slot/PDF-key preservation, invalid-byte rejection, Save and source isolation');
