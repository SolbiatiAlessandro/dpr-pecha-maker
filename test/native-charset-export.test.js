const assert=require('node:assert/strict');
global.PechaImages=require('../src/images');global.Folio=require('../src/folio');
const E=require('../src/engine'),P=require('../src/pxp'),T=require('../src/legacy-table'),D=require('../src/documents'),{cases,sample}=require('./native-charset-export-fixture');
const visible=text=>E.parseStream(text,false).map(r=>r.k==='text'?r.s:r.k==='page'?'\f':'').join('');
// Inspect native bytes and active charset without using the native text decoder.
function glyphs(bytes,parsed){let font=0;const result=[];for(let i=0;i<bytes.length;i++){
 if(bytes[i]===17&&bytes[i+5]===17){if(bytes[i+1]===32)font=bytes[i+2];i+=5;continue;}
 result.push([parsed.fontCharsets[font],bytes[i],parsed.fonts[font]]);
}return result;}
for(const c of cases){
 const d=E.defaultDoc();d.font='"Arial"';d.text=c.text;d.folio.rhino=c.text;d.folio.rhinoRich=false;
 for(const t of Object.values(d.types))t.baseline=.3;
 for(const [kind,writer] of [['pxp',P.writeDocument],['pxc',P.writeContent],['pxa',P.writeAnnotations]]){
  const before=JSON.stringify(d),out=writer(d,E,T),parsed=P.parse(out.bytes),bytes=kind==='pxa'?parsed.nonBody.raw.FolioRhinoStream:parsed.body;
  assert.equal(JSON.stringify(d),before);assert.deepEqual(glyphs(bytes,parsed),[...Buffer.from(c.hex,'hex')].map(b=>[c.charset,b,'Arial']));
  assert(out.warnings.some(w=>w.includes('additional Windows font charsets')));
  const base=E.defaultDoc();base.text='Keep';const loaded=P.load(out.bytes,kind,T,base,E).doc;
  assert.equal(visible(kind==='pxa'?loaded.folio.rhino:loaded.text),c.text);if(kind==='pxa')assert.equal(loaded.text,'Keep');
 }
}
const d=sample(E),before=JSON.stringify(d);
for(const [kind,writer] of [['pxp',P.writeDocument],['pxc',P.writeContent],['pxa',P.writeAnnotations]]){
 const out=writer(d,E,T),parsed=P.parse(out.bytes),got=P.load(out.bytes,kind,T,E.defaultDoc(),E).doc;
 assert.equal(JSON.stringify(d),before);assert.equal(visible(got.folio.rhino),'Αθήνα');assert.equal(visible(got.notes.sets['body.front'].inL.text),'שלום');
 if(kind!=='pxa'){assert.equal(visible(got.text),visible(d.text));assert.equal(visible(got.yigo.text),'Привет');for(const c of cases)assert(Object.values(parsed.fontCharsets).includes(c.charset));}
 assert.equal(visible(D.normalize(D.artifact(got,'document'),E).folio.rhino),'Αθήνα');
 const keys=Object.keys(parsed.fonts).filter(id=>+id>=5).map(id=>parsed.fonts[id]+':'+parsed.fontCharsets[id]);assert.equal(new Set(keys).size,keys.length);
}
// Same font family needs distinct native IDs when byte192 changes meaning.
const mix=E.defaultDoc();mix.font='"Arial"';mix.text='ÀАΑ';const parsed=P.parse(P.writeContent(mix,E,T).bytes);
assert.deepEqual(glyphs(parsed.body,parsed).map(r=>r.slice(0,2)),[[0,192],[204,192],[161,193]]);
assert.equal(visible(P.load(P.writeContent(mix,E,T).bytes,'pxc',T,E.defaultDoc(),E).doc.text),'ÀАΑ');
// Existing Windows1252 encoding stays stable and does not issue the new note.
const western=E.defaultDoc();western.text='{font:family:Arial}Café €';assert(!P.writeContent(western,E,T).warnings.some(w=>w.includes('additional Windows font charsets')));
// Unicode outside these encodings remains a visible export error, not replacement.
for(const text of ['😀','𐍈','\u{10ffff}']){const bad=E.defaultDoc();bad.text=text;assert.throws(()=>P.writeContent(bad,E,T),/cannot encode U\+/);}
console.log('PASS: PXP/PXC/PXA exact Windows1250–1258/874 bytes and charsets, duplicate-family IDs, Tibetan mixtures, body/yi-go/phrase/notes, compact font references, source isolation, Save and unsupported Unicode rejection');
