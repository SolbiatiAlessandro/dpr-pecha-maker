// Interface: holds one document, writes form changes into it, and redraws the pages.
const STORE_KEY = 'dpr-pecha-maker-doc-v1';
const $ = id => document.getElementById(id);
const PAPERS = { A4: [11.69, 8.27], A3: [16.54, 11.69], Letter: [11, 8.5], Legal: [14, 8.5], Custom: null };
const SIDES = [['title.front', 'Title, front'], ['title.back', 'Title, back'], ['fancy.front', 'Fancy, front'], ['fancy.back', 'Fancy, back'], ['body.front', 'Body, front'], ['body.back', 'Body, back']];
const FONTS = ['Jomolhari', 'Noto Serif Tibetan'];
const YIGOS = ['༄༅༅། །', '༄༅། །', '༆༅། །', '༄༅༅།', '༄༅།'];

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
  fill($('printFields'), [
    { path: 'print.sides', label: 'What to print', type: 'select', wide: true, options: [['duplex', 'Both sides, for a two-sided printer'], ['fronts', 'Fronts only (first pass)'], ['backs', 'Backs only (second pass)'], ['sequence', 'Page order, one side only']], onChange: updatePrintHelp },
    { path: 'print.cutMarks', label: 'Print cut marks', type: 'check' },
    { path: 'print.stack', label: 'Keep order when the whole stack is cut at once', type: 'check' },
  ]);
  updatePrintHelp();
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

function updatePrintHelp() {
  const edge = doc.paper.w >= doc.paper.h ? 'long edge' : 'short edge';
  const size = `${doc.paper.w} × ${doc.paper.h} in`;
  const text = {
    duplex: `In the print dialog choose two-sided printing, flip on ${edge}, scale 100%, no margins, paper ${size}. Each folio then reads by flipping it up.`,
    fronts: `Print these first at scale 100%, then turn the stack over and turn it around so the bottom edge feeds first, and print Backs only.`,
    backs: `Load the printed fronts turned over and turned around, so the bottom edge feeds first. Rows run in reverse so each back lands behind its front.`,
    sequence: `Pages print in order on single sheets. Use this to proof the text.`,
  };
  $('printHelp').textContent = text[doc.print.sides];
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
    sheets.slice(0, PREVIEW_PAGES).forEach((s, i) => leaf(`Sheet side ${i + 1} of ${sheets.length} · ${s.side === 'seq' ? 'pages in order' : s.side}`, Engine.sheetSvg(s, doc, measure, res.folioCount, true), true));
  }
  if (total > PREVIEW_PAGES) {
    const more = document.createElement('p');
    more.className = 'more';
    more.textContent = `Showing the first ${PREVIEW_PAGES} of ${total}. Printing includes all of them.`;
    frag.append(more);
  }
  host.replaceChildren(frag);
  const paperSheets = doc.print.sides === 'duplex' ? Math.ceil(sheets.length / 2) : sheets.length;
  $('stats').textContent = `${res.pages.length} pages · ${res.folioCount} folios · ${paperSheets} ${paperSheets === 1 ? 'sheet' : 'sheets'} of ${doc.paper.name === 'Custom' ? 'paper' : doc.paper.name}`;
  $('warn').textContent = Engine.fits(doc) ? '' : `${doc.pecha.perSheet} pecha at ${doc.pecha.height} in need ${(doc.pecha.perSheet * doc.pecha.height).toFixed(2)} in, and the sheet is ${doc.paper.h} in tall.`;
  $('pageStyle').textContent = `@page { size: ${doc.paper.w}in ${doc.paper.h}in; margin: 0; }`;
  updatePrintHelp();
  persist();
}

function buildPrint() {
  const res = latest || Engine.run(doc, measure);
  const html = Engine.impose(doc, res.pages).map(s => `<div class="sheet-print" style="width:${doc.paper.w}in;height:${doc.paper.h}in">${Engine.sheetSvg(s, doc, measure, res.folioCount, false)}</div>`).join('');
  $('printRoot').innerHTML = html;
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
}

function showStart(message, bad) {
  $('work').hidden = true;
  $('start').hidden = false;
  startStatus(message || '', bad);
  $('resume').hidden = !restore();
}

function startStatus(message, bad) {
  const s = $('startStatus');
  s.textContent = message;
  s.classList.toggle('bad', !!bad);
}

function setDoc(d, sample, src = null) {
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
  try {
    const result = await PdfRead.read(buf, LEGACY_TABLE, (n, total, stage) => {
      if (stage === 'load') startStatus('Parts of this PDF’s text are missing, so its pages will also be read as images. Loading the Tibetan reader…');
      else startStatus(stage === 'ocr' ? `Reading the image of page ${n} of ${total}…` : `Reading page ${n} of ${total}…`);
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
  $('printBtn').addEventListener('click', () => {
    buildPrint();
    if (!Engine.fits(doc)) toast('The pecha do not fit on this sheet. Reduce the height or the number per sheet.');
    window.print();
  });
  window.addEventListener('beforeprint', buildPrint);
  const params = new URLSearchParams(location.search);
  setView('pages', true);
  if (params.has('sample')) setDoc(sampleDoc(), true); else showStart();
  if (params.has('sheets')) setView('sheets');
  if (params.has('print')) buildPrint();
}

function setView(v, quiet) {
  view = v;
  segment($('viewSeg'), [['pages', 'Pages'], ['sheets', 'Print sheets']], view, x => setView(x));
  if (!quiet && doc) render();
}

Promise.all(['Jomolhari', 'Noto Serif Tibetan'].map(f => document.fonts.load(`20px "${f}"`, 'ཀ'))).catch(() => {}).then(init);
