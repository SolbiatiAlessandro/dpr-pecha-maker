// Run: node test/engine.test.js [folder of .pxp samples]
const assert = require('assert'), fs = require('fs'), path = require('path');
global.PechaImages = require('../src/images.js');
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

// Number label typefaces are independent of the document body and survive reusable settings.
{
  const doc = Engine.defaultDoc(); doc.text = 'body'; doc.counts.title = 0;
  doc.folio.font = 'Noto Serif Tibetan'; doc.pageNum.font = 'Jomolhari';
  const r = Engine.run(doc, measure), svg = Engine.pageSvg(r.pages[0], doc, measure, r.folioCount);
  assert(svg.includes(`font-family="'Noto Serif Tibetan','Noto Serif Tibetan',serif">${Folio.words(1)}`));
  assert(svg.includes(`font-family="'Jomolhari','Noto Serif Tibetan',serif">1</text>`));
  const saved = Documents.apply(Engine.defaultDoc(), Documents.artifact(doc, 'annotations'), Engine);
  assert.strictEqual(saved.folio.font, 'Noto Serif Tibetan'); assert.strictEqual(saved.pageNum.font, 'Jomolhari');
  const old = JSON.parse(JSON.stringify(doc)); delete old.folio.font; delete old.pageNum.font;
  const restored = Documents.normalize(old, Engine); assert.strictEqual(restored.folio.font, ''); assert.strictEqual(restored.pageNum.font, 'Georgia');
}

// Embedded image dimensions, baseline placement, reflow and safe persistence.
{
  const doc = Engine.defaultDoc(); doc.counts = {title: 0, fancy: 0}; doc.yigo.enabled = false; doc.dzog.enabled = false;
  doc.assets = [{id: 'asset1', data: 'data:image/png;base64,iVBORw0KGgo=', width: 96, height: 48}];
  doc.images = [PechaImages.placement({id: 'inline1', asset: 'asset1', dpi: 96, space: .1, above: .2})];
  doc.text = 'before{image:inline1}after';
  let r = Engine.run(doc, measure), line = r.pages[0].lines[0];
  assert.strictEqual(line.items[1].image.id, 'inline1'); assert.strictEqual(line.items[1].w, 86.4);
  let svg = Engine.pageSvg(r.pages[0], doc, measure, r.folioCount);
  assert(svg.includes('width="72" height="36" href="data:image/png;base64,'));
  const y = +svg.match(/<image[^>]* x="[^"]+" y="([^"]+)"/)[1];
  doc.tibetanRaise = .1; doc.images[0].addTibetan = true;
  r = Engine.run(doc, measure); svg = Engine.pageSvg(r.pages[0], doc, measure, r.folioCount);
  assert(Math.abs(y - +svg.match(/<image[^>]* x="[^"]+" y="([^"]+)"/)[1] - 7.2) < .01);
  doc.images[0].scale = 50; assert.strictEqual(PechaImages.dimensions(doc, doc.images[0]).w, 36);
  doc.images[0].dpi = 192; assert.strictEqual(PechaImages.dimensions(doc, doc.images[0]).w, 18);
  doc.images[0].ignoreDpi = true; assert.strictEqual(PechaImages.dimensions(doc, doc.images[0]).w, 36);
  const saved = Documents.apply(Engine.defaultDoc(), Documents.artifact(doc, 'content'), Engine);
  assert.deepStrictEqual(saved.assets, doc.assets); assert.deepStrictEqual(saved.images, doc.images);
  const bad = {...doc, assets: [{...doc.assets[0], data: 'https://example.com/private.png'}]};
  assert.strictEqual(Documents.normalize(bad, Engine).images.length, 0);
  assert(!Engine.pageSvg(Engine.run(Documents.normalize(bad, Engine), measure).pages[0], Documents.normalize(bad, Engine), measure, 1).includes('<image'));
  // Automatic image yi-go follows the same page eligibility and does not change source text.
  doc.images[0].kind = 'yigo'; doc.yigo.image = 'inline1'; doc.yigo.enabled = true; doc.text = 'ཀ་{page}ཁ་{page}ག་';
  r = Engine.run(doc, measure);
  assert(r.pages[0].lines[0].items[0].image); assert(!r.pages[1].lines[0].items[0].image); assert(r.pages[2].lines[0].items[0].image);
  assert.strictEqual(doc.text, 'ཀ་{page}ཁ་{page}ག་');
}

// Fixed page images anchor independently of body reflow and reserve text-side margins.
{
  const doc = Engine.defaultDoc(); doc.counts = {title: 0, fancy: 0}; doc.types.body.top = .1;
  doc.yigo.enabled = false; doc.dzog.enabled = false; doc.text = 'word '.repeat(250);
  doc.assets = [{id: 'a1', data: 'data:image/png;base64,iVBORw0KGgo=', width: 96, height: 48}];
  doc.images = [PechaImages.placement({id: 'p1', asset: 'a1', kind: 'page', page: 1, margin: .1})];
  let r = Engine.run(doc, measure); assert(r.pages.length > 1);
  assert(Math.abs(r.pages[0].lines[0].offset - 79.2) < .001);
  assert.strictEqual(r.pages[0].lines[1].offset, 0);
  assert(Engine.pageSvg(r.pages[0], doc, measure, r.folioCount).includes('data-image-id="p1"'));
  assert(!Engine.pageSvg(r.pages[1], doc, measure, r.folioCount).includes('data-image-id="p1"'));
  const rect = PechaImages.pageRect(doc, doc.images[0], r.pages[0].boxes, r.pages[0].type);
  doc.text = 'extra '.repeat(100) + doc.text;
  r = Engine.run(doc, measure);
  assert.deepStrictEqual(PechaImages.pageRect(doc, doc.images[0], r.pages[0].boxes, r.pages[0].type), rect);
  doc.images[0].anchor = 'text-right';
  const right = PechaImages.pageRect(doc, doc.images[0], r.pages[0].boxes, r.pages[0].type);
  assert.strictEqual(right.x + right.w, r.pages[0].boxes.T.x1);
  doc.images[0].anchor = 'inner-left'; assert.strictEqual(PechaImages.pageRect(doc, doc.images[0], r.pages[0].boxes, r.pages[0].type), null);
  doc.images[0].anchor = 'outer-left';
  assert(PechaImages.pageRect(doc, doc.images[0], r.pages[0].boxes, r.pages[0].type));
  assert.strictEqual(Engine.run(doc, measure).pages[0].lines[0].offset, 0, 'box images do not reserve text margin');
  // Volume anchor page numbers remain global across sections and inserted blank backs.
  doc.sections = [{name:'A', text:'one', folioStart:1, restartLayout:false}, {name:'B', text:'word '.repeat(30), folioStart:1, restartLayout:false}];
  doc.images[0].page = 3; doc.images[0].anchor = 'text-left';
  r = Engine.run(doc, measure); assert(r.pages[1].blank); assert(r.pages[2].lines[0].offset > 0);
  assert(Engine.pageSvg(r.pages[2], doc, measure, r.folioCount).includes('data-image-id="p1"'));
}

// Margin notes retain mixed style/font/color runs independently of main-text sizing.
{
  const doc = Engine.defaultDoc(); doc.text = 'body'; doc.counts = {title: 0, fancy: 0}; doc.textSize = 80;
  doc.folio.start = 0; doc.pageNum.on = false;
  doc.notes.sets['body.front'].inL = {...Engine.noteSlot('{b}Bold{/b} {font:noto #b03020 18}ཀ་', 13), rich: true};
  const r = Engine.run(doc, measure), svg = Engine.pageSvg(r.pages[0], doc, measure, r.folioCount);
  assert(svg.includes('font-weight="700">Bold</text>')); assert(svg.includes('fill="#b03020">ཀ་</text>'));
  assert(!svg.includes('font-size="18"')); assert(!svg.includes('{font:noto'));
  assert(svg.includes('font-size="13"')); // global body80 does not override annotation size13
  const saved = Documents.apply(Engine.defaultDoc(), Documents.artifact(doc, 'annotations'), Engine);
  assert.deepStrictEqual(saved.notes.sets['body.front'].inL, doc.notes.sets['body.front'].inL);
  doc.notes.sets['body.front'].inL.rich = false;
  const plain = Engine.pageSvg(Engine.run(doc, measure).pages[0], doc, measure, 1);
  assert(plain.includes('{b}Bold{/b}'), 'old plain annotations keep literal braces');
  const events = [{t:'code', op:0x20, a:1}, {t:'code', op:0x23, a:1}, {t:'text', s:'Tib'}, {t:'code', op:0x20,a:0}, {t:'text',s:'Latin'}];
  const converted = Pxp.eventsToText(events, id => id === 1, true);
  assert(converted.includes('{font:jomolhari}{b}Tib{font:serif}Latin'));
}

// RTF body export preserves characters and formatting, excluding automatic labels.
{
  const Rtf = require('../src/rtf');
  const doc = Engine.defaultDoc(); doc.text = '{b}Bold{/b} {#b03020 font:noto 18}ཀ་{hs}\nNext{page}Last';
  doc.notes.sets['title.front'].inL.text = 'PRIVATE LABEL NOT BODY';
  const output = Rtf.write(doc, Engine);
  assert(output.startsWith(String.raw`{\rtf1\ansi`)); assert(output.includes(String.raw`\b1`)); assert(output.includes(String.raw`\f1\fs36`));
  assert(output.includes(String.raw`\red176\green48\blue32;`)); assert(output.includes(String.raw`\u3853?`));
  assert(!output.includes('PRIVATE LABEL')); assert(!output.includes(String.raw`\u-8179?`));
  assert(output.includes(String.raw`\line`)); assert(output.includes(String.raw`\page`));
  assert.strictEqual(Rtf.escape('\\{}😀'), String.raw`\\\{\}\u-10179?\u-8704?`);
  doc.sections = [{text:'First'}, {text:'Second'}];
  assert(Rtf.write(doc, Engine).includes(String.raw`First\page`));
  doc.sections = []; doc.text = '{image:i1}';
  doc.assets = [{id:'a1', data:'data:image/png;base64,iVBORw0KGgo=', width:96,height:48}];
  doc.images = [PechaImages.placement({id:'i1',asset:'a1'})];
  const imageRtf = Rtf.write(doc, Engine);
  assert(imageRtf.includes(String.raw`\pngblip\picw96\pich48\picwgoal1440\pichgoal720`));
  assert(imageRtf.includes('89504e470d0a1a0a'));
}

// RTF import: grouped state, Unicode fallback, hidden destinations, legacy mappings and PNGs.
{
  const Rtf = require('../src/rtf');
  const textOf = doc => Engine.parseStream(doc.text, false).map(it => it.k === 'page' ? '\f' : it.s || '').join('');
  const input = String.raw`{\rtf1\ansi\ansicpg1252\deff0{\fonttbl{\f0 Georgia;}{\f1 Noto Serif Tibetan;}}{\colortbl;\red176\green48\blue32;}A{\b B}C\f1\fs36\cf1\u3904?\uc2\u3851??\line D\page E{\info SECRET}{\*\unknown HIDDEN}{\field{\*\fldinst URL}{\fldrslt LINK}}\'80\{x\}}`;
  const result = Rtf.read(input, Engine);
  assert.strictEqual(textOf(result.doc), 'ABCཀ་\u2028D\fELINK€{x}');
  const runs = Engine.parseStream(result.doc.text, false).filter(x=>x.k==='text');
  assert(runs.some(x=>x.s==='B' && x.style.bold)); assert(runs.some(x=>x.s==='C' && !x.style.bold));
  assert(runs.some(x=>x.s.includes('ཀ་') && x.style.font==='noto' && x.style.size===18 && x.style.color==='#b03020'));
  assert.deepStrictEqual(result.warnings, []);
  const legacy = Rtf.read(String.raw`{\rtf1{\fonttbl{\f0 LegacyTib;}}\f0\fs40 A}`, Engine, {LegacyTib:{65:'ཀ'}});
  assert.strictEqual(textOf(legacy.doc), 'ཀ'); assert.strictEqual(Engine.parseStream(legacy.doc.text,false)[0].style.size,15);
  const dual = Rtf.read(String.raw`{\rtf1{\upr{ANSI}{\*\ud\u3904?}}}`,Engine);
  assert.strictEqual(textOf(dual.doc),'ཀ');
  assert.throws(()=>Rtf.read('{\\rtf1 incomplete',Engine));
  const doc = Engine.defaultDoc(); doc.text = '{b}Bold{/b} བཀྲ་ཤིས་{hs}\nNext{page}{lc}last{rc}';
  const reopened = Rtf.read(Rtf.write(doc, Engine),Engine).doc;
  assert.strictEqual(textOf(reopened), 'Bold བཀྲ་ཤིས་།\u2028Next\f{last}');
  const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAGAAAAAwCAYAAADuFn/PAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAAc0lEQVR4nO3RMQ0AIBDAwFfCjP/gD2Qw9IbuTW7OXlf/mt8D9QAAaAcAQDsAANoBANAOAIB2AAC0AwCgHQAA7QAAaAcAQDsAANoBANAOAIB2AAC0AwCgHQAA7QAAaAcAQDsAANoBANAOAIB2AAC0AwCg3QMFUIQOyQQsWgAAAABJRU5ErkJggg==','base64');
  doc.text = '{image:i1}'; doc.assets = [{id:'a1',data:'data:image/png;base64,'+image.toString('base64'),width:96,height:48}];
  doc.images = [PechaImages.placement({id:'i1',asset:'a1',scale:50})];
  const retained = Engine.defaultDoc(); retained.paper.w = 17; retained.notes.sets['title.front'].inL.text = 'Keep note';
  const imported = Rtf.read(Rtf.write(doc,Engine),Engine,{},retained);
  assert.strictEqual(imported.doc.paper.w,17); assert.strictEqual(imported.doc.notes.sets['title.front'].inL.text,'Keep note');
  assert.strictEqual(imported.doc.assets[0].data,doc.assets[0].data);
  assert.strictEqual(imported.doc.images.length,1);
  assert(Math.abs(PechaImages.dimensions(imported.doc,imported.doc.images[0]).w-36)<.01);
  assert.deepStrictEqual(imported.warnings,[]);

}

// Rich yi-go keeps its own typeface/emphasis but uses the first character's size.
{
  const d = Engine.defaultDoc(); d.counts = {title:0,fancy:0}; d.dzog.enabled=false;
  d.text='{#123456 28}ཀ་'; d.yigo.rich=true; d.yigo.text='{font:noto b #b03020 10}༄༅།';
  let line=Engine.run(d,measure).pages[0].lines[0];
  assert(line.yigoCount > 0); assert.strictEqual(line.items[0].f.size,28);
  assert.strictEqual(line.items[0].f.weight,700); assert(line.items[0].f.family.includes('Noto Serif Tibetan'));
  assert.strictEqual(line.items[0].style.color,'#123456');
  d.yigo.ignoreColor=false; line=Engine.run(d,measure).pages[0].lines[0];
  assert.strictEqual(line.items[0].style.color,'#b03020');
  d.textSize=36; assert.strictEqual(Engine.run(d,measure).pages[0].lines[0].items[0].f.size,36);
}

// Dzog-thik follows the deepest actual font and counts trailing spaces.
{
  const d=Engine.defaultDoc(); d.counts={title:0,fancy:0}; d.yigo.enabled=false;
  d.text='{l 40}Large{12}small';
  const render=()=>{ const r=Engine.run(d,measure); return {r, svg:Engine.pageSvg(r.pages[0],d,measure,r.folioCount)}; };
  let {r,svg}=render();
  const path=svg.match(/<path d="([^"]+)" fill="none" stroke="#000" stroke-width="0.9"/)[1];
  assert(Math.abs(+path.match(/^M[\d.]+ ([\d.]+)H/)[1]-(r.pages[0].lineBaselines[0]+10)) < .01);
  d.flow=false; d.text='{l}First\nLast';
  const before=render().svg.match(/<path d="([^"]+)" fill="none" stroke="#000" stroke-width="0.9"/)[1];
  d.text+='   ';
  const after=render().svg.match(/<path d="([^"]+)" fill="none" stroke="#000" stroke-width="0.9"/)[1];
  assert(+after.match(/H([\d.]+)V/)[1] > +before.match(/H([\d.]+)V/)[1]);
  d.dzog.percentEnabled=true; d.dzog.percent=50;
  const baseline=render(); const pg=baseline.r.pages[0], ln=pg.lines.at(-1);
  const end=pg.boxes.T.x0+ln.endX+ln.items.at(-1).gapW;
  let drawing=baseline.svg.match(/<path d="([^"]+)" fill="none" stroke="#000" stroke-width="0.9"/)[1];
  assert(Math.abs(+drawing.match(/H([\d.]+)V/)[1]-(end+pg.boxes.T.x1)/2)<.01);
  const lower=+drawing.match(/^M[\d.]+ ([\d.]+)/)[1], upper=+drawing.match(/V([\d.]+)/)[1];
  d.dzog.leftUp=.1; d.dzog.rightUp=.05;
  drawing=render().svg.match(/<path d="([^"]+)" fill="none" stroke="#000" stroke-width="0.9"/)[1];
  assert(Math.abs(lower-+drawing.match(/^M[\d.]+ ([\d.]+)/)[1]-7.2)<.01);
  assert(Math.abs(upper-+drawing.match(/V([\d.]+)/)[1]-3.6)<.01);
  d.dzog.percentEnabled=false;
  d.assets=[{id:'a',data:'data:image/png;base64,iVBORw0KGgo=',width:96,height:192}];
  d.images=[PechaImages.placement({id:'p',asset:'a',kind:'page',page:1})];
  const shifted=render(); const shiftedPage=shifted.r.pages[0], shiftedLine=shiftedPage.lines.at(-1);
  assert(shiftedLine.offset>0);
  const shiftedPath=shifted.svg.match(/<path d="([^"]+)" fill="none" stroke="#000" stroke-width="0.9"/)[1];
  assert(Math.abs(+shiftedPath.match(/H([\d.]+)V/)[1]-(shiftedPage.boxes.T.x0+shiftedLine.endX+shiftedLine.items.at(-1).gapW+d.dzog.rise*72))<.01);

}

// Image copies share pixels, reset placement, and move correctly between text sections.
{
  const d=Engine.defaultDoc(); d.text='a{image:i1}b';
  d.images=[PechaImages.placement({id:'i1',asset:'a1',dpi:150,scale:30,above:1,space:1})];
  let r=PechaImages.transferInline(d,'i1','i2',0,d.text.length,false);
  assert.strictEqual(d.text,'a{image:i1}b{image:i2}');
  assert.strictEqual(r.placement.scale,100); assert.strictEqual(r.placement.space,.03);
  assert.strictEqual(r.placement.dpi,150); assert.strictEqual(r.placement.asset,'a1');
  r=PechaImages.transferInline(d,'i1','i3',0,d.text.length,true);
  assert.strictEqual(d.text,'ab{image:i2}{image:i3}'); assert.strictEqual(r.cursor,d.text.length);
  d.sections=[{text:d.text},{text:'Second'}];
  PechaImages.transferInline(d,'i3','i4',1,0,true);
  assert.strictEqual(d.sections[0].text,'ab{image:i2}'); assert.strictEqual(d.sections[1].text,'{image:i4}Second');
  assert(!d.images.some(p=>p.id==='i3'));
  PechaImages.transferInline(d,'i4','i5',1,3,true);
  assert.strictEqual(d.sections[1].text,'{image:i5}Second');
}

// New/plain-text import retains documented annotation/yi-go/seru settings, not content.
{
  const d=Engine.defaultDoc(); d.text='old'; d.sections=[{text:'old section'}];
  d.notes.sets['body.front'].inL.text='Keep'; d.folio.rhino='Phrase'; d.yigo.text='Custom'; d.yigo.image='yi';
  d.images=[PechaImages.placement({id:'yi',asset:'a',kind:'yigo'}),PechaImages.placement({id:'body',asset:'b'})];
  d.assets=[{id:'a',data:'yi'},{id:'b',data:'body'}];
  const rtfNew=require('../src/rtf').read(String.raw`{\rtf1 new}`,Engine,{},d).doc;
  assert.strictEqual(rtfNew.yigo.image,'yi'); assert.deepStrictEqual(rtfNew.assets,[d.assets[0]]);
  const n=Documents.newContent(d,Engine);
  assert.strictEqual(n.text,''); assert.deepStrictEqual(n.sections,[]);
  assert.strictEqual(n.notes.sets['body.front'].inL.text,'Keep'); assert.strictEqual(n.folio.rhino,'Phrase');
  assert.strictEqual(n.yigo.text,'Custom'); assert.deepStrictEqual(n.assets,[d.assets[0]]);
  n.notes.sets['body.front'].inL.text='Changed'; assert.strictEqual(d.notes.sets['body.front'].inL.text,'Keep');
}

// Mixed sizes/fonts share a line baseline; Tibetan raise moves only Tibetan runs.
{
  const d=Engine.defaultDoc(); d.text='{l font:serif 40}Large{12}small{font:noto}ཀ་';
  d.counts={title:0,fancy:0}; d.yigo.enabled=false; d.tibetanRaise=.1;
  const r=Engine.run(d,measure); const svg=Engine.pageSvg(r.pages[0],d,measure,r.folioCount);
  const yFor=s=>+svg.match(new RegExp('<text[^>]* y="([0-9.]+)"[^>]*>'+s+'</text>'))[1];
  assert.strictEqual(yFor('Large'),yFor('small'));
  assert(Math.abs(yFor('Large')-yFor('ཀ་')-7.2)<.01);
}

// Display hints never alter printed sheet output or saved frame colours.
{
  const d=Engine.defaultDoc(); d.text='Text'; d.types.title.color='#112233';
  const r=Engine.run(d,measure), sheet=Engine.impose(d,r.pages,{pass:'sequence'})[0];
  const plain=Engine.sheetSvg(sheet,d,measure,r.folioCount,false);
  d.display={baselines:true,hintColors:true};
  const preview=Engine.pageSvg(r.pages[0],d,measure,r.folioCount);
  assert(preview.includes('data-baseline-guide')); assert(preview.includes('stroke="#b03020"'));
  assert.strictEqual(Engine.sheetSvg(sheet,d,measure,r.folioCount,false),plain);
  assert.strictEqual(d.types.title.color,'#112233');
}

// The native writer appends image metadata/payload after body; never render it as text.
{
  const file=Buffer.from('.pxp\n[START NON-BODY]\n[END NON-BODY]\n[START TEMPLATE]\n[END TEMPLATE]\nBody\n[START IMAGES] 1.1\nImageInfoCount=1\nimageOffset=0\ncompSize=8\n[END IINFO 0]\nImages_totalBytes=8\nPAYLOAD!','latin1');
  const result=Pxp.load(file,'pxp',TABLE,Engine.defaultDoc(),Engine);
  assert(result.doc.text.includes('Body')); assert(!result.doc.text.includes('PAYLOAD'));
  assert(!result.doc.text.includes('ImageInfoCount')); assert(result.warnings.length>=1);
}

// Kerning state travels with measured runs and printed text, and survives templates.
{
  const d=Engine.defaultDoc(); d.text='AVATAR'; d.kerning=false;
  const r=Engine.run(d,measure); assert.strictEqual(r.pages[0].lines[0].items.at(-1).f.kerning,'none');
  assert(Engine.pageSvg(r.pages[0],d,measure,r.folioCount).includes('font-kerning:none'));
  assert.strictEqual(Documents.apply(Engine.defaultDoc(),Documents.artifact(d,'template'),Engine).kerning,false);
}

// Non-pecha mode uses full margins, common fixed baselines, no frames and no first-page yi-go.
{
  const d=Engine.defaultDoc(); d.pecha.mode=false; d.normal.baseline=.3; d.text='ཀ་{page}ཁ་'; d.flow=false;
  d.paper={name:'Test',w:8.5,h:11}; d.margins={left:1,right:1,top:1,bottom:1};
  const r=Engine.run(d,measure); assert.strictEqual(r.pages.length,2);
  assert.strictEqual(r.pages[0].boxes.w,6.5*72); assert.strictEqual(r.pages[0].boxes.h,9*72);
  assert.strictEqual(r.pages[0].lines[0].yigoCount,0); assert(r.pages[1].lines[0].yigoCount>0);
  const svg=Engine.pageSvg(r.pages[0],d,measure,r.folioCount); assert(!svg.includes('<rect'));
  assert(Math.abs(r.pages[0].lineBaselines[0]-.3*72)<.01);
  const sheets=Engine.impose(d,r.pages); assert(sheets.every(s=>s.slots.length===1));
  const print=Engine.sheetSvg(sheets[0],d,measure,r.folioCount,false);
  assert(print.includes('translate(72 72)')); assert(print.includes('height="11in"'));
  assert(!print.includes('<rect'));
  d.sections=[{text:'ཀ་',name:'A'},{text:'ཁ་',name:'B'}];
  assert(Engine.run(d,measure).pages[1].lines[0].yigoCount>0);
  assert.strictEqual(Engine.run(d,measure).pages.length,2);
  d.pecha.mode=true; assert(Engine.run(d,measure).pages.some(p=>p.blank));
}

// Synthetic image-header1.1 follows observed writer framing; real native fixture still needed.
{
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAGAAAAAwCAYAAADuFn/PAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAAc0lEQVR4nO3RMQ0AIBDAwFfCjP/gD2Qw9IbuTW7OXlf/mt8D9QAAaAcAQDsAANoBANAOAIB2AAC0AwCgHQAA7QAAaAcAQDsAANoBANAOAIB2AAC0AwCgHQAA7QAAaAcAQDsAANoBANAOAIB2AAC0AwCg3QMFUIQOyQQsWgAAAABJRU5ErkJggg==','base64');
  const head=Buffer.from('.pxp\n[START NON-BODY]\niNiT YigoImageEn=1\niNiT YigoLineImageIndex=0\n[END NON-BODY]\n[START TEMPLATE]\n[END TEMPLATE]\nBefore ','latin1');
  const meta=Buffer.from(' after\n[START IMAGES] 1.1\nImageInfoCount=1\nimageOffset=0\ncompSize='+png.length+'\ndibXDPI=96\ndibYDPI=96\n[END IINFO 0]\nLineImageInfoCount=1\niInfoIndex=0\nignoreImgDPI=0\nscale=50\nsideSp_float=0.1\nyAdj_float=0.25\naddTFA=1\n[END LIINFO 0]\nPageImageInfoCount=0\nImages_totalBytes='+png.length+'\n','latin1');
  const file=Buffer.concat([head,Buffer.from([0x13,0,0,0,0,0x13]),meta,png]);
  const result=Pxp.load(file,'pxp',TABLE,Engine.defaultDoc(),Engine);
  assert.strictEqual(result.doc.assets.length,1); assert.strictEqual(result.doc.images.length,2);
  assert(result.doc.text.includes('Before {image:native-inline-0} after'));
  assert.strictEqual(result.doc.yigo.image,'native-yigo');
  const image=result.doc.images[0];assert.strictEqual(image.scale,50);assert.strictEqual(image.above,.25);
  assert.strictEqual(image.space,.1);assert(image.addTibetan);
  assert.strictEqual(PechaImages.dimensions(result.doc,image).w,36);
  const current=Engine.defaultDoc();current.paper.w=17;
  assert.strictEqual(Pxp.load(file,'pxc',TABLE,current,Engine).doc.paper.w,17);
  const bad=Buffer.from(file);const at=bad.indexOf('imageOffset=0');bad[at+'imageOffset='.length]=57;
  assert.strictEqual(Pxp.load(bad,'pxp',TABLE,current,Engine).doc.assets.length,0);
  const iinfo=Buffer.alloc(28),linfo=Buffer.alloc(40);
  iinfo.writeUInt32LE(png.length,8);iinfo.writeUInt16LE(96,24);iinfo.writeUInt16LE(96,26);
  linfo.writeInt32LE(50,8);linfo.writeDoubleLE(.1,20);linfo.writeDoubleLE(.25,28);linfo.writeInt32LE(1,36);
  const old=Buffer.concat([head,Buffer.from([0x13,0,0,0,0,0x13]),
    Buffer.from(' after\n[START IMAGES] 1.0\nImageInfo_SizeOf=28\nImageInfoCount=1\n'),iinfo,
    Buffer.from('\nLineImageInfo_SizeOf=40\nLineImageInfoCount=1\n'),linfo,
    Buffer.from('\nImages_totalBytes='+png.length+'\n'),png]);
  const pageRecords=[0,1,2,3,4,5,6].map((slot,index)=>'iInfoIndex=0\nscale=50\nignoreImgDPI=0\nyAdj_float=0.2\nxAdj_float=0.3\nxMar_float=0.1\npageNbr=2\nslot='+slot+'\n[END PIINFO '+index+']\n').join('');
  const pageMeta=Buffer.from(meta.toString('latin1').replace('PageImageInfoCount=0\n','PageImageInfoCount=7\n'+pageRecords),'latin1');
  const pageFile=Buffer.concat([head,Buffer.from([0x13,0,0,0,0,0x13]),pageMeta,png]);
  const pageResult=Pxp.load(pageFile,'pxp',TABLE,current,Engine);
  const placements=pageResult.doc.images.filter(p=>p.kind==='page');
  assert.deepStrictEqual(placements.map(p=>p.anchor),PechaImages.anchors);
  assert(placements.every(p=>p.page===2 && p.down===.2 && p.inward===.3 && p.margin===.1));
  assert(pageResult.warnings.some(s=>s.includes('anchor or page number')));
  assert.strictEqual(pageResult.doc.assets.length,1);
  const oldResult=Pxp.load(old,'pxp',TABLE,current,Engine);
  assert.deepStrictEqual(oldResult.doc.assets,result.doc.assets);
  assert.deepStrictEqual(oldResult.doc.images,result.doc.images);
  assert.strictEqual(oldResult.doc.text,result.doc.text);
  const wrongSize=Buffer.from(old);wrongSize[wrongSize.indexOf('SizeOf=28')+7]=55;
  const unsupported=Pxp.load(wrongSize,'pxp',TABLE,current,Engine);
  assert.strictEqual(unsupported.doc.assets.length,0);
  assert(unsupported.warnings.some(s=>s.includes('1.0 image records')));

}

const dir = process.argv[2];
if (dir) for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.pxp'))) {
  const { doc, unknown } = Pxp.toDoc(fs.readFileSync(path.join(dir, f)), TABLE, Engine.defaultDoc(), Engine);
  const { pages } = Engine.run(doc, measure);
  assert.strictEqual(unknown, 0, f);
  console.log(f.padEnd(26), 'pages', pages.length, 'paper', doc.paper.w + 'x' + doc.paper.h, 'perSheet', doc.pecha.perSheet, 'title/fancy', doc.counts.title, doc.counts.fancy, 'yigo', JSON.stringify(doc.yigo.text));
}

// An explicit first baseline stays fixed when font sizes change; old top-edge layouts still work.
{
  const d=Engine.defaultDoc(); d.counts={title:0,fancy:0}; d.text='Latin\nཀ་'; d.flow=false;
  d.types.body.baseline=.5; d.types.body.top=.2;
  let r=Engine.run(d,measure); Engine.pageSvg(r.pages[0],d,measure,r.folioCount);
  const y=r.pages[0].boxes.T.y0+.5*72;
  assert(Math.abs(r.pages[0].lineBaselines[0]-y)<.001);
  d.textSize=40; r=Engine.run(d,measure); Engine.pageSvg(r.pages[0],d,measure,r.folioCount);
  assert(Math.abs(r.pages[0].lineBaselines[0]-y)<.001);
  assert(Math.abs(r.pages[0].lineBaselines[1]-y-d.types.body.lineHeight*72)<.001);
  assert.strictEqual(Documents.apply(Engine.defaultDoc(),Documents.artifact(d,'template'),Engine).types.body.baseline,.5);
  d.types.body.baseline=null; r=Engine.run(d,measure); Engine.pageSvg(r.pages[0],d,measure,r.folioCount);
  assert(Math.abs(r.pages[0].lineTops[0]-r.pages[0].boxes.T.y0-.2*72)<.001);
}

// Native page-type baseline is measured from the innermost box, not glyph top.
{
  const file=Buffer.from('.pxp\n[START NON-BODY]\n[END NON-BODY]\n[START TEMPLATE]\n[Type_0]\nPageType=Body\nBaseLineAdj=0.375\nInBoxEn=1\nInBox=0.2\n[END TEMPLATE]\nLatin','latin1');
  const d=Pxp.load(file,'pxp',TABLE,Engine.defaultDoc(),Engine).doc; d.counts={title:0,fancy:0};
  assert.strictEqual(d.types.body.baseline,.375);
  const r=Engine.run(d,measure); Engine.pageSvg(r.pages[0],d,measure,r.folioCount);
  assert(Math.abs(r.pages[0].lineBaselines[0]-r.pages[0].boxes.T.y0-.375*72)<.001);
}

console.log('ok');
