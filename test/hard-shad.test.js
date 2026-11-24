const assert=require('node:assert/strict');
global.PechaImages=require('../src/images');global.Folio=require('../src/folio');
const Pxp=require('../src/pxp'), Engine=require('../src/engine'), TABLE=require('../src/legacy-table'), fixture=require('./hard-shad-fixture');
const expected='{30}{hs}\nཀ{hs} {hs}\nཀ། །{page}ཀ{hs}';
for (const fonts of [{0:'TibetanMachine'}, {0:'Western'}, {}]) {
  const r=Pxp.decodeStream(Uint8Array.from([11,11]),fonts,TABLE);
  assert.deepEqual(r.unknown,{}); assert.equal(Pxp.eventsToText(r.ev,()=>false),'{hs}{hs}');
}
// A control byte inside a framed glyph is still interpreted by that glyph's font table.
const glyph=Pxp.decodeStream(Uint8Array.from([20,0,0,11,0,20]),{0:'Synthetic'},{Synthetic:{11:'x'}});
assert.equal(Pxp.eventsToText(glyph.ev,()=>false),'x');
for(const ext of ['pxp','pxc']) {
  const {doc,unknown}=Pxp.load(fixture.native(ext),ext,TABLE,Engine.defaultDoc(),Engine);
  assert.equal(unknown,0); assert.equal(doc.text,expected);
  assert.equal(doc.notes.sets['title.front'].inL.text,'{font:jomolhari}ཀ{hs}');
  assert.equal(doc.yigo.text,'ཀ།');
  doc.counts={title:0,fancy:0};doc.yigo.enabled=false;
  const measure=(s,f)=>s.length*f.size*.4;
  measure.head=(doc,size)=>({ascent:size*.5,descent:size*.25,height:size*.75});
  const result=Engine.run(doc,measure);
  assert.equal(result.pages.length,2);
  assert.equal(result.pages[0].lines[1].items.map(a=>a.s).join(''),'ཀ\ue00d\ue00d');
  assert.equal(result.pages[0].lines[2].items.map(a=>a.s).join(' '),'ཀ༑ ༑');
  assert.equal(JSON.parse(JSON.stringify(doc)).text,expected);
}
console.log('PASS: native hard-shad control, framing, font size, body/content/annotation/yi-go import, conversion exclusion and pagination');
