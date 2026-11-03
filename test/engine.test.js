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
assert.strictEqual(Folio.JYON, 'བྱོན།');

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
  // one side per run: fronts, then backs; the test print is sheet 1 only; reversed backs for printers that stack the other way
  const nums = s => s.slots.map(p => p && p.n);
  assert.deepStrictEqual(Engine.impose(doc, pages, { pass: 'fronts' }).map(s => s.side), ['front', 'front']);
  assert.deepStrictEqual(Engine.impose(doc, pages, { pass: 'backs' }).map(nums), [[6, 4, 2], [null, null, 8]]);
  assert.deepStrictEqual(Engine.impose(doc, pages, { pass: 'backs', firstOnly: true }).map(nums), [[6, 4, 2]]);
  doc.print.reverseBacks = true;
  assert.deepStrictEqual(Engine.impose(doc, pages, { pass: 'backs' }).map(s => s.sheet), [2, 1]);
  assert.deepStrictEqual(Engine.impose(doc, pages).map(s => s.sheet), [1, 1, 2, 2]);
  doc.print.reverseBacks = false;
  doc.print.sides = 'manual';
  assert.deepStrictEqual(Engine.impose(doc, pages).map(s => s.side), ['front', 'back', 'front', 'back']);
  doc.print.stack = true;
  assert.deepStrictEqual(Engine.impose(doc, pages)[0].slots.map(p => p && p.n), [1, 5, null].map((x, i) => (i === 2 ? null : x)));
}

// a hole left by the PDF is filled from the OCR only where the two line up, and sound text is untouched
{
  const PdfRead = require('../src/pdfread.js');
  const line = PdfRead.lineRecord('འ\u0000ོ་མགོན་དྭགས་པོ', 12);
  assert.strictEqual(PdfRead.repairPage([line], ['འགྲོ', 'མགོན', 'དྭགས', 'པོ']).filled, 1);
  assert.strictEqual(line.text, 'འགྲོ་མགོན་དྭགས་པོ');
  const sound = PdfRead.lineRecord('དེ་\u0000ས་མགོན་པོ', 12);
  const r = PdfRead.repairPage([sound], ['དེ', 'མགོན', 'པོ']);
  assert.deepStrictEqual([r.filled, r.left], [0, 1]);
  assert.strictEqual(sound.text, 'དེ་\u25A1ས་མགོན་པོ');
  // OCR that drops the subscript cannot fill a hole, and a hole keeps its marker for the next pass
  const plain = PdfRead.lineRecord('ཆོས་\u0000ེ་དང་', 12);
  assert.strictEqual(PdfRead.repairPage([plain], ['ཆོས', 'རེ', 'དང'], true).filled, 0);
  assert.strictEqual(PdfRead.repairPage([plain], ['ཆོས', 'རྗེ', 'དང'], true).filled, 1);
  assert.strictEqual(plain.text, 'ཆོས་རྗེ་དང་');
  const vowels = PdfRead.lineRecord('ཆེན་པ\u0000འ\u0000་གནས་', 12);
  assert.strictEqual(PdfRead.repairPage([vowels], ['ཆེན', 'པོའི', 'གནས'], true).filled, 1);
  assert.strictEqual(vowels.text, 'ཆེན་པོའི་གནས་');
  const doc = [PdfRead.lineRecord('\u0000ིད་དང་སྐྱིད་དང་སྐྱིད་པ་\u0000ས་གྱིས་ཀྱིས་', 12)];
  assert.deepStrictEqual(PdfRead.fillFromDocument([doc]), { filled: 1, left: 1 });
  assert.strictEqual(doc[0].text, 'སྐྱིད་དང་སྐྱིད་དང་སྐྱིད་པ་\u25A1ས་གྱིས་ཀྱིས་');
  assert.strictEqual(PdfRead.isDamaged('ཆྗེན'), true);
  assert.strictEqual(PdfRead.isDamaged('བསྒྲུབས'), false);
  assert.strictEqual(PdfRead.isDamaged('རྗེས'), false);
  assert.strictEqual(PdfRead.tidy('འཆང ་ཐུང ་མ། ། མར་'), 'འཆང་ཐུང་མ། །མར་');
}

const dir = process.argv[2];
if (dir) for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.pxp'))) {
  const { doc, unknown } = Pxp.toDoc(fs.readFileSync(path.join(dir, f)), TABLE, Engine.defaultDoc(), Engine);
  const { pages } = Engine.run(doc, measure);
  assert.strictEqual(unknown, 0, f);
  console.log(f.padEnd(26), 'pages', pages.length, 'paper', doc.paper.w + 'x' + doc.paper.h, 'perSheet', doc.pecha.perSheet, 'title/fancy', doc.counts.title, doc.counts.fancy, 'yigo', JSON.stringify(doc.yigo.text));
}
console.log('ok');
