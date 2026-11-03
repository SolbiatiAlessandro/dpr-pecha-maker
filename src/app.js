// Interface: holds one document, writes form changes into it, and redraws the pages.
const STORE_KEY = 'dpr-pecha-maker-doc-v1';
const $ = id => document.getElementById(id);
const PAPERS = { A4: [11.69, 8.27], A3: [16.54, 11.69], Letter: [11, 8.5], Legal: [14, 8.5], Custom: null };
const SIDES = [['title.front', 'Title, front'], ['title.back', 'Title, back'], ['fancy.front', 'Fancy, front'], ['fancy.back', 'Fancy, back'], ['body.front', 'Body, front'], ['body.back', 'Body, back']];
const FONTS = ['Jomolhari', 'Noto Serif Tibetan'];
const YIGOS = ['༄༅༅། །', '༄༅། །', '༆༅། །', '༄༅༅།', '༄༅།'];

const PRINT_MODES = [['duplex', 'Two-sided printer'], ['manual', 'One side at a time'], ['sequence', 'Proof copy']];

const PREVIEW_PAGES = 24;

let doc, view = 'pages', currentType = 'body', noteSide = 'body.front', isSample = false, latest = null;
let source = null;   // the PDF behind this document: { name, result }

// ---------- measuring ----------

const ctx = document.createElement('canvas').getContext('2d');
const widths = new Map(), heads = new Map();
const BASE = 200;

function measure(s, f) {
  const key = `${f.family}|${f.weight}|${f.italic}|${s}`;
  let w = widths.get(key);
  if (w === undefined) {
    ctx.font = `${f.italic ? 'italic ' : ''}${f.weight} ${BASE}px ${f.family}`;
    w = ctx.measureText(s.replace(//g, '།')).width / BASE;
    widths.set(key, w);
  }
  return w * f.size;
}

measure.head = (d, size, tibetan = true) => {
  const key = d.font + tibetan;
  let h = heads.get(key);
  if (!h) {
    ctx.font = `400 ${BASE}px ${d.font}`;
    const a = ctx.measureText(tibetan ? 'ཀ' : 'H'), b = ctx.measureText(tibetan ? 'ཀྱུ' : 'g');
    h = { a: a.actualBoundingBoxAscent / BASE, d: b.actualBoundingBoxDescent / BASE };
    heads.set(key, h);
  }
  return { ascent: h.a * size, descent: h.d * size, height: (h.a + h.d) * size };
};

// ---------- form helpers ----------

// Note sets are keyed "body.front", so a path writes that key as "body|front".
const pathKeys = p => p.split('.').map(k => k.replace('|', '.'));
const getPath = p => pathKeys(p).reduce((o, k) => o[k], doc);
function setPath(p, v) {
  const keys = pathKeys(p), last = keys.pop();
  keys.reduce((o, k) => o[k], doc)[last] = v;
}

function field(host, def) {
  const id = 'f_' + def.path.replace(/\W/g, '_');
  const wrap = document.createElement(def.type === 'check' ? 'label' : 'div');
  wrap.className = def.type === 'check' ? 'check' : 'field';
  if (def.wide || def.type === 'check') { wrap.style.gridColumn = '1 / -1'; }
  let el;
  if (def.type === 'check') {
    el = document.createElement('input'); el.type = 'checkbox'; el.id = id;
    el.checked = !!getPath(def.path);
    const span = document.createElement('span'); span.textContent = def.label;
    wrap.append(el, span);
  } else {
    const lab = document.createElement('label'); lab.htmlFor = id; lab.textContent = def.label;
    if (def.type === 'select') {
      el = document.createElement('select');
      for (const [v, t] of def.options) { const o = document.createElement('option'); o.value = v; o.textContent = t; el.append(o); }
      el.value = String(getPath(def.path));
    } else {
      el = document.createElement('input');
      el.type = def.type || 'number';
      if (def.step) el.step = def.step;
      if (def.min !== undefined) el.min = def.min;
      if (def.max !== undefined) el.max = def.max;
      const v = getPath(def.path);
      el.value = v === null ? '' : v;
      if (def.placeholder) el.placeholder = def.placeholder;
      if (def.tibetan) { el.classList.add('tib'); el.lang = 'bo'; }
    }
    el.id = id;
    wrap.append(lab, el);
  }
  el.addEventListener(def.type === 'select' || def.type === 'check' ? 'change' : 'input', () => {
    let v;
    if (def.type === 'check') v = el.checked;
    else if (def.type === 'select') v = def.number ? +el.value : el.value;
    else if (el.type === 'number') v = el.value === '' ? (def.nullable ? null : getPath(def.path)) : +el.value;
    else v = el.value;
    setPath(def.path, v);
    if (def.onChange) def.onChange(v);
    schedule();
  });
  host.append(wrap);
}

function fill(host, defs) {
  host.replaceChildren();
  defs.forEach(d => field(host, d));
}

function segment(host, options, active, onPick) {
  host.replaceChildren();
  for (const [v, t] of options) {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = t; b.setAttribute('aria-pressed', String(v === active));
    b.addEventListener('click', () => onPick(v));
    host.append(b);
  }
}

// ---------- panels ----------

function buildPanels() {
  $('text').value = doc.text;
  $('flow').checked = doc.flow;
  fill($('paperFields'), [
    { path: 'paper.name', label: 'Paper', type: 'select', options: Object.keys(PAPERS).map(k => [k, k]), onChange: v => { if (PAPERS[v]) { [doc.paper.w, doc.paper.h] = PAPERS[v]; buildPanels(); } } },
    { path: 'pecha.perSheet', label: 'Pecha per sheet', step: 1, min: 1, max: 8 },
    { path: 'fontName', label: 'Typeface', type: 'select', wide: true, options: FONTS.map(f => [f, f]), onChange: v => { doc.font = `'${v}','Noto Serif Tibetan',serif`; } },
    { path: 'paper.w', label: 'Sheet width, in', step: 0.01, min: 3, onChange: () => { doc.paper.name = 'Custom'; } },
    { path: 'paper.h', label: 'Sheet height, in', step: 0.01, min: 2, onChange: () => { doc.paper.name = 'Custom'; } },
    { path: 'pecha.height', label: 'Pecha height, in', step: 0.05, min: 0.5 },
    { path: 'margins.left', label: 'Left and right margin, in', step: 0.05, min: 0, onChange: v => { doc.margins.right = v; } },
    { path: 'pecha.dlt', label: 'Double line gap, in', step: 0.005, min: 0 },
  ]);
  fill($('orderFields'), [
    { path: 'counts.title', label: 'Title pages', step: 1, min: 0 },
    { path: 'counts.fancy', label: 'Fancy pages', step: 1, min: 0 },
  ]);
  buildTypePanel();
  fill($('yigoFields'), [
    { path: 'yigo.enabled', label: 'Add a yi-go on the front of each folio', type: 'check' },
    { path: 'yigo.text', label: 'Yi-go', type: 'select', options: [...new Set([doc.yigo.text, ...YIGOS])].map(y => [y, y]), wide: true },
    { path: 'yigo.fancyStart', label: 'Start on the first Fancy page', type: 'check' },
    { path: 'yigo.title2', label: 'Also on Title pages after the first', type: 'check' },
  ]);
  fill($('shadFields'), [
    { path: 'shad.enabled', label: 'Convert the shad after a line’s first syllable', type: 'check' },
    { path: 'shad.yang', label: 'Convert the second shad as well', type: 'check' },
    { path: 'shad.ignoreYigo', label: 'Convert on lines that start with a yi-go', type: 'check' },
    { path: 'shad.titlePages', label: 'Convert on Title pages', type: 'check' },
  ]);
  fill($('dzogFields'), [
    { path: 'dzog.enabled', label: 'Draw the dzog thik under the last lines', type: 'check' },
    { path: 'dzog.rise', label: 'Gap before it rises, in', step: 0.01, min: 0 },
  ]);
  fill($('folioFields'), [
    { path: 'folio.start', label: 'First folio (0 hides them)', step: 1, min: 0 },
    { path: 'folio.size', label: 'Size, pt', step: 1, min: 6 },
    { path: 'folio.inset', label: 'Inset from box, in', step: 0.01, min: 0 },
    { path: 'folio.onTitle', label: 'Show on Title pages', type: 'check' },
    { path: 'folio.jyon', label: 'Add བྱོན། to the last folio', type: 'check' },
    { path: 'folio.rhino', label: 'Same phrase on every folio (seru)', type: 'text', wide: true, tibetan: true },
  ]);
  fill($('pageNumFields'), [
    { path: 'pageNum.on', label: 'Show page numbers', type: 'check' },
    { path: 'pageNum.start', label: 'First page', step: 1, min: 0 },
    { path: 'pageNum.size', label: 'Size, pt', step: 1, min: 5 },
    { path: 'pageNum.onTitle', label: 'Show on Title pages', type: 'check' },
  ]);
  const ns = $('noteSide');
  ns.replaceChildren(...SIDES.map(([v, t]) => { const o = document.createElement('option'); o.value = v; o.textContent = t; return o; }));
  ns.value = noteSide;
  buildNotePanel();
  buildPrintPanel();
}

function buildPrintPanel() {
  segment($('modeSeg'), PRINT_MODES, doc.print.sides, v => { doc.print.sides = v; buildPrintPanel(); schedule(); });
  const manual = doc.print.sides === 'manual', proof = doc.print.sides === 'sequence';
  fill($('printFields'), [
    ...(proof ? [] : [
      { path: 'print.firstOnly', label: 'Only sheet 1, to test the printer', type: 'check' },
      { path: 'print.turnBacks', label: 'Turn the backs upside down', type: 'check' },
    ]),
    ...(manual ? [{ path: 'print.reverseBacks', label: 'Print the backs in reverse sheet order', type: 'check' }] : []),
    { path: 'print.cutMarks', label: 'Cut marks and sheet numbers', type: 'check' },
    ...(proof ? [] : [{ path: 'print.stack', label: 'Keep order when the whole stack is cut at once', type: 'check' }]),
  ]);
  updatePrintSteps();
}

function buildTypePanel() {
  segment($('typeSeg'), [['title', 'Title'], ['fancy', 'Fancy'], ['body', 'Body']], currentType, v => { currentType = v; buildTypePanel(); });
  const p = `types.${currentType}`;
  fill($('typeFields'), [
    { path: `${p}.lines`, label: 'Lines per page', step: 1, min: 1, max: 14 },
    { path: `${p}.fontSize`, label: 'Text size, pt', step: 1, min: 8 },
    { path: `${p}.lineHeight`, label: 'Line height, in', step: 0.01, min: 0.1 },
    { path: `${p}.top`, label: 'Box to first line, in', step: 0.01, min: 0, nullable: true, placeholder: 'centred' },
    { path: `${p}.side`, label: 'Box to text, in', step: 0.01, min: 0 },
    { path: `${p}.style`, label: 'Box lines', type: 'select', options: [['double', 'Double'], ['single', 'Single'], ['none', 'None']] },
    { path: `${p}.sideOut`, label: 'Outer side box, in', step: 0.02, min: 0 },
    { path: `${p}.sideIn`, label: 'Inner side box, in', step: 0.02, min: 0 },
    { path: `${p}.insideOn`, label: 'Use an inside box', type: 'check' },
    { path: `${p}.inside`, label: 'Inside box inset, in', step: 0.02, min: 0 },
    { path: `${p}.squeezeOn`, label: 'Squeeze the outside box', type: 'check' },
    { path: `${p}.squeeze`, label: 'Squeeze amount, in', step: 0.02, min: 0 },
    { path: `${p}.color`, label: 'Line colour', type: 'color' },
  ]);
}

function buildNotePanel() {
  const base = `notes.sets.${noteSide.replace('.', '|')}`;
  const slot = (key, label) => [
    { path: `${base}.${key}.text`, label, type: 'text', wide: true, tibetan: true, onChange: v => { getPath(`${base}.${key}`).on = !!v; } },
    { path: `${base}.${key}.size`, label: 'Size, pt', step: 1, min: 5 },
    { path: `${base}.${key}.inset`, label: 'Inset, in', step: 0.01, min: 0 },
  ];
  fill($('noteFields'), [
    ...slot('inL', 'Inside left, top'), ...slot('inB', 'Inside left, bottom'), ...slot('inR', 'Inside right'),
    ...slot('outL', 'Outside left'), ...slot('outR', 'Outside right'),
    { path: 'notes.outLeft', label: 'Space outside left, in', step: 0.02, min: 0 },
    { path: 'notes.outRight', label: 'Space outside right, in', step: 0.02, min: 0 },
  ]);
}

// A pecha leaf is read by turning it over its top edge, away from the reader. The steps below get each back
// printed the right way up behind its front, on a two-sided printer or in two runs through a one-sided one.
function updatePrintSteps() {
  const res = latest;
  if (!res || !doc) return;
  const mode = doc.print.sides;
  const all = Math.ceil(res.folioCount / doc.pecha.perSheet);
  const n = doc.print.firstOnly ? Math.min(1, all) : all;
  const count = `${n} ${n === 1 ? 'sheet' : 'sheets'}`;
  const edge = doc.paper.w >= doc.paper.h ? 'long' : 'short';
  const paper = doc.paper.name === 'Custom' ? `${doc.paper.w} × ${doc.paper.h} in` : doc.paper.name;
  const setup = `Paper ${paper}, scale 100%, margins none.`;
  const check = 'Then turn sheet 1 over its top edge, the way you turn a pecha leaf. Page 2 should be the right way up behind page 1.';
  const html = {
    duplex: `<ol class="steps">
      <li><button class="btn primary" type="button" data-pass="duplex">Print both sides</button>
        <p>${count}. In the print dialog turn on two-sided printing and choose <b>flip on ${edge} edge</b> (on a Mac: Two-Sided, ${edge === 'long' ? 'Long' : 'Short'}-Edge binding). ${setup}</p></li>
      <li><p>${check}</p></li>
    </ol>
    <p class="hint">Save as PDF in the same dialog gives a file a print shop can print two-sided, flipped on the ${edge} edge.</p>`,
    manual: `<ol class="steps">
      <li><button class="btn primary" type="button" data-pass="fronts">Print the fronts</button><p>${count}, one side. ${setup}</p></li>
      <li><p><b>Turn the printed stack over its top edge</b>, the way you turn a pecha leaf, so the two ends stay where they are. Keep the sheets in order. Put them back in the tray with the blank side facing the way fresh paper goes in, and the end that came out first going in first.</p></li>
      <li><button class="btn primary" type="button" data-pass="backs">Print the backs</button><p>${check}</p></li>
    </ol>
    <p class="hint">Printers feed paper differently, so try one sheet first. If the backs come out upside down, tick <i>Turn the backs upside down</i>. If a back lands on the wrong sheet, tick <i>Print the backs in reverse sheet order</i>.</p>`,
    sequence: `<ol class="steps"><li><button class="btn primary" type="button" data-pass="sequence">Print a proof</button>
      <p>Pages in reading order on one side of the paper, for checking the text. This copy cannot be cut into a pecha.</p></li></ol>`,
  };
  $('printSteps').innerHTML = html[mode] || html.duplex;
  $('flipFig').hidden = mode === 'sequence';
  if (mode !== 'sequence') $('flipFig').innerHTML = flipFigure(res);
}

// Sheet 1 front and back as small diagrams, each folio in its own colour, so the reversed backs make sense.
function flipFigure(res) {
  const [front, back] = Engine.impose(doc, res.pages, { pass: 'duplex', firstOnly: true });
  if (!front || !back) return '';
  const rows = doc.pecha.perSheet, rowH = 15, W = 104, H = rows * rowH + 8, gap = 64;
  const tints = ['#ecc978', '#a9c2d3', '#eaa58f', '#b3cfa8', '#d5c4ea', '#f1bccb', '#bfe3de', '#f2d8a7'];
  const pages = s => s.slots.filter(Boolean).map(p => p.n).join(', ');
  const sheet = (s, x0, label) => {
    let g = `<rect x="${x0 + 0.5}" y="0.5" width="${W - 1}" height="${H - 1}" fill="#fff" stroke="#b9ab94"/>`;
    s.slots.forEach((p, r) => {
      if (!p) return;
      const y = 4 + r * rowH;
      g += `<rect x="${x0 + 6}" y="${y + 2}" width="${W - 12}" height="${rowH - 4}" fill="${tints[(Math.ceil(p.n / 2) - 1) % tints.length]}"/>`;
      g += `<text x="${x0 + W / 2}" y="${y + rowH / 2 + 4}" text-anchor="middle">page ${p.n}</text>`;
    });
    return g + `<text x="${x0 + W / 2}" y="${H + 15}" text-anchor="middle" class="cap">${label}</text>`;
  };
  const ax = W + 8, bx = W + gap - 8;
  return `<svg viewBox="0 0 ${2 * W + gap} ${H + 22}" role="img" aria-label="Sheet 1 front holds pages ${pages(front)}. Its back holds pages ${pages(back)}, so each back sits behind its own front.">
    <defs><marker id="arrowHead" viewBox="0 0 8 8" refX="6" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L8 4L0 8z" fill="#7a6a58"/></marker></defs>
    ${sheet(front, 0, 'Sheet 1, front')}
    <path d="M${ax} ${H * 0.7} C${ax + 14} ${-4} ${bx - 14} ${-4} ${bx} ${H * 0.7}" fill="none" stroke="#7a6a58" stroke-width="1.3" marker-end="url(#arrowHead)"/>
    <text x="${W + gap / 2}" y="${H * 0.7 + 14}" text-anchor="middle" class="cap">turn over</text>
    ${sheet(back, W + gap, 'Back of sheet 1')}
  </svg>`;
}

// ---------- drawing ----------

let timer = null;
function schedule() {
  clearTimeout(timer);
  timer = setTimeout(render, 120);
}

function render() {
  const res = Engine.run(doc, measure);
  latest = res;
  const host = $('table');
  const frag = document.createDocumentFragment();
  const leaf = (tag, svg, sheet) => {
    const d = document.createElement('div');
    d.className = 'leaf' + (sheet ? ' sheet' : '');
    d.innerHTML = `<div class="tag">${tag}</div>${svg}`;
    frag.append(d);
  };
  const sheets = Engine.impose(doc, res.pages);
  const total = view === 'pages' ? res.pages.length : sheets.length;
  if (view === 'pages') {
    for (const p of res.pages.slice(0, PREVIEW_PAGES)) {
      const folio = Math.ceil(p.n / 2);
      leaf(`Page ${p.n} · ${p.kind} · folio ${folio} ${p.front ? 'front' : 'back'}`, Engine.pageSvg(p, doc, measure, res.folioCount));
    }
  } else {
    const of = sheets.filter(s => s.side !== 'back').length;
    const tag = s => (s.side === 'seq' ? `Proof sheet ${s.sheet} of ${of} · pages in order`
      : `Sheet ${s.sheet} of ${of} · ${s.side === 'front' ? 'front' : doc.print.turnBacks ? 'back, upside down for a printer that turns it' : 'back, as it reads once the sheet is turned over its top edge'}`);
    sheets.slice(0, PREVIEW_PAGES).forEach(s => leaf(tag(s), Engine.sheetSvg(s, doc, measure, res.folioCount, true), true));
  }
  if (total > PREVIEW_PAGES) {
    const more = document.createElement('p');
    more.className = 'more';
    more.textContent = `Showing the first ${PREVIEW_PAGES} of ${total}. Printing includes all of them.`;
    frag.append(more);
  }
  host.replaceChildren(frag);
  const paperSheets = sheets.filter(s => s.side !== 'back').length;
  $('stats').textContent = `${res.pages.length} pages · ${res.folioCount} folios · ${paperSheets} ${paperSheets === 1 ? 'sheet' : 'sheets'} of ${doc.paper.name === 'Custom' ? 'paper' : doc.paper.name}`;
  $('warn').textContent = Engine.fits(doc) ? '' : `${doc.pecha.perSheet} pecha at ${doc.pecha.height} in need ${(doc.pecha.perSheet * doc.pecha.height).toFixed(2)} in, and the sheet is ${doc.paper.h} in tall.`;
  $('pageStyle').textContent = `@page { size: ${doc.paper.w}in ${doc.paper.h}in; margin: 0; }`;
  updatePrintSteps();
  persist();
}

// pass: 'duplex', 'fronts', 'backs' or 'sequence'; left out, it follows the chosen way of printing.
function buildPrint(pass) {
  const res = latest || Engine.run(doc, measure);
  const sheets = Engine.impose(doc, res.pages, { pass, firstOnly: doc.print.firstOnly && pass !== 'sequence' && doc.print.sides !== 'sequence' });
  $('printRoot').innerHTML = sheets.map(s => `<div class="sheet-print" style="width:${doc.paper.w}in;height:${doc.paper.h}in">${Engine.sheetSvg(s, doc, measure, res.folioCount, false)}</div>`).join('');
}

let printPass = null;
function printNow(pass) {
  if (!Engine.fits(doc)) toast('The pecha do not fit on this sheet. Reduce the height or the number per sheet.');
  printPass = pass;
  buildPrint(pass);
  window.print();
}

function openPrintPanel() {
  document.querySelector('.tabs button[data-tab="print"]').click();
  const pane = document.querySelector('[data-pane="print"]');
  if (matchMedia('(max-width: 860px)').matches) pane.scrollIntoView({ block: 'start', behavior: 'smooth' });
  const first = pane.querySelector('[data-pass]');
  if (first) first.focus({ preventScroll: true });
}

// ---------- storage and files ----------

function persist() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify({ doc, isSample })); } catch (e) { /* private window: nothing to keep */ }
}

function restore() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY));
    if (s && s.doc && s.doc.version === 1) return s;
  } catch (e) { /* fall through to the sample */ }
  return null;
}

function sampleDoc() {
  const d = Engine.defaultDoc();
  d.text = SAMPLE_TEXT;
  for (const k of ['fancy.front', 'body.front']) d.notes.sets[k].inL = Engine.noteSlot(SAMPLE_SHORT_TITLE, 10, 0.09);
  return d;
}

function toast(msg) {
  const t = $('toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { t.hidden = true; }, 4200);
}

function showWork() {
  $('start').hidden = true;
  $('work').hidden = false;
  startProgress();
}

function showStart(message, bad) {
  $('work').hidden = true;
  $('start').hidden = false;
  startStatus(message || '', bad);
  startProgress();
  $('resume').hidden = !restore();
  drawFlags();
}

function startStatus(message, bad) {
  const s = $('startStatus');
  s.textContent = message;
  s.classList.toggle('bad', !!bad);
}

// part: 0 to 1, null while the length is unknown, left out to hide the bar.
function startProgress(part) {
  const bar = $('startProgress');
  bar.hidden = part === undefined;
  bar.classList.toggle('wait', part === null);
  if (typeof part === 'number') {
    const pct = Math.round(Math.max(0, Math.min(1, part)) * 100);
    bar.firstElementChild.style.width = `${pct}%`;
    bar.setAttribute('aria-valuenow', pct);
  } else bar.removeAttribute('aria-valuenow');
}

// A string of prayer flags across the top of the opening screen, in their order: sky, wind, fire, water, earth.
function drawFlags() {
  const svg = $('flags'), W = Math.max(320, Math.round($('start').clientWidth || innerWidth));
  if (svg.dataset.w === String(W)) return;
  const colours = ['#2c68b0', '#f3efe4', '#c43d2b', '#2d8650', '#e3b22d'];
  const N = Math.max(9, Math.round(W / 38)), D = Math.min(24, W * 0.02), top = 3, fw = (W / N) * 0.8, fh = 25;
  let out = `<path d="M0 ${top} Q${W / 2} ${top + 2 * D} ${W} ${top}" fill="none" stroke="#b7a98f" stroke-width="1"/>`;
  for (let i = 0; i < N; i++) {
    const t = (i + 0.5) / N, x = t * W, y = top + 4 * D * t * (1 - t);
    const angle = Math.atan(4 * D * (1 - 2 * t) / W) * 180 / Math.PI;
    const ink = `M${-fw / 2 + 4} 9h${fw - 8}M${-fw / 2 + 4} 13h${fw - 8}M${-fw / 2 + 4} 17h${fw - 14}`;
    out += `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${angle.toFixed(2)})"><rect x="${-fw / 2}" y="0" width="${fw}" height="${fh}" fill="${colours[i % 5]}"/><path d="${ink}" stroke="rgba(30,20,10,.22)" stroke-width="1"/></g>`;
  }
  svg.setAttribute('viewBox', `0 0 ${W} ${top + D + fh + 4}`);
  svg.innerHTML = out;
  svg.dataset.w = String(W);
}

function setDoc(d, sample, src = null) {
  d.print = { ...Engine.defaultDoc().print, ...d.print };
  if (d.print.sides === 'fronts' || d.print.sides === 'backs') d.print.sides = 'manual';
  doc = d; isSample = sample; source = src;
  showWork();
  buildPanels();
  noteSample();
  render();
}

function noteSample() {
  const note = $('sampleNote');
  if (isSample) {
    note.innerHTML = 'Example text: Dorje Chang Tungma, Tibetan from <a href="https://www.lotsawahouse.org/tibetan-masters/bengar-jampal-zangpo/invoking-the-blessings" target="_blank" rel="noopener">Lotsawa House</a> (CC BY-NC). Replace it with your own text.';
  } else if (source) {
    const r = source.result;
    const pages = `${r.pageCount} ${r.pageCount === 1 ? 'page' : 'pages'}`;
    const fonts = r.legacyFonts.length ? ` Old Tibetan fonts were converted (${r.legacyFonts.join(', ')}), so check the text against the PDF.` : '';
    const filled = r.repaired === undefined ? '' : ` This PDF left gaps in its text. ${r.repaired} were filled from the page images and ${r.unrepaired} are marked □ for you to correct.`;
    note.textContent = r.ocr
      ? `Text read from images of ${source.name}, ${pages}, because the PDF has no reliable text. This reading makes mistakes, so check every line against the PDF.`
      : `Text read from ${source.name}, ${pages}.${fonts}${filled}`;
  } else {
    note.textContent = 'Your work stays in this browser. Use Save to keep a copy.';
  }
  $('otherWrap').hidden = !(source && source.result.hasOther);
  $('credits').textContent = 'DPR Pecha Maker is an independent web tool. It opens files made with PechaMaker by Frederick W. Johnson and is not affiliated with it. Typefaces: Jomolhari and Noto Serif Tibetan.';
}

function docFromPdf(result, keepOther) {
  const d = Engine.defaultDoc();
  d.text = PdfRead.compose(result.pages, keepOther).text;
  return d;
}

async function openPdf(file, buf) {
  startStatus(`Reading ${file.name}…`);
  startProgress(0);
  try {
    const result = await PdfRead.read(buf, LEGACY_TABLE, (n, total, stage, part) => {
      if (stage === 'load') {
        startStatus('This PDF’s text is incomplete or missing, so its pages will be read as images. Loading the Tibetan reader…');
        startProgress(null);
        return;
      }
      const says = { ocr: `Reading the image of page ${n} of ${total}…`, ocr2: `Taking a closer look at page ${n} of ${total}…` };
      startStatus(says[stage] || `Reading page ${n} of ${total}…`);
      startProgress(part);
    });
    if (result.scanned && !result.ocr) {
      showStart(`No readable Tibetan was found in ${file.name}. Paste the text instead.`, true);
      return;
    }
    if (!result.tibetan) {
      const fonts = result.otherFonts.slice(0, 4).join(', ');
      showStart(`No Tibetan text was found in ${file.name}.${fonts ? ` Its fonts are ${fonts}. If the Tibetan is in one of them, that font cannot be converted yet.` : ''}`, true);
      return;
    }
    $('keepOther').checked = false;
    setDoc(docFromPdf(result, false), false, { name: file.name, result });
    toast(result.ocr ? `Read ${file.name} from page images. Check the text against the PDF.` : `Read ${result.pageCount} ${result.pageCount === 1 ? 'page' : 'pages'} from ${file.name}.`);
  } catch (e) {
    const locked = e && e.name === 'PasswordException';
    showStart(locked ? `${file.name} is password protected. Remove the password and try again.` : `Could not read ${file.name}. The file may be damaged, or the page could not load its PDF reader.`, true);
  }
}

async function openFile(file) {
  const buf = new Uint8Array(await file.arrayBuffer());
  const name = file.name.toLowerCase();
  if (name.endsWith('.pdf') || file.type === 'application/pdf') return openPdf(file, buf);
  try {
    if (/\.px[pct]$/.test(name)) {
      const { doc: d, unknown } = Pxp.toDoc(buf, LEGACY_TABLE, Engine.defaultDoc(), Engine);
      setDoc(d, false);
      toast(unknown ? `Opened ${file.name}. ${unknown} characters use a font this page cannot convert yet.` : `Opened ${file.name} and converted it to Unicode.`);
    } else if (/\.(pecha|json)$/.test(name)) {
      setDoc(JSON.parse(new TextDecoder().decode(buf)), false);
      toast(`Opened ${file.name}.`);
    } else {
      const d = Engine.defaultDoc();
      d.text = new TextDecoder().decode(buf);
      setDoc(d, false);
      toast(`Opened ${file.name}.`);
    }
  } catch (e) {
    showStart(`Could not read ${file.name}. Use a PDF, or a .pxp, .pecha or .txt file.`, true);
  }
}

function saveFile() {
  const url = URL.createObjectURL(new Blob([JSON.stringify(doc, null, 1)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url; a.download = 'pecha.pecha';
  a.click();
  URL.revokeObjectURL(url);
  toast('Saved pecha.pecha to your downloads.');
}

// ---------- text helpers ----------

function insertAtCursor(s) {
  const t = $('text'), a = t.selectionStart, b = t.selectionEnd;
  t.setRangeText(s, a, b, 'end');
  t.focus();
  doc.text = t.value;
  schedule();
}

function wylieToTibetan(s) {
  try { return window.jsEWTS.fromWylie(s); } catch (e) { return ''; }
}

function init() {
  const codes = [['Centre', '{c}'], ['Justify', '{j}'], ['Left', '{l}'], ['Larger', '{30}'], ['Normal size', '{size}'], ['Red', '{#b03020}'], ['Black', '{color}'], ['New page', '{page}'], ['Fixed shad', '{hs}']];
  for (const [label, code] of codes) {
    const b = document.createElement('button');
    b.className = 'chip'; b.type = 'button'; b.textContent = label; b.title = `Inserts ${code}`;
    b.addEventListener('click', () => insertAtCursor(code));
    $('codes').append(b);
  }
  document.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('.tabs button').forEach(x => x.setAttribute('aria-selected', String(x === b)));
    document.querySelectorAll('.pane').forEach(p => { p.hidden = p.dataset.pane !== b.dataset.tab; });
    if (b.dataset.tab === 'print') setView('sheets');
  }));
  $('text').addEventListener('input', e => { doc.text = e.target.value; isSample = false; noteSample(); schedule(); });
  $('flow').addEventListener('change', e => { doc.flow = e.target.checked; schedule(); });
  $('noteSide').addEventListener('change', e => { noteSide = e.target.value; buildNotePanel(); });
  $('wylie').addEventListener('input', e => { $('wyliePreview').textContent = wylieToTibetan(e.target.value); });
  $('wylieInsert').addEventListener('click', () => {
    const s = wylieToTibetan($('wylie').value);
    if (s) insertAtCursor(s);
    $('wylie').value = ''; $('wyliePreview').textContent = '';
  });
  $('newDoc').addEventListener('click', () => showStart());
  $('openFile').addEventListener('change', e => { if (e.target.files[0]) openFile(e.target.files[0]); e.target.value = ''; });
  $('pasteText').addEventListener('click', () => { setDoc(Engine.defaultDoc(), false); $('text').focus(); });
  $('tryExample').addEventListener('click', () => setDoc(sampleDoc(), true));
  $('resume').addEventListener('click', () => { const s = restore(); if (s) setDoc(s.doc, s.isSample); });
  $('keepOther').addEventListener('change', e => { if (source) { const d = docFromPdf(source.result, e.target.checked); doc.text = d.text; $('text').value = d.text; schedule(); } });
  let depth = 0;
  window.addEventListener('dragenter', e => { e.preventDefault(); depth++; document.body.classList.add('dragging'); });
  window.addEventListener('dragleave', () => { depth = Math.max(0, depth - 1); if (!depth) document.body.classList.remove('dragging'); });
  window.addEventListener('dragover', e => e.preventDefault());
  window.addEventListener('drop', e => {
    e.preventDefault();
    depth = 0; document.body.classList.remove('dragging');
    const f = e.dataTransfer.files[0];
    if (f) { if (!$('start').hidden) openFile(f); else { showStart(); openFile(f); } }
  });
  $('saveDoc').addEventListener('click', saveFile);
  $('printBtn').addEventListener('click', openPrintPanel);
  $('printSteps').addEventListener('click', e => { const b = e.target.closest('[data-pass]'); if (b) printNow(b.dataset.pass); });
  // The browser's own print command prints both sides in one file, or the proof.
  window.addEventListener('beforeprint', () => { if (!printPass) buildPrint(doc.print.sides === 'sequence' ? 'sequence' : 'duplex'); });
  window.addEventListener('afterprint', () => {
    if (printPass === 'fronts') toast('Now turn the printed stack over its top edge, put it back in the tray, and print the backs.');
    printPass = null;
  });
  let resizing = null;
  window.addEventListener('resize', () => { clearTimeout(resizing); resizing = setTimeout(() => { if (!$('start').hidden) drawFlags(); }, 150); });
  const params = new URLSearchParams(location.search);
  setView('pages', true);
  if (params.has('sample')) setDoc(sampleDoc(), true); else showStart();
  if (params.has('sheets')) setView('sheets');
  if (params.has('print')) { printPass = params.get('print') || null; buildPrint(printPass || undefined); }
}

function setView(v, quiet) {
  view = v;
  segment($('viewSeg'), [['pages', 'Pages'], ['sheets', 'Print sheets']], view, x => setView(x));
  if (!quiet && doc) render();
}

Promise.all(['Jomolhari', 'Noto Serif Tibetan'].map(f => document.fonts.load(`20px "${f}"`, 'ཀ'))).catch(() => {}).then(init);
