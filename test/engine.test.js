// Run: node test/engine.test.js [folder of .pxp samples]
const assert = require('assert'), fs = require('fs'), path = require('path');
global.Folio = require('../src/folio.js');
const Engine = require('../src/engine.js'), Pxp = require('../src/pxp.js'), TABLE = require('../src/legacy-table.js');
const { SAMPLE_TEXT } = require('../src/sample.js');

const measure = (s, f) => s.length * f.size * 0.4;
measure.head = (doc, size) => ({ ascent: size * 0.5, descent: size * 0.25, height: size * 0.75 });
const atoms = s => Engine.splitAtoms(s).map(a => a.s + (a.gap === 'space' ? '_' : a.gap === 'tsheg' ? '|' : ''));

assert.deepStrictEqual(atoms('དང་། །མར་པ་'), ['དང་།_', '།མར་|', 'པ་|']);
assert.deepStrictEqual(atoms('ཀ། །ཁ'), ['ཀ།_', '།ཁ']);
assert.deepStrictEqual(Folio.words(82), 'བརྒྱད་ཅུ་གྱ་གཉིས་');
assert.deepStrictEqual(Folio.words(182), 'བརྒྱ་ གྱ་གཉིས་');
assert.deepStrictEqual(Folio.words(200), 'ཉིས་བརྒྱ་ཐམ་པ་');

function layout(text, over = {}) {
  const doc = Engine.defaultDoc();
  doc.text = text; doc.counts = { title: 0, fancy: 0 }; doc.yigo.enabled = false;
  Object.assign(doc, over);
  return { doc, ...Engine.run(doc, measure) };
}

// a shad after the tsheg-bar that opens a line turns into a rinchen pung shad; a later one does not
{
  const line = t => layout(t, { flow: false }).pages[0].lines[1].items.map(a => a.s).join(' ');
  assert.strictEqual(line('ཀ་ཁ་\nརྩམས། །མཐུ་སྟོབས། །'), 'རྩམས\u0F11 \u0F11མཐུ་ སྟོབས། །');
  assert.strictEqual(line('ཀ་ཁ་\nམཐུ་སྟོབས། །རྩམས་'), 'མཐུ་ སྟོབས། །རྩམས་');
  assert.strictEqual(line('ཀ་ཁ་\nང་། །ཀ་'), 'ང་\u0F11 \u0F11ཀ་');
}

// flow mode joins verses after a shad with no extra space
assert.strictEqual(Engine.parseStream('ཀ། །\nཁ། །', true)[0].s, 'ཀ། །ཁ། །');

// sample lays out, justified lines end at the text width, every page is populated
{
  const doc = Engine.defaultDoc(); doc.text = SAMPLE_TEXT;
  const { pages } = Engine.run(doc, measure);
  assert(pages.length >= 3, 'pages ' + pages.length);
  for (const p of pages) for (const l of p.lines) {
    const W = p.boxes.T.x1 - p.boxes.T.x0;
    assert(l.width <= W + 0.5, `line overflow on page ${p.n}: ${l.width} > ${W}`);
  }
}

// duplex imposition: a folio's back sits behind its front once the sheet flips along the top edge
{
  const doc = Engine.defaultDoc(); doc.pecha.perSheet = 3; doc.print.sides = 'duplex';
  const pages = Array.from({ length: 8 }, (_, i) => ({ n: i + 1 }));
  const sh = Engine.impose(doc, pages);
  assert.deepStrictEqual(sh[0].slots.map(p => p && p.n), [1, 3, 5]);
  assert.deepStrictEqual(sh[1].slots.map(p => p && p.n), [6, 4, 2]);
  doc.print.stack = true;
  assert.deepStrictEqual(Engine.impose(doc, pages)[0].slots.map(p => p && p.n), [1, 5, null].map((x, i) => (i === 2 ? null : x)));
}

const dir = process.argv[2];
if (dir) for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.pxp'))) {
  const { doc, unknown } = Pxp.toDoc(fs.readFileSync(path.join(dir, f)), TABLE, Engine.defaultDoc(), Engine);
  const { pages } = Engine.run(doc, measure);
  assert.strictEqual(unknown, 0, f);
  console.log(f.padEnd(26), 'pages', pages.length, 'paper', doc.paper.w + 'x' + doc.paper.h, 'perSheet', doc.pecha.perSheet, 'title/fancy', doc.counts.title, doc.counts.fancy, 'yigo', JSON.stringify(doc.yigo.text));
}
console.log('ok');
