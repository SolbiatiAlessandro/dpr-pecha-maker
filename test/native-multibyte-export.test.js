const assert=require('node:assert/strict');
global.PechaImages=require('../src/images');global.Folio=require('../src/folio');
const E=require('../src/engine'),P=require('../src/pxp'),T=require('../src/legacy-table'),D=require('../src/documents'),R=require('../src/rtf'),{cases,sample}=require('./native-multibyte-export-fixture');
const visible=text=>E.parseStream(text,false).map(r=>r.k==='text'?r.s:r.k==='page'?'\f':'').join('');
// Walk framing independently of the native text decoder; keep each raw byte.
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
  assert(out.warnings.some(w=>w.includes('East Asian')));
  const base=E.defaultDoc();base.text='Keep';const loaded=P.load(out.bytes,kind,T,base,E);
  assert.equal(visible(kind==='pxa'?loaded.doc.folio.rhino:loaded.doc.text),c.text);assert.equal(loaded.unknown,0);
  if(kind==='pxa')assert.equal(loaded.doc.text,'Keep');
 }
}
const d=sample(E),before=JSON.stringify(d);
for(const [kind,writer] of [['pxp',P.writeDocument],['pxc',P.writeContent],['pxa',P.writeAnnotations]]){
 const out=writer(d,E,T),parsed=P.parse(out.bytes),got=P.load(out.bytes,kind,T,E.defaultDoc(),E).doc;
 assert.equal(JSON.stringify(d),before);assert.equal(visible(got.folio.rhino),'简体中文');assert.equal(visible(got.notes.sets['body.front'].inL.text),'한국어');assert.equal(visible(got.notes.sets['body.back'].inL.text),'繁體中文‧');
 if(kind!=='pxa'){
  assert.equal(visible(got.text),visible(d.text));assert.equal(visible(got.yigo.text),'日本語ソｶ');
  for(const c of cases)assert(Object.values(parsed.fontCharsets).includes(c.charset));
  assert.equal(visible(R.read(R.write(got,E),E,T).doc.text),visible(got.text));
 }
 assert.equal(visible(D.normalize(D.artifact(got,'document'),E).folio.rhino),'简体中文');
 const keys=Object.keys(parsed.fonts).filter(id=>+id>=5).map(id=>parsed.fonts[id]+':'+parsed.fontCharsets[id]);assert.equal(new Set(keys).size,keys.length);
}
// Font/style/control records must never split a multibyte character.
const mix=E.defaultDoc();mix.text='{font:family:Arial}日{b}本{/b}ソ{font:jomolhari}ཀ{font:family:Arial}简\n韩\t국{page}‧';
assert.equal(visible(P.load(P.writeContent(mix,E,T).bytes,'pxc',T,E.defaultDoc(),E).doc.text),visible(mix.text));
// Native mark limits count encoded bytes, not Unicode characters.
const long=E.defaultDoc();long.folio.rhino='日'.repeat(120);assert.throws(()=>P.writeAnnotations(long,E,T),/256-byte limit/);
// Never substitute best-fit, replacement, control or private-use glyphs.
for(const text of ['😀','\uFFFD','\uE000','\x1b']){const bad=E.defaultDoc();bad.text=text;assert.throws(()=>P.writeContent(bad,E,T),/cannot encode U\+/);}
console.log('PASS: exact East Asian bytes/charsets in all three native formats, mixed fonts/Tibetan/styles/control boundaries, compact marks, source isolation, Save/RTF, byte limits and unsupported Unicode rejection');
