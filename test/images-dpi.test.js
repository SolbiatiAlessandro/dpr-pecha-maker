const assert = require('node:assert/strict');
global.PechaImages = require('../src/images'); global.Folio = require('../src/folio');
const Engine = require('../src/engine'), Pxp = require('../src/pxp'), Documents = require('../src/documents');
const Rtf = require('../src/rtf'), TABLE = require('../src/legacy-table'), fixture = require('./image-dpi-fixture');
const size = (doc, image) => { const {w,h} = PechaImages.dimensions(doc,image); return [w,h]; };
const measure = (s,f) => s.length * f.size * .4;
measure.head = (_,size) => ({ascent:size*.5,descent:size*.25,height:size*.75});

const resolution = PechaImages.pngResolution(fixture.png());
assert(Math.abs(resolution.x-96)<.02 && Math.abs(resolution.y-48)<.02);
assert.equal(PechaImages.pngDpi(fixture.png()),resolution.x);
assert.equal(PechaImages.pngResolution(fixture.png(96,0)),null);
assert.equal(PechaImages.pngResolution(fixture.png().subarray(0,45)),null);

for (const old of [false,true]) {
  const result = Pxp.load(fixture.native(96,48,old),'pxp',TABLE,Engine.defaultDoc(),Engine), d = result.doc;
  assert.equal(d.images.length,old ? 2 : 3);
  assert(!result.warnings.some(w=>w.includes('Unequal')));
  for (const image of d.images) assert.deepEqual(size(d,image),[72,72]);
  for (const kind of ['document','content']) {
    const loaded = Documents.apply(Engine.defaultDoc(),Documents.artifact(d,kind),Engine);
    assert(loaded.images.every(p=>p.dpiY===48));
    assert.deepEqual(size(loaded,loaded.images[0]),[72,72]);
  }
  const copied = PechaImages.transferInline(d,'native-inline-0','copy',0,0).placement;
  assert.equal(copied.dpiY,48); assert.deepEqual(size(d,copied),[72,72]);
  copied.scale=50; assert.deepEqual(size(d,copied),[36,36]);
  copied.ignoreDpi=true; assert.deepEqual(size(d,copied),[36,18]);
  copied.ignoreDpi=false; copied.dpiY=null; assert.deepEqual(size(d,copied),[36,18]);
  const legacy=Documents.artifact(d,'document'); delete legacy.images[0].dpiY;
  const migrated=Documents.normalize(legacy,Engine); assert.equal(migrated.images[0].dpiY,null);
  assert.deepEqual(size(migrated,migrated.images[0]),[72,36]);
  const layout=Engine.run(d,measure), svg=Engine.pageSvg(layout.pages[0],d,measure,layout.folioCount);
  assert(svg.includes('width="72" height="72" preserveAspectRatio="none"'));
  if(!old) {
    const image=d.images.find(p=>p.kind==='page'), rect=PechaImages.pageRect(d,image,layout.pages[0].boxes,layout.pages[0].type);
    assert.equal(rect.h,72); assert.equal(rect.w,72);
    const geometry=Documents.normalize(d,Engine); geometry.counts={title:0,fancy:0};
    geometry.types.body.top=.1; geometry.yigo.enabled=false; geometry.text='word '.repeat(200);
    const tall=Engine.run(geometry,measure).pages[0].lines.filter(line=>line.offset>0).length;
    geometry.images.find(p=>p.kind==='page').dpiY=null;
    const short=Engine.run(geometry,measure).pages[0].lines.filter(line=>line.offset>0).length;
    assert(tall>short,'vertical DPI affects the number of lines excluded by a page image');
  }
  const rtf=Rtf.write(d,Engine), roundtrip=Rtf.read(rtf,Engine).doc;
  assert.deepEqual(size(roundtrip,roundtrip.images.find(p=>p.dpiY===48)),[72,72]);
  for (const [x,y] of [[96,0],[0,48],[0,0]]) {
    const missing=Pxp.load(fixture.native(x,y,old),'pxp',TABLE,Engine.defaultDoc(),Engine);
    assert(missing.warnings.some(w=>w.includes('both axes')));
    for (const image of missing.doc.images) assert.deepEqual(size(missing.doc,image),[72,36]);
  }
}
console.log('PASS: independent PNG/native DPI, missing-axis fallback, SVG geometry/exclusion, old-document migration, copy, save/load and RTF round trips');
