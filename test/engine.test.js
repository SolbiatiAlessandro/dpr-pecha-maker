// Run: node test/engine.test.js [folder of .pxp samples]
const assert = require('assert'), fs = require('fs'), path = require('path');
global.Folio = require('../src/folio.js');
const Engine = require('../src/engine.js'), Pxp = require('../src/pxp.js'), TABLE = require('../src/legacy-table.js');
const { SAMPLE_TEXT } = require('../src/sample.js');
const Documents = require('../src/documents.js');

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
  doc.print.stack = false;
  const thirteen = Array.from({length: 13}, (_, i) => ({n: i + 1}));
  assert.deepStrictEqual(Engine.impose(doc, thirteen, {pass: 'fronts'}).at(-1).slots.map(p => p && p.n), [13, null, null]);
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

// A global size overrides inline and role sizes without losing bold, colour, or typeface.
{
  const doc = Engine.defaultDoc(); doc.text = '{root}{b}{#b03020}{12}ཀ་{/b}{commentary}ཁ་';
  doc.roles.commentary.font = 'Noto Serif Tibetan'; doc.roles.commentary.bold = true; doc.textSize = 31;
  const items = Engine.run(doc, measure).pages.flatMap(p => p.lines.flatMap(l => l.items));
  assert(items.every(a => a.f.size === 31));
  assert.strictEqual(items[0].f.weight, 700); assert.strictEqual(items[0].style.color, '#b03020');
  assert(items.at(-1).f.family.includes('Noto Serif Tibetan')); assert.strictEqual(items.at(-1).f.weight, 700);
  doc.textSize = null;
  const sizes = Engine.run(doc, measure).pages.flatMap(p => p.lines.flatMap(l => l.items.map(a => a.f.size)));
  assert(sizes.includes(12)); assert(sizes.includes(23));
}

// Tabs remain at their stops after line reflow, including center alignment.
{
  const { pages } = layout('{l}A\tB', { flow: false, tabWidth: 1 });
  const line = pages[0].lines[0]; assert.strictEqual(line.items[1].x, 72);
  assert.strictEqual(line.endX, 72 + line.items[1].w);
}

// Later Title pages (including backs) get the requested yi-go, but the first never does.
{
  const doc = Engine.defaultDoc(); doc.text = 'ཀ་{page}ཁ་{page}ག་'; doc.counts.title = 3; doc.yigo.title2 = true;
  const pages = Engine.run(doc, measure).pages;
  assert.strictEqual(pages[0].lines[0].yigoCount, 0);
  assert(pages[1].lines[0].yigoCount > 0); assert(pages[2].lines[0].yigoCount > 0);
}

// Page labels count hidden titles, and expose angle, centered placement and first-title exclusion.
{
  const doc = Engine.defaultDoc(); doc.text = 'one{page}two'; doc.counts.title = 2;
  doc.folio.start = 0; doc.pageNum.start = 101; doc.pageNum.onTitle = true;
  doc.pageNum.firstTitle = false; doc.pageNum.angle = 0; doc.pageNum.position = 'center';
  const { pages, folioCount } = Engine.run(doc, measure);
  const first = Engine.pageSvg(pages[0], doc, measure, folioCount), second = Engine.pageSvg(pages[1], doc, measure, folioCount);
  assert(!first.includes('>101</text>')); assert(second.includes('>102</text>'));
  assert(second.includes('rotate(0)" text-anchor="middle"'));
}

// Vertical margins are respected by placement and fit checks, and old documents gain defaults.
{
  const doc = Engine.defaultDoc(); doc.text = 'A'; doc.margins.top = 1; doc.margins.bottom = 1;
  assert.strictEqual(Engine.fits(doc), false);
  doc.pecha.perSheet = 1; doc.pecha.placement = 'top';
  const { pages, folioCount } = Engine.run(doc, measure);
  const svg = Engine.sheetSvg(Engine.impose(doc, pages)[0], doc, measure, folioCount, true);
  assert(svg.includes('translate(21.6 72)'));
  doc.text = 'A{page}B'; doc.margins.bottom = 0.5;
  const pair = Engine.run(doc, measure);
  const back = Engine.sheetSvg(Engine.impose(doc, pair.pages)[1], doc, measure, pair.folioCount, true);
  const expectedY = Math.round((doc.paper.h - doc.margins.top - doc.pecha.height) * 72 * 100) / 100;
  assert(back.includes(`translate(21.6 ${expectedY})`), 'top-aligned front must have bottom-aligned back');
  const old = JSON.parse(JSON.stringify(doc)); delete old.roles; delete old.margins.top;
  const restored = Documents.normalize(old, Engine); assert(restored.roles.root); assert.strictEqual(restored.margins.top, 0);
  restored.pecha.perSheet = 0; restored.types.body.lines = -2; restored.tabWidth = 0;
  const safe = Documents.normalize(restored, Engine); assert(safe.pecha.perSheet >= 1 && safe.types.body.lines >= 1 && safe.tabWidth > 0);
}

// Reusable parts alter only their declared scope and cannot overwrite document content accidentally.
{
  const source = Engine.defaultDoc(); source.text = 'source text'; source.paper.w = 15; source.folio.start = 19;
  const target = Engine.defaultDoc(); target.text = 'keep this'; target.folio.start = 8;
  const saved = Documents.artifact(source, 'template'); assert(!Object.hasOwn(saved.settings, 'text'));
  const loaded = Documents.apply(target, saved, Engine);
  assert.strictEqual(loaded.text, 'keep this'); assert.strictEqual(loaded.folio.start, 8); assert.strictEqual(loaded.paper.w, 15);
  const annotated = Documents.apply(loaded, Documents.artifact(source, 'annotations'), Engine);
  assert.strictEqual(annotated.folio.start, 19); assert.strictEqual(annotated.text, 'keep this');
  const content = Documents.apply(annotated, Documents.artifact(source, 'content'), Engine);
  assert.strictEqual(content.text, 'source text'); assert.strictEqual(content.paper.w, 15);
  assert.throws(() => Documents.apply(target, {format: 'web-pecha-part', version: 1, kind: 'unknown'}, Engine));
}

// Rich text decorations survive the engine; text and imported attribute strings are escaped.
{
  const { doc, pages, folioCount } = layout('{u}{s}<hello>');
  const svg = Engine.pageSvg(pages[0], doc, measure, folioCount);
  assert(svg.includes('text-decoration="underline line-through"')); assert(svg.includes('&lt;hello&gt;'));
}

// Tibetan baseline adjustment moves Tibetan only, independently of page line height.
{
  const doc = Engine.defaultDoc(); doc.text = 'ཀ་Latin'; doc.yigo.enabled = false; doc.dzog.enabled = false;
  const render = () => { const r = Engine.run(doc, measure); return Engine.pageSvg(r.pages[0], doc, measure, r.folioCount); };
  const ys = svg => [...svg.matchAll(/<text x="[^"]+" y="([^"]+)"/g)].map(m => +m[1]);
  const before = ys(render()); doc.tibetanRaise = .1; const after = ys(render());
  assert(Math.abs(before[0] - after[0] - 7.2) < .01); assert.strictEqual(before[1], after[1]);
}

// Two texts start on front sides; blank backs count in the volume, folios reset, layout can restart.
{
  const doc = Engine.defaultDoc(); doc.yigo.enabled = false; doc.pageNum.start = 101; doc.pageNum.onTitle = true; doc.folio.onTitle = true;
  doc.sections = [
    {name: 'First text', text: 'one{page}two{page}three', folioStart: 1, restartLayout: true},
    {name: '<Second text>', text: 'four{page}five', folioStart: 7, restartLayout: false},
  ];
  const { pages, folioCount } = Engine.run(doc, measure);
  assert.strictEqual(pages.length, 6); assert.strictEqual(pages[3].blank, true);
  assert.deepStrictEqual(pages.map(p => p.n), [1, 2, 3, 4, 5, 6]);
  assert.deepStrictEqual(pages.filter(p => !p.blank).map(p => p.folioNumber), [1, 1, 2, 7, 7]);
  assert.strictEqual(pages[4].kind, 'body'); assert.strictEqual(pages[4].front, true);
  const svg = Engine.pageSvg(pages[4], doc, measure, folioCount);
  assert(svg.includes('>105</text>')); assert(svg.includes('&lt;Second text&gt;')); assert(svg.includes(Folio.words(7)));
  assert.strictEqual(Engine.pageSvg(pages[3], doc, measure, folioCount).includes('<text'), false);
  const sheets = Engine.impose(doc, pages);
  assert.deepStrictEqual(sheets[0].slots.map(p => p.n), [1, 3, 5]);
  assert.deepStrictEqual(sheets[1].slots.map(p => p.n), [6, 4, 2]);
  // Reordering recalculates volume numbers and preserves each text's independent settings.
  doc.sections.reverse();
  const reordered = Engine.run(doc, measure).pages;
  assert.strictEqual(reordered[0].sectionName, '<Second text>'); assert.strictEqual(reordered[0].folioNumber, 7);
  assert.strictEqual(reordered[2].kind, 'title'); assert.strictEqual(reordered[2].folioNumber, 1);
  // Save/open and content-only reuse preserve the section model.
  const reopened = Documents.apply(Engine.defaultDoc(), Documents.artifact(doc, 'document'), Engine);
  assert.deepStrictEqual(reopened.sections, doc.sections);
  const reused = Documents.apply(Engine.defaultDoc(), Documents.artifact(doc, 'content'), Engine);
  assert.deepStrictEqual(reused.sections, doc.sections);
}

// Original partial-file scopes: changing a template cannot replace a volume's content.
// Synthetic public-format fixture tests scope mechanics, not native-file fidelity.
{
  const fixture = ext => Buffer.from(`.${ext} 0.5 0 u1 u2 u3 u4 0 0 0 \n[START NON-BODY]\niNiT FolioStartNum=17\niNiT PageStartNum=201\niNiT Yigo.en=0\n[END NON-BODY]\n[START TEMPLATE]\n[PageSetup]\nPaperSize.x=14000\nPaperSize.y=8500\nPageOrientation=2\nPechaPagesCentered=0\n[LineControl]\nTabWidth=0.75\nTibFontAdj=0.1\n[END TEMPLATE]\nImported text`, 'latin1');
  const target = Engine.defaultDoc(); target.text = 'Keep text'; target.folio.start = 8;
  target.sections = [{name: 'Keep section', text: 'Section text', folioStart: 3, restartLayout: true}];
  target.folio.rhino = 'old phrase';
  const snapshot = JSON.stringify(target);
  const template = Pxp.load(fixture('pxt'), 'pxt', TABLE, target, Engine).doc;
  assert.strictEqual(template.text, target.text); assert.deepStrictEqual(template.sections, target.sections);
  assert.strictEqual(template.folio.start, 8); assert.strictEqual(template.folio.rhino, 'old phrase');
  assert.strictEqual(template.paper.w, 14); assert.strictEqual(template.pecha.placement, 'top');
  assert.strictEqual(template.tabWidth, .75); assert.strictEqual(template.tibetanRaise, .1);
  const annotations = Pxp.load(fixture('pxa'), 'pxa', TABLE, target, Engine).doc;
  assert.strictEqual(annotations.text, target.text); assert.deepStrictEqual(annotations.sections, target.sections);
  assert.deepStrictEqual(annotations.paper, target.paper); assert.strictEqual(annotations.folio.start, 17);
  assert.strictEqual(annotations.pageNum.start, 201); assert.strictEqual(annotations.yigo.enabled, target.yigo.enabled);
  assert.strictEqual(annotations.folio.rhino, '', 'disabled imported phrase must clear an old phrase');
  const content = Pxp.load(fixture('pxc'), 'pxc', TABLE, target, Engine).doc;
  assert.strictEqual(content.text, 'Imported text'); assert.deepStrictEqual(content.sections, []);
  assert.deepStrictEqual(content.paper, target.paper); assert.strictEqual(content.folio.start, 17);
  assert.strictEqual(content.yigo.enabled, false);
  assert.strictEqual(JSON.stringify(target), snapshot, 'imports must not mutate current document');
  const standalone = Buffer.from('; PechaMaker Template file. Pecha layout control settings.\n[File Version 0.5]\n[PageSetup]\nPaperSize.x=14000\nPaperSize.y=8500\n[PechaControl]\nPechaHeight=3\n');
  const plainTemplate = Pxp.load(standalone, 'pxt', TABLE, target, Engine).doc;
  assert.strictEqual(plainTemplate.paper.w, 14); assert.strictEqual(plainTemplate.pecha.height, 3);
  assert.strictEqual(plainTemplate.text, target.text); assert.strictEqual(plainTemplate.folio.start, 8);

}

// Selected-attribute formatting preserves mixed roles/fonts/decorations and the following text.
{
  const TextFormat = require('../src/text-format.js');
  const text = 'Before {root}A{b font:noto #b03020}B{commentary 17}C{/role} After';
  const start = text.indexOf('{root}'), end = text.indexOf(' After');
  const result = TextFormat.apply(text, start, end, {size: 31}, Engine);
  const runs = Engine.parseStream(result.text, false).filter(x => x.k === 'text');
  const original = Engine.parseStream(text, false).filter(x => x.k === 'text');
  assert.deepStrictEqual(runs.map(x => x.s), original.map(x => x.s));
  for (let i = 0; i < runs.length; i++) {
    const expected = {...original[i].style}; if (i > 0 && i < runs.length - 1) expected.size = 31;
    assert.deepStrictEqual(runs[i].style, expected);
  }
  const bold = TextFormat.apply(text, start, end, {bold: false, italic: true, font: 'serif'}, Engine);
  const boldRuns = Engine.parseStream(bold.text, false).filter(x => x.k === 'text');
  for (const r of boldRuns.slice(1, -1)) {
    assert.strictEqual(r.style.bold, false); assert.strictEqual(r.style.italic, true); assert.strictEqual(r.style.font, 'serif');
  }
  assert.deepStrictEqual(boldRuns.at(-1).style, original.at(-1).style);
  assert.deepStrictEqual(TextFormat.apply(text, start, end, {}, Engine), {text, start, end});
  const caret = TextFormat.apply('AB', 1, 1, {underline: true}, Engine);
  assert.strictEqual(caret.text, 'A{u}B'); assert.strictEqual(caret.start, caret.end);
  const splitCode = TextFormat.apply('A{24}B', 3, 6, {size: 32}, Engine);
  assert.strictEqual(splitCode.text, 'A{32}B{24}'); assert.strictEqual(Engine.parseStream(splitCode.text, false).at(-1).style.size, 32);
  // Returning to inherited bold must retain future role configuration, not freeze false.
  const inherited = TextFormat.apply('{root}ABC', 6, 7, {bold: true}, Engine);
  assert.strictEqual(Engine.parseStream(inherited.text, false).at(-1).style.bold, null);
}

// Spaces after formatting boundaries remain visible, including repeated and all-space runs.
{
  const doc = Engine.defaultDoc();
  const parse = text => Engine.atomize(Engine.parseStream(text, false), doc, measure);
  const runs = parse('Before {b}Bold{/b} After');
  assert.strictEqual(runs[1].gap, 'space'); assert.strictEqual(runs[1].spaces, 1);
  const repeated = parse('A{b}  {/b} B');
  assert.strictEqual(repeated[0].spaces, 3);
  assert.strictEqual(parse('A{b}B')[0].gap, 'none', 'no synthetic spaces inside a word');
  const r = layout('Before {b}Bold{/b} After', {flow: false});
  const line = r.pages[0].lines[0].items;
  assert(line[2].x > line[1].x + line[1].w);
}

const dir = process.argv[2];
if (dir) for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.pxp'))) {
  const { doc, unknown } = Pxp.toDoc(fs.readFileSync(path.join(dir, f)), TABLE, Engine.defaultDoc(), Engine);
  const { pages } = Engine.run(doc, measure);
  assert.strictEqual(unknown, 0, f);
  console.log(f.padEnd(26), 'pages', pages.length, 'paper', doc.paper.w + 'x' + doc.paper.h, 'perSheet', doc.pecha.perSheet, 'title/fancy', doc.counts.title, doc.counts.fancy, 'yigo', JSON.stringify(doc.yigo.text));
}
console.log('ok');
