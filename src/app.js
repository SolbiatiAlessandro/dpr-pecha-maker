// Interface: holds one document, writes form changes into it, and redraws the pages.
const STORE_KEY = 'dpr-pecha-maker-doc-v1';
const RECOVERY_PREF_KEY = 'dpr-pecha-maker-recovery-minutes';
const LOCKED_PREF_KEY = 'dpr-pecha-maker-locked-font';
let lockedPreferences = TextFormat.lockedSettings({}, Engine), applyingLocked = false, lockedComposition = null;
try {const saved=JSON.parse(localStorage.getItem(LOCKED_PREF_KEY));if(saved)lockedPreferences=TextFormat.lockedSettings(saved,Engine);} catch (_) {}
const DCT_PREF_KEY = 'dpr-pecha-maker-dct-import';
let dctPreferences = Dct.importSettings({}, Engine);
try { const saved = JSON.parse(localStorage.getItem(DCT_PREF_KEY)); if (saved) dctPreferences = Dct.importSettings(saved, Engine); } catch (_) {}
const recovery = new Recovery(value => localStorage.setItem(STORE_KEY, JSON.stringify(value)));
let recoveryMinutes = 0;
try { const value = Number(localStorage.getItem(RECOVERY_PREF_KEY)); if ([-1,0,1,5,10,30].includes(value)) recoveryMinutes = value; } catch (_) {}
recovery.configure(recoveryMinutes);
const $ = id => document.getElementById(id);
const PAPERS = { A4: [11.69, 8.27], A3: [16.54, 11.69], Letter: [11, 8.5], Legal: [14, 8.5], Custom: null };
const SIDES = [['title.front', 'Title, front'], ['title.back', 'Title, back'], ['fancy.front', 'Fancy, front'], ['fancy.back', 'Fancy, back'], ['body.front', 'Body, front'], ['body.back', 'Body, back']];
const FONTS = ['Jomolhari', 'Noto Serif Tibetan'];
const YIGOS = ['༄༅༅། །', '༄༅། །', '༆༅། །', '༄༅༅།', '༄༅།'];

const PRINT_MODES = [['duplex', 'Two-sided printer'], ['manual', 'One side at a time'], ['sequence', 'Proof copy']];

const PREVIEW_PAGES = 24;

let previewStart = 0, savedCheckpoint = null;
const characterFontHistory = new Map();
let doc, view = 'pages', currentType = 'body', noteSide = 'body.front', isSample = false, latest = null;
let source = null;   // the PDF behind this document: { name, result }
let sectionIndex = 0, imageId = '', storageWarningShown = false;
const editingText = () => doc.sections.length ? doc.sections[sectionIndex].text : doc.text;
function setEditingText(value) { if (doc.sections.length) doc.sections[sectionIndex].text = value; else doc.text = value; }

// ---------- measuring ----------

const ctx = document.createElement('canvas').getContext('2d');
const widths = new Map(), heads = new Map();
const BASE = 200;

function measure(s, f) {
  const kerning = f.kerning || (doc?.kerning === false ? 'none' : 'normal');
  const key = `${f.family}|${f.weight}|${f.italic}|${kerning}|${s}`;
  let w = widths.get(key);
  if (w === undefined) {
    ctx.font = `${f.italic ? 'italic ' : ''}${f.weight} ${BASE}px ${f.family}`;
    if ('fontKerning' in ctx) ctx.fontKerning = kerning;
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
      for (const [v, t, disabled] of def.options) { const o = document.createElement('option'); o.value = v; o.textContent = t; o.disabled = !!disabled; el.append(o); }
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
    if (def.suggestions) {
      const list = document.createElement('datalist'); list.id = id+'_choices';
      for (const value of def.suggestions) { const option = document.createElement('option'); option.value = value; list.append(option); }
      el.setAttribute('list',list.id); wrap.append(list);
    }
  }
  if (def.disabled) el.disabled = true;
  el.addEventListener(def.event || (def.type === 'select' || def.type === 'check' ? 'change' : 'input'), () => {
    let v;
    if (def.type === 'check') v = el.checked;
    else if (def.type === 'select') v = def.number ? +el.value : el.value;
    else if (el.type === 'number') v = el.value === '' ? (def.nullable ? null : getPath(def.path)) : +el.value;
    else v = el.value;
    if (el.type === 'number' && v !== null) {
      if (!Number.isFinite(v)) return;
      if (def.min !== undefined) v = Math.max(def.min, v);
      if (def.max !== undefined) v = Math.min(def.max, v);
      if (def.step === 1) v = Math.round(v);
    }
    setPath(def.path, v);
    if(def.path==='textSize')refreshLockedKeyboard();
    if (def.onChange) def.onChange(v);
    schedule();
  });
  host.append(wrap);
  if (def.richPaste) bindMarkPaste(el,def.path,def.richPaste);
}

function bindMarkPaste(el, textPath, {richPath,kind = 'note'}) {
  const label = kind === 'yigo' ? 'Yi-go' : kind === 'phrase' ? 'Fixed phrase' : 'Note';
  const states = new Map([[el.value,!!getPath(richPath)]]);
  const setRich = rich => {
    setPath(richPath,rich);
    const control = $('f_'+richPath.replace(/\W/g,'_'));
    if (control) control.checked = rich;
  };
  const remember = () => {
    states.set(el.value,!!getPath(richPath));
    if (states.size > 100) states.delete(states.keys().next().value);
  };
  el.addEventListener('input', event => {
    if (['historyUndo','historyRedo'].includes(event.inputType) && states.has(el.value)) setRich(states.get(el.value));
    remember();
  });
  for (const operation of ['copy','cut']) el.addEventListener(operation, event => {
    if (!$('copyFormatted').checked) return;
    if (!event.clipboardData) {
      if (operation === 'cut') { event.preventDefault(); toast('Clipboard unavailable; text was not cut.'); }
      return;
    }
    try {
      const font = kind === 'phrase' && doc.folio.font ? Engine.fontFamily(Engine.fontToken(doc.folio.font)) : doc.font;
      const result = Rtf.copyMark(doc,{text:el.value,rich:getPath(richPath),font},el.selectionStart,el.selectionEnd,Engine,TextFormat);
      if (result.empty) return;
      // Plain fields contain literal braces; only rich fields expand format-code boundaries.
      const removal = operation !== 'cut' ? null : getPath(richPath)
        ? TextFormat.removeRich(el.value,el.selectionStart,el.selectionEnd,Engine)
        : {start:el.selectionStart,end:el.selectionEnd,replacement:'',cursor:el.selectionStart};
      event.clipboardData.setData('text/rtf',result.rtf);
      event.clipboardData.setData('text/plain',result.plain);
      event.preventDefault();
      if (removal) {
        remember(); el.focus(); el.setSelectionRange(removal.start,removal.end);
        const edited = removal.replacement ? document.execCommand('insertText',false,removal.replacement) : document.execCommand('delete',false);
        if (!edited) el.setRangeText(removal.replacement,removal.start,removal.end,'end');
        setPath(textPath,el.value);
        if (kind === 'note') setPath(textPath.replace(/\.text$/,'.on'),!!el.value);
        remember(); el.setSelectionRange(removal.cursor,removal.cursor); schedule();
      }
    } catch (error) {
      if (operation === 'cut') event.preventDefault();
      toast('Could not '+operation+' formatted text: '+error.message);
    }
  });
  el.addEventListener('paste', event => {
    const rtf = event.clipboardData?.getData('text/rtf') || event.clipboardData?.getData('application/rtf');
    if (!rtf) return;
    event.preventDefault();
    try {
      const result = Rtf.insertMark(rtf,{rich:getPath(richPath),text:el.value},el.selectionStart,el.selectionEnd,Engine,LEGACY_TABLE,TextFormat,kind);
      reportImport(result.warnings);
      if (result.empty) { toast('The pasted RTF contains no supported text for this field.'); return; }
      remember(); setRich(true);
      el.focus(); el.setSelectionRange(result.start,result.end);
      if (!document.execCommand('insertText',false,result.replacement)) el.setRangeText(result.replacement,result.start,result.end,'end');
      setPath(textPath,el.value);
      if (kind === 'note') setPath(textPath.replace(/\.text$/,'.on'),!!el.value);
      remember();
      el.setSelectionRange(result.cursor,result.cursor); schedule();
      toast(result.warnings.length ? label+' pasted. Review the import notes.' : label+' pasted; existing size settings kept.');
    } catch (error) { toast('Could not paste RTF: '+error.message); }
  });
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

function refreshSelectionFonts() {
  const select = $('selectionFont'), current = select.value;
  select.replaceChildren(...[['','Keep fonts'], ...TextFormat.fontChoices(doc,Engine), ['custom','Other font…']].map(([value,label]) => {
    const option = document.createElement('option'); option.value = value; option.textContent = label; return option;
  }));
  select.value = [...select.options].some(o => o.value === current) ? current : '';
  $('selectionFontName').hidden = $('selectionFontNameLabel').hidden = select.value !== 'custom';
}

function buildPanels() {
  refreshSelectionFonts();
  buildImagePanel();
  $('text').value = editingText();
  buildSectionPanel();
  $('flow').checked = doc.flow;
  $('orientation').value = doc.paper.w >= doc.paper.h ? 'landscape' : 'portrait';
  fill($('textFields'), [
    { path: 'textSize', label: 'All main text, pt (blank keeps individual sizes)', step: 1, min: 5, max: 200, nullable: true, wide: true, placeholder: 'individual sizes' },
    { path: 'tabWidth', label: 'Tab stops, in', step: 0.05, min: 0.05, max: 20 },
    { path: 'kerning', label: 'Apply font kerning', type: 'check', disabled: !('fontKerning' in ctx) },
    { path: 'tibetanRaise', label: 'Raise Tibetan, in', step: 0.01, min: -2, max: 2 },
  ]);
  buildRolePanel();
  fill($('displayFields'), [
    {path:'display.baselines',label:'Show baseline guides',type:'check'},
    {path:'display.compact',label:'Compact page view (turn off to print)',type:'check',disabled:doc.pecha.mode===false},
    {path:'display.hintColors',label:'Colour boxes by page type on screen',type:'check'},
  ]);
  fill($('paperFields'), [
    {path:'pecha.mode',label:'Pecha mode (turn off for full pages)',type:'check',onChange:buildPanels},
    ...(doc.pecha.mode === false ? [
      {path:'normal.lineHeight',label:'Full-page line height, in',min:.05,max:10,step:.01},
      {path:'normal.baseline',label:'Full-page first baseline below top margin, in',min:0,max:10,step:.01},
    ] : []),
    { path: 'paper.name', label: 'Paper', type: 'select', options: Object.keys(PAPERS).map(k => [k, k]), onChange: v => { if (PAPERS[v]) { [doc.paper.w, doc.paper.h] = PAPERS[v]; buildPanels(); } } },
    { path: 'pecha.perSheet', disabled: doc.pecha.mode === false, label: 'Pecha per sheet', step: 1, min: 1, max: 8, onChange: v => { if (v > 1) { doc.pecha.placement = 'center'; $('f_pecha_placement').value = 'center'; } } },
    { path: 'pecha.placement', disabled: doc.pecha.mode === false, label: 'Vertical placement', type: 'select', wide: true, options: [['center', 'Centered between margins'], ['top', 'Single pecha at top margin']], onChange: v => { if (v === 'top') { doc.pecha.perSheet = 1; buildPanels(); } } },
    { path: 'fontName', label: 'Typeface', type: 'select', wide: true, options: FONTS.map(f => [f, f]), onChange: v => { doc.font = `'${v}','Noto Serif Tibetan',serif`; } },
    { path: 'paper.w', label: 'Sheet width, in', step: 0.01, min: 3, onChange: () => { doc.paper.name = 'Custom'; } },
    { path: 'paper.h', label: 'Sheet height, in', step: 0.01, min: 2, onChange: () => { doc.paper.name = 'Custom'; } },
    { path: 'pecha.height', disabled: doc.pecha.mode === false, label: 'Pecha height, in', step: 0.05, min: 0.5 },
    { path: 'margins.left', label: 'Left margin, in', step: 0.05, min: 0 },
    { path: 'margins.right', label: 'Right margin, in', step: 0.05, min: 0 },
    { path: 'margins.top', label: 'Top margin, in', step: 0.05, min: 0 },
    { path: 'margins.bottom', label: 'Bottom margin, in', step: 0.05, min: 0 },
    { path: 'pecha.dlt', label: 'Double line gap, in', step: 0.005, min: 0 },
  ]);
  fill($('orderFields'), [
    { path: 'counts.title', label: 'Title pages', step: 1, min: 0 },
    { path: 'counts.fancy', label: 'Fancy pages', step: 1, min: 0 },
  ]);
  buildTypePanel();
  fill($('yigoFields'), [
    { path: 'yigo.image', label: 'Yi-go source', type: 'select', wide: true, options: [['', 'Text yi-go'], ...doc.images.filter(p => p.kind === 'yigo').map((p, i) => [p.id, `Image ${i + 1}`])] },
    { path: 'yigo.enabled', label: 'Add a yi-go on the front of each folio', type: 'check' },
    { path: 'yigo.text', label: 'Yi-go text and formatting marks', type: 'text', wide: true, tibetan: true, suggestions: YIGOS, richPaste: {richPath:'yigo.rich',kind:'yigo'} },
    { path: 'yigo.rich', label: 'Use formatting marks in custom yi-go', type: 'check' },
    { path: 'yigo.ignoreColor', label: 'Match yi-go colour to the first character', type: 'check' },
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
    { path: 'dzog.percentEnabled', label: 'Position rise by percentage of remaining whitespace', type: 'check' },
    { path: 'dzog.rise', label: 'Distance past final character, in', step: 0.01, min: 0 },
    { path: 'dzog.percent', label: 'Remaining whitespace, %', step: 1, min: 0, max: 100 },
    { path: 'dzog.leftUp', label: 'Raise left segment, in', step: .01, min: 0, max: 2 },
    { path: 'dzog.rightUp', label: 'Raise right segment, in', step: .01, min: 0, max: 2 },
  ]);
  fill($('folioFields'), [
    { path: 'folio.start', label: 'First folio (0 hides numbers)', step: 1, min: 0 },
    { path: 'folio.font', label: 'Folio font', type: 'select', wide: true, options: [['', 'Use document font'], ...FONTS.map(f => [f, f])] },
    { path: 'folio.size', label: 'Size, pt', step: 1, min: 6 },
    { path: 'folio.inset', label: 'Inset from box, in', step: 0.01, min: 0 },
    { path: 'folio.onTitle', label: 'Show folio numbers on Title pages', type: 'check' },
    { path: 'folio.angle', label: 'Folio label rotation', type: 'select', number: true, wide: true, options: [[-90, '90° counterclockwise'], [90, '90° clockwise'], [0, 'Horizontal']] },
    { path: 'folio.jyon', label: 'Add བྱོན། to the last folio', type: 'check' },
    { path: 'folio.rhinoEnabled', label: 'Use a fixed phrase on every folio front, including Title pages', type: 'check' },
    { path: 'folio.rhino', label: 'Fixed phrase (seru / rhino)', type: 'text', wide: true, tibetan: true, richPaste: {richPath:'folio.rhinoRich',kind:'phrase'} },
    { path: 'folio.rhinoRich', label: 'Use formatting marks in the fixed phrase', type: 'check' },
  ]);
  fill($('pageNumFields'), [
    { path: 'pageNum.on', label: 'Show page numbers', type: 'check' },
    { path: 'pageNum.start', label: 'First page', step: 1, min: 0 },
    { path: 'pageNum.font', label: 'Page number font', type: 'select', wide: true, options: [...new Set(['Georgia', 'Times New Roman', 'Arial', 'Courier New', ...FONTS, doc.pageNum.font])].filter(f => Engine.fontToken(f)).map(f => [f, f === 'Georgia' ? 'Western serif (Georgia)' : f]) },
    { path: 'pageNum.size', label: 'Size, pt', step: 1, min: 5 },
    { path: 'pageNum.onTitle', label: 'Show on Title pages', type: 'check' },
    { path: 'pageNum.firstTitle', label: 'Include the first Title page', type: 'check' },
    { path: 'pageNum.position', label: 'Position', type: 'select', options: [['bottom', 'Bottom'], ['center', 'Center']] },
    { path: 'pageNum.angle', label: 'Rotation', type: 'select', number: true, options: [[-90, '90° counterclockwise'], [0, 'Horizontal'], [90, '90° clockwise']] },
    { path: 'pageNum.inset', label: 'Inset from right box, in', step: 0.01, min: 0 },
  ]);
  const ns = $('noteSide');
  ns.replaceChildren(...SIDES.map(([v, t]) => { const o = document.createElement('option'); o.value = v; o.textContent = t; return o; }));
  ns.value = noteSide;
  buildNotePanel();
  buildPrintPanel();
}

function buildImagePanel() {
  const picker = $('imagePick');
  if (!doc.images.some(p => p.id === imageId)) imageId = doc.images[0]?.id || '';
  picker.replaceChildren(...doc.images.map((p, i) => { const o = document.createElement('option'); o.value = p.id; o.textContent = `${i + 1}. ${p.kind === 'yigo' ? 'Yi-go' : p.kind === 'page' ? 'Page' : 'Inline'} image`; return o; }));
  picker.value = imageId;
  $('exportImage').disabled = $('deleteImage').disabled = !imageId;
  $('copyImage').disabled = $('moveImage').disabled = !doc.images.some(p => p.id === imageId && p.kind === 'inline');
  const i = doc.images.findIndex(p => p.id === imageId);
  if (i < 0) { $('imageFields').replaceChildren(); $('imageWarning').textContent = ''; return; }
  const p = `images.${i}`, image = doc.images[i];
  const page = latest?.pages.find(p => p.n === image.page);
  fill($('imageFields'), [
    {path: `${p}.scale`, label: 'Scale, %', min: image.kind === 'page' ? 20 : 10, max: 200, step: 1, onChange: updateImageWarning},
    {path: `${p}.dpi`, label: 'Horizontal resolution, DPI', min: 10, max: 2400, step: 1, onChange: updateImageWarning},
    {path: `${p}.dpiY`, label: 'Vertical resolution, DPI', nullable: true, placeholder: 'Same as horizontal', min: 10, max: 2400, step: 1, onChange: updateImageWarning},
    {path: `${p}.ignoreDpi`, label: 'Ignore image DPI (use 96)', type: 'check', onChange: updateImageWarning},
    ...(image.kind === 'page' ? [
      {path: `${p}.page`, label: 'Volume page number', event: 'change', min: 1, max: latest?.pages.length || 1, step: 1, onChange: buildImagePanel},
      {path: `${p}.anchor`, label: 'Attach to', type: 'select', wide: true, onChange: buildImagePanel, options: PechaImages.anchors.map(a => [a, a.replace('-', ' '), a.startsWith('outer') ? !page?.type.sideOut : a.startsWith('inner') ? !page?.type.sideIn : false])},
      {path: `${p}.down`, label: 'Downward shift, in', min: -30, max: 30, step: .01},
      {path: `${p}.inward`, label: 'Inward shift, in', min: -30, max: 30, step: .01},
      ...(image.anchor.startsWith('text') ? [{path: `${p}.margin`, label: 'Margin to text, in', min: 0, max: 20, step: .01}] : []),
    ] : [
    {path: `${p}.above`, label: 'Top above baseline, in', min: -30, max: 30, step: .01},
    {path: `${p}.addTibetan`, label: 'Also apply Tibetan baseline adjustment', type: 'check'},
    {path: `${p}.space`, label: 'Blank space on each side, in', min: 0, max: 20, step: .01},
    ]),
  ]);
  updateImageWarning();
}
function updateImageWarning() {
  const p = doc.images.find(p => p.id === imageId), size = p && PechaImages.dimensions(doc, p);
  if (p?.kind === 'page') {
    const page = latest?.pages.find(page => page.n === p.page);
    const index = doc.images.indexOf(p), input = $('f_images_' + index + '_page');
    if (input) input.max = latest?.pages.length || 1;
    $('imageWarning').textContent = !page ? 'The assigned page no longer exists. Choose an existing page to show this image.' : page.blank ? 'This page is an inserted blank back. Choose a content page.' : !PechaImages.pageRect(doc, p, page.boxes, page.type) ? 'This page has no box at that anchor. Choose another anchor.' : '';
    return;
  }
  $('imageWarning').textContent = size && size.h > 2 * Math.min(...Object.values(doc.types).map(t => t.lineHeight)) * 72
    ? 'This image is taller than twice a configured line height and may overlap nearby lines. Reduce its scale or increase line spacing.' : '';
}
async function addImage(file) {
  if (!file || !['image/png','image/jpeg','image/webp'].includes(file.type)) { toast('Choose a PNG, JPEG or WebP image.'); return; }
  if (file.size > 8000000) { toast('Choose an image smaller than 8 MB.'); return; }
  if (doc.images.length >= 1000 || doc.assets.length >= 200) { toast('This document has reached its image limit.'); return; }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image(); img.src = url; await img.decode();
    if (img.naturalWidth * img.naturalHeight > 16000000) throw new Error('Choose an image with fewer than 16 million pixels.');
    const canvas = document.createElement('canvas'); canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
    canvas.getContext('2d').drawImage(img, 0, 0);
    const sourceBytes = new Uint8Array(await file.arrayBuffer());
    let data = canvas.toDataURL('image/png');
    // Keep an existing PNG intact so Download PNG retains its resolution metadata.
    if (file.type === 'image/png') {
      let binary = ''; for (const byte of sourceBytes) binary += String.fromCharCode(byte);
      data = 'data:image/png;base64,' + btoa(binary);
    }
    if (data.length > 12000000) throw new Error('The converted PNG is too large. Use a smaller image.');
    let asset = doc.assets.find(a => a.data === data);
    if (!asset) { asset = {id: 'a' + crypto.randomUUID(), data, width: canvas.width, height: canvas.height}; doc.assets.push(asset); }
    const kind = $('newImageKind').value;
    const resolution = PechaImages.pngResolution(sourceBytes);
    const p = PechaImages.placement({id: 'i' + crypto.randomUUID(), asset: asset.id, kind,
      dpi: resolution?.x || 96, dpiY: resolution && resolution.x !== resolution.y ? resolution.y : null});
    doc.images.push(p); imageId = p.id;
    if (kind === 'inline') insertAtCursor(`{image:${p.id}}`); else if (kind === 'page') schedule(); else { doc.yigo.image = p.id; doc.yigo.enabled = true; schedule(); }
    buildPanels(); toast('Image embedded in this document.');
  } catch (e) { toast(e.message || 'Could not read this image.'); }
  finally { URL.revokeObjectURL(url); }
}

function buildSectionPanel() {
  const multi = doc.sections.length > 0;
  $('sectionControls').hidden = !multi;
  $('startSections').hidden = multi;
  if (!multi) return;
  const picker = $('sectionPick');
  picker.replaceChildren(...doc.sections.map((s, i) => {
    const option = document.createElement('option'); option.value = i; option.textContent = `${i + 1}. ${s.name || 'Untitled text'}`; return option;
  }));
  picker.value = sectionIndex;
  const section = doc.sections[sectionIndex];
  $('sectionName').value = section.name;
  $('sectionFolio').value = section.folioStart;
  $('sectionOpening').checked = section.restartLayout;
  $('sectionLeft').checked = doc.sectionLabels.left;
  $('sectionRight').checked = doc.sectionLabels.right;
  $('sectionEarlier').disabled = sectionIndex === 0;
  $('sectionLater').disabled = sectionIndex === doc.sections.length - 1;
}

function buildRolePanel() {
  const role = $('rolePick').value || 'root';
  fill($('roleFields'), [
    { path: `roles.${role}.font`, label: 'Typeface', type: 'select', options: FONTS.map(f => [f, f]), wide: true },
    { path: `roles.${role}.size`, label: 'Size, pt', step: 1, min: 5, max: 200 },
    { path: `roles.${role}.bold`, label: 'Bold', type: 'check' },
  ]);
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

function refreshCharacterFonts() {
  if (!doc) return;
  for (const [token,name] of TextFormat.documentFontChoices(doc,Engine)) characterFontHistory.set(token,name);
  const select=$('characterFont'), current=select.value;
  const choices=[['','Keep text font'],['jomolhari','Jomolhari'],['noto','Noto Serif Tibetan'],...Array.from(characterFontHistory).filter(([token])=>!['jomolhari','noto'].includes(token))];
  if (JSON.stringify(Array.from(select.options,o=>[o.value,o.textContent]))!==JSON.stringify(choices)) {
    select.replaceChildren(...choices.map(([value,label])=>{const o=document.createElement('option');o.value=value;o.textContent=label;return o;}));
    select.value=choices.some(([token])=>token===current)?current:'';
  }
  refreshCharacterPreview();
}
function refreshCharacterPreview() {
  if (!doc) return;
  const input=$('text');
  $('characterGrid').style.fontFamily=TextFormat.characterFamily(input.value,input.selectionStart,input.selectionEnd,$('characterFont').value,doc,Engine);
}

function buildCharacterPicker() {
  const font=$('characterFont').value, group=$('characterGroup').value, source=$('characterSource').value;
  const choices=source ? LegacyCharacters.chart(source,LEGACY_TABLE) : TibetanCharacters.filter(c=>c.group===group);
  $('characterGroupField').hidden=!!source;
  $('characterGrid').classList.toggle('legacy',!!source);
  $('characterHint').textContent=source ? 'Experimental legacy chart: inserts Unicode equivalents in the chosen web typeface. Slots show decimal and hexadecimal codes; unavailable or ambiguous mappings are disabled. Original glyph shapes and complete font coverage remain unverified.' : 'Assigned Unicode Tibetan characters, grouped by kind.';
  refreshCharacterPreview();
  $('characterGrid').replaceChildren(...choices.map(c=>{
    const button=document.createElement('button'); button.type='button'; button.className='btn';
    button.textContent=c.text===null?'—':c.text===' '?'␣':(c.combining?'ཀ':'')+c.text;
    button.disabled=c.text===null;
    if(source){button.dataset.byte=c.byte;const label=document.createElement('small');label.textContent=c.code;button.append(label);}
    button.style.fontFamily='inherit';
    const name=source?c.name:c.name+' (U+'+c.text.codePointAt(0).toString(16).toUpperCase()+')';
    button.title=name; button.setAttribute('aria-label',name);
    button.addEventListener('click',()=>{
      const input=$('text'), result=TextFormat.insertCharacter(input.value,input.selectionStart,input.selectionEnd,c.text,font,Engine);
      let start=0,end=input.value.length,right=result.text.length;
      while(start<end&&start<right&&input.value[start]===result.text[start])start++;
      while(end>start&&right>start&&input.value[end-1]===result.text[right-1]){end--;right--;}
      applyTextEdit({...result,start,end,replacement:result.text.slice(start,right)});
      refreshSelectionFonts();
    });
    return button;
  }));
}

function buildTypePanel() {
  segment($('typeSeg'), [['title', 'Title'], ['fancy', 'Fancy'], ['body', 'Body']], currentType, v => { currentType = v; buildTypePanel(); });
  const p = `types.${currentType}`;
  fill($('typeFields'), [
    { path: `${p}.lines`, label: 'Lines per page', step: 1, min: 1, max: 100 },
    { path: `${p}.fontSize`, label: 'Text size, pt', step: 1, min: 8 },
    { path: `${p}.lineHeight`, label: 'Line height, in', step: 0.01, min: 0.1 },
    { path: `${p}.baseline`, label: 'Box to first baseline, in', event: 'change', step: 0.01, min: 0, max: 30, nullable: true, placeholder: 'automatic', onChange: () => buildTypePanel() },
    { path: `${p}.top`, label: 'Box to first line top, in', disabled: doc.types[currentType].baseline !== null, step: 0.01, min: 0, nullable: true, placeholder: 'centred' },
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
    { path: `${base}.${key}.text`, label, type: 'text', wide: true, tibetan: true, richPaste: {richPath:`${base}.${key}.rich`}, onChange: v => { getPath(`${base}.${key}`).on = !!v; } },
    { path: `${base}.${key}.rich`, label: 'Use formatting marks in this note', type: 'check' },
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
  const all = Math.ceil(res.folioCount / (doc.pecha.mode === false ? 1 : doc.pecha.perSheet));
  const n = doc.print.firstOnly ? Math.min(1, all) : all;
  const count = `${n} ${n === 1 ? 'sheet' : 'sheets'}`;
  const edge = doc.paper.w >= doc.paper.h ? 'long' : 'short';
  const paper = doc.paper.name === 'Custom' ? `${doc.paper.w} × ${doc.paper.h} in` : doc.paper.name;
  const setup = `Paper ${paper}, ${doc.paper.w >= doc.paper.h ? 'landscape' : 'portrait'}, scale 100%, margins none. Turn off browser headers and footers.`;
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
  const rows = doc.pecha.mode === false ? 1 : doc.pecha.perSheet, rowH = 15, W = 104, H = rows * rowH + 8, gap = 64;
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
  refreshCharacterFonts();
  clearTimeout(timer);
  timer = setTimeout(render, 120);
}

function render() {
  const res = Engine.run(doc, measure);
  latest = res;
  updateImageWarning();
  const host = $('table');
  const compact=doc.pecha.mode!==false && doc.display.compact;
  host.classList.toggle('compact',compact && view==='pages');
  $('printBtn').disabled=compact;
  $('printBtn').title=compact ? 'Turn off Compact page view in Layout before printing.' : '';
  const frag = document.createDocumentFragment();
  const leaf = (tag, svg, sheet) => {
    const d = document.createElement('div');
    d.className = 'leaf' + (sheet ? ' sheet' : '');
    d.innerHTML = `<div class="tag">${tag}</div>${svg}`;
    frag.append(d);
  };
  const sheets = Engine.impose(doc, res.pages);
  const total = view === 'pages' ? res.pages.length : sheets.length;
  previewStart = Math.max(0, Math.min(previewStart, total - 1));
  const previewEnd = Math.min(total, previewStart + PREVIEW_PAGES);
  $('previousPreview').disabled = previewStart === 0;
  $('nextPreview').disabled = previewEnd >= total;
  $('previewRange').textContent = `${view === 'pages' ? 'Pages' : 'Sheet sides'} ${previewStart + 1}–${previewEnd} of ${total}`;
  $('goPage').max = String(res.pages.length);
  if (view === 'pages') {
    for (const p of res.pages.slice(previewStart, previewEnd)) {
      const folio = Math.ceil(p.n / 2);
      const tag = doc.pecha.mode === false ? `Page ${p.n}${p.sectionName ? ' · '+p.sectionName : ''}` : p.blank ? `Page ${p.n} · blank back before the next text` : `Page ${p.n} · ${p.kind} · ${p.sectionName ? `${p.sectionName} · text folio ${p.folioNumber}` : `folio ${folio}`} ${p.front ? 'front' : 'back'}`;
      leaf(tag.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])), Engine.pageSvg(p, doc, measure, res.folioCount));
    }
  } else {
    const of = sheets.filter(s => s.side !== 'back').length;
    const tag = s => (s.side === 'seq' ? `Proof sheet ${s.sheet} of ${of} · pages in order`
      : `Sheet ${s.sheet} of ${of} · ${s.side === 'front' ? 'front' : doc.print.turnBacks ? 'back, upside down for a printer that turns it' : 'back, as it reads once the sheet is turned over its top edge'}`);
    sheets.slice(previewStart, previewEnd).forEach(s => leaf(tag(s), Engine.sheetSvg(s, doc, measure, res.folioCount, true), true));
  }
  if (total > PREVIEW_PAGES) {
    const more = document.createElement('p');
    more.className = 'more';
    more.textContent = `Showing ${previewStart + 1}–${previewEnd} of ${total}. Printing includes all of them.`;
    frag.append(more);
  }
  host.replaceChildren(frag);
  const paperSheets = sheets.filter(s => s.side !== 'back').length;
  $('stats').textContent = `${res.pages.length} pages · ${doc.pecha.mode === false ? '' : res.folioCount+' folios · '}${paperSheets} ${paperSheets === 1 ? 'sheet' : 'sheets'} of ${doc.paper.name === 'Custom' ? 'paper' : doc.paper.name}`;
  const badWidth = res.pages.some(p => p.boxes.T.x1 <= p.boxes.T.x0);
  const clippedTop = doc.pecha.mode === false && res.pages.some(p => p.lines[0]?.items.some(a => {
    const tib = /^[\u0f00-\u0fff]/.test(a.s);
    const extent = a.image ? a.image.above*72+(a.image.addTibetan ? doc.tibetanRaise*72 : 0) : measure.head({...doc,font:a.f.family},a.f.size,tib).ascent+(tib ? doc.tibetanRaise*72 : 0);
    return extent > doc.normal.baseline*72;
  }));
  $('warn').textContent = clippedTop ? 'The first line extends above the page. Increase the full-page first-baseline setting.' : !Engine.fits(doc) ? 'The pecha do not fit between the top and bottom margins. Reduce their height or number per sheet.' : badWidth ? 'The boxes and side margins leave no space for text.' : '';
  $('pageStyle').textContent = `@page { size: ${doc.paper.w}in ${doc.paper.h}in; margin: 0; }`;
  updatePrintSteps();
  for(const button of document.querySelectorAll('[data-pass]'))button.disabled=compact;
  persist();
}

// pass: 'duplex', 'fronts', 'backs' or 'sequence'; left out, it follows the chosen way of printing.
function buildPrint(pass) {
  const res = Engine.run(doc, measure);
  $('pageStyle').textContent = `@page { size: ${doc.paper.w}in ${doc.paper.h}in; margin: 0; }`;
  const sheets = Engine.impose(doc, res.pages, { pass, firstOnly: doc.print.firstOnly && pass !== 'sequence' && doc.print.sides !== 'sequence' });
  $('printRoot').innerHTML = sheets.map(s => `<div class="sheet-print" style="width:${doc.paper.w}in;height:${doc.paper.h}in">${Engine.sheetSvg(s, doc, measure, res.folioCount, false)}</div>`).join('');
}

let printPass = null;
function printNow(pass) {
  if(doc.pecha.mode!==false && doc.display.compact){toast('Turn off Compact page view in Layout before printing.');return;}
  render(); // include edits made immediately before clicking Print
  if (!Engine.fits(doc) || latest.pages.some(p => p.boxes.T.x1 <= p.boxes.T.x0)) { toast('The pecha do not fit. Adjust the layout before printing.'); return; }
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

function recoveryStatus() {
  $('recoveryStatus').textContent = recovery.delay === null ? 'Recovery is off. Any earlier browser recovery remains available.'
    : storageWarningShown ? 'Recovery could not be saved. Download a copy with Save.'
    : recovery.pending ? 'Changes are waiting for the next recovery save.'
    : recovery.lastSaved === null ? 'No recovery saved in this session yet.'
    : `Last recovery saved ${new Date(recovery.lastSaved).toLocaleTimeString()}.`;
}
function persist(force = false) {
  if (!doc) return;
  try {
    recovery.queue({doc, isSample});
    if (force) recovery.flush(true);
    storageWarningShown = false;
  } catch (e) {
    if (!storageWarningShown) toast('Browser storage is unavailable or full. Use Save to keep this document and its images.');
    storageWarningShown = true;
  }
  recoveryStatus();
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

function setDoc(d, sample, src = null, {keepTypingMode = false} = {}) {
  d = Documents.normalize(d, Engine);
  d.print = { ...Engine.defaultDoc().print, ...d.print };
  if (d.print.sides === 'fronts' || d.print.sides === 'backs') d.print.sides = 'manual';
  doc = d; isSample = sample; source = src;
  if (!keepTypingMode) {characterFontHistory.clear();$('characterFont').value='';}
  if (!keepTypingMode) {$('typeover').checked = false;$('lockedKeyboard').checked=false;}
  lockedComposition=null;fillLockedKeyboard();
  recovery.newDocument();
  savedCheckpoint = {doc: Documents.artifact(d, 'document'), isSample: sample, source: src};
  reportImport([]);
  sectionIndex = 0;
  previewStart = 0;
  showWork();
  buildPanels();
  refreshCharacterFonts();
  buildCharacterPicker();
  noteSample();
  render();
  buildImagePanel();
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
  $('credits').innerHTML = '<a href="https://nalandabodhi.org/" target="_blank" rel="noopener">Nalandabodhi Pecha Maker</a> is an independent web tool. It opens files made with PechaMaker by Frederick W. Johnson and is not affiliated with it. Typefaces: Jomolhari and Noto Serif Tibetan. Feedback or requests: alessandro dot solbiati at gmail dot com.';
}

function docFromPdf(result, keepOther) {
  const d = Documents.newContent(doc, Engine);
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

function reportImport(messages) {
  const list = $('importMessages');
  list.replaceChildren(...[...new Set(messages)].map(message => {
    const item = document.createElement('li'); item.textContent = message; return item;
  }));
  $('importReport').hidden = !messages.length;
  $('importReport').open = true;
}

function updateDctFontInput(id) {
  const custom = $(id).value === 'custom', input = $(id+'Name');
  input.hidden = $(id+'NameLabel').hidden = !custom;
  input.disabled = !custom; input.required = custom;
  input.setCustomValidity(custom && !Engine.fontToken(input.value) ? 'Enter a font name of 1–128 characters without control characters or semicolons.' : '');
}

function setDctFontChoices(id, current) {
  const choices = new Map(TextFormat.fontChoices(doc || Engine.defaultDoc(),Engine));
  if (Engine.fontFamily(current)) choices.set(current,Engine.primaryFont(Engine.fontFamily(current)));
  $(id).replaceChildren(...[...choices, ['custom','Other font…']].map(([value,label]) => {
    const option = document.createElement('option'); option.value = value; option.textContent = label; return option;
  }));
  $(id).value = current; $(id+'Name').value = ''; updateDctFontInput(id);
}

const dctFontChoice = id => $(id).value === 'custom' ? Engine.fontToken($(id+'Name').value) : $(id).value;

function chooseDctSettings(name, currentFont) {
  const dialog = $('dctDialog');
  if (dialog.open) throw new Error('Finish or cancel the current DCT import first.');
  $('dctFilename').textContent = name;
  $('dctTibetanFont').textContent = currentFont;
  $('dctTibetanSize').value = dctPreferences.tibetanSize;
  $('dctLatinSize').value = dctPreferences.latinSize;
  setDctFontChoices('dctLatinFont',dctPreferences.latinFont);
  $('dctDiacriticSize').value = dctPreferences.diacriticSize;
  setDctFontChoices('dctDiacriticFont',dctPreferences.diacriticFont);
  $('dctRemapDiacritics').checked = dctPreferences.remapDiacritics;
  dialog.returnValue = '';
  return new Promise(resolve => {
    const form = dialog.querySelector('form');
    const finish = value => {
      const settings = value === 'import' ? {
        tibetanSize:Number($('dctTibetanSize').value),latinSize:Number($('dctLatinSize').value),latinFont:dctFontChoice('dctLatinFont'),
        diacriticSize:Number($('dctDiacriticSize').value),diacriticFont:dctFontChoice('dctDiacriticFont'),remapDiacritics:$('dctRemapDiacritics').checked
      } : null;
      form.removeEventListener('submit', submit);
      $('dctCancel').removeEventListener('click', cancel);
      dialog.removeEventListener('cancel', cancel);
      dialog.removeEventListener('close', closed);
      if (dialog.open) dialog.close(value);
      resolve(settings);
    };
    const submit = event => {event.preventDefault();finish('import');};
    const cancel = event => {event.preventDefault();finish('cancel');};
    // A queued close event from an earlier import must not settle a reopened dialog.
    const closed = () => {if (!dialog.open) finish(dialog.returnValue);};
    form.addEventListener('submit', submit);
    $('dctCancel').addEventListener('click', cancel);
    dialog.addEventListener('cancel', cancel);
    dialog.addEventListener('close', closed);
    dialog.showModal();
  });
}

let openingFile = false;
async function openFile(file) {
  if (openingFile) {toast('Finish or cancel the current file import first.');return;}
  openingFile = true;
  const wasEditing = !$('work').hidden, name = file.name.toLowerCase();
  try {
    const buf = new Uint8Array(await file.arrayBuffer());
    if (name.endsWith('.pdf') || file.type === 'application/pdf') {
      showStart();
      await openPdf(file, buf);
      if (wasEditing && $('work').hidden) {
        const message = $('startStatus').textContent;
        showWork(); reportImport([message]); toast(message);
      }
      return;
    }
    if (name.endsWith('.dct')) {
      const settings = await chooseDctSettings(file.name, doc?.fontName || 'Jomolhari');
      if (!settings) return;
      const base = Documents.newContent(doc, Engine);
      if (doc) {base.font = doc.font; base.fontName = doc.fontName;}
      const result = Dct.read(buf, Engine, LEGACY_TABLE, base, settings);
      setDoc(result.doc, false); reportImport(result.warnings);
      dctPreferences = Dct.importSettings(settings, Engine);
      try {localStorage.setItem(DCT_PREF_KEY,JSON.stringify(dctPreferences));} catch (_) {}
      toast('Experimental TibetDoc import complete. Review the import notes before printing.');
    } else if (name.endsWith('.rtf')) {
      const result = Rtf.read(buf, Engine, LEGACY_TABLE, doc || Engine.defaultDoc());
      setDoc(result.doc, false);
      reportImport(result.warnings);
      toast(result.warnings.length ? result.warnings.join(' ') : 'RTF body text and supported formatting imported. Current page layout and annotations kept.');
    } else if (/\.px[pcta]$/.test(name)) {
      const { doc: d, unknown, warnings } = Pxp.load(buf, name.slice(-3), LEGACY_TABLE, doc || Engine.defaultDoc(), Engine);
      setDoc(d, false, null, {keepTypingMode: /\.px[ta]$/.test(name)});
      reportImport([...warnings, ...(unknown ? [`${unknown} characters use an unsupported font. Check them against the original.`] : [])]);
      toast(warnings.length ? warnings.join(' ') : unknown ? `Opened ${file.name}. ${unknown} characters use a font this page cannot convert yet.` : `Opened ${file.name}. ${name.endsWith('.pxt') ? 'Current text and annotations kept.' : name.endsWith('.pxa') ? 'Current text and page layout kept.' : 'Text converted to Unicode.'}`);
    } else if (/\.(pecha|json)$/.test(name)) {
      const saved = JSON.parse(new TextDecoder().decode(buf));
      const keepTypingMode = saved.format === 'web-pecha-part' && ['template', 'annotations'].includes(saved.kind);
      setDoc(Documents.apply(doc, saved, Engine), false, null, {keepTypingMode});
      toast(`Opened ${file.name}.`);
    } else {
      const d = Documents.newContent(doc, Engine);
      d.text = new TextDecoder().decode(buf);
      setDoc(d, false);
      toast(`Opened ${file.name}.`);
    }
  } catch (e) {
    const message = `Could not read ${file.name}: ${e.message || 'The file could not be opened.'}`;
    if (wasEditing) {showWork();reportImport([message]);toast(message);}
    else {showStart(message,true);toast(message);}
  } finally {
    openingFile = false;
  }
}

function saveFile(kind = 'document') {
  const url = URL.createObjectURL(new Blob([JSON.stringify(Documents.artifact(doc, kind), null, 1)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url; a.download = kind === 'document' ? 'pecha.pecha' : `pecha-${kind}.pecha`;
  a.click();
  URL.revokeObjectURL(url);
  if (kind === 'document') savedCheckpoint = {doc: Documents.artifact(doc, 'document'), isSample, source};
  toast(`Saved ${a.download} to your downloads.`);
}

// ---------- text helpers ----------

function refreshLockedKeyboard() {
  const on=$('lockedKeyboard').checked;
  for(const el of $('selectionFormatting').querySelectorAll('input,select,button'))el.disabled=on;
  for(const el of $('codes').querySelectorAll('[data-font-attribute]'))el.disabled=on;
  $('lockedKeyboardStatus').textContent=on
    ? `Locked: ${lockedPreferences.font}, ${lockedPreferences.size} pt. Normal font controls are disabled.`+(doc?.textSize?` Whole-text size (${doc.textSize} pt) overrides this size until cleared.`:'')
    : 'Normal: typing follows the formatting at the cursor.';
}
function fillLockedKeyboard() {
  $('lockedFont').value=lockedPreferences.font;$('lockedSize').value=lockedPreferences.size;$('lockedColor').value=lockedPreferences.color;
  for(const key of ['bold','italic','underline','strike'])$('locked'+key[0].toUpperCase()+key.slice(1)).checked=lockedPreferences[key];
  $('lockedFontChoices').replaceChildren(...TextFormat.fontChoices(doc||Engine.defaultDoc(),Engine).map(([,name])=>{const o=document.createElement('option');o.value=name;return o;}));
  refreshLockedKeyboard();
}
function applyTextEdit(result) {
  const t=$('text');applyingLocked=true;
  try{
    t.focus();t.setSelectionRange(result.start,result.end);
    if(!document.execCommand('insertText',false,result.replacement))t.setRangeText(result.replacement,result.start,result.end,'end');
    t.setSelectionRange(result.cursor,result.cursor);setEditingText(t.value);isSample=false;noteSample();schedule();
  }finally{applyingLocked=false;}
}

function insertAtCursor(s) {
  const t = $('text'), a = t.selectionStart, b = t.selectionEnd;
  t.setRangeText(s, a, b, 'end');
  t.focus();
  setEditingText(t.value);
  schedule();
}

function wylieToTibetan(s) {
  try { return window.jsEWTS.fromWylie(s); } catch (e) { return ''; }
}

function init() {
  for (const id of ['dctLatinFont','dctDiacriticFont']) {
    $(id).addEventListener('change', () => updateDctFontInput(id));
    $(id+'Name').addEventListener('input', () => updateDctFontInput(id));
  }
  $('dctDiacriticFontName').addEventListener('invalid', () => {$('dctDiacriticOptions').open = true;});
  $('dctDiacriticSize').addEventListener('invalid', () => {$('dctDiacriticOptions').open = true;});
  const codes = [['Centre', '{c}'], ['Justify', '{j}'], ['Left', '{l}'], ['Right', '{r}'], ['Larger', '{30}'], ['Normal size', '{size}'], ['Bold', '{b}'], ['End bold', '{/b}'], ['Italic', '{i}'], ['End italic', '{/i}'], ['Underline', '{u}'], ['End underline', '{/u}'], ['Red', '{#b03020}'], ['Black', '{color}'], ['New page', '{page}'], ['Fixed shad', '{hs}'], ['Tab', '\t']];
  for (const [label, code] of codes) {
    const b = document.createElement('button');
    b.className = 'chip'; b.type = 'button'; b.textContent = label; b.title = `Inserts ${code}`;
    if (/^\{(?:\d+|size|\/?[biu]|#[0-9a-f]+|color)\}$/.test(code)) b.dataset.fontAttribute = '';
    b.addEventListener('click', () => {
      const t = $('text');
      // Formatting controls must never erase a highlighted passage.
      insertAtCursor(code + t.value.slice(t.selectionStart, t.selectionEnd));
    });
    $('codes').append(b);
  }
  document.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('.tabs button').forEach(x => x.setAttribute('aria-selected', String(x === b)));
    document.querySelectorAll('.pane').forEach(p => { p.hidden = p.dataset.pane !== b.dataset.tab; });
    if (b.dataset.tab === 'print') setView('sheets');
  }));
  $('text').addEventListener('input', e => { setEditingText(e.target.value); isSample = false; noteSample(); schedule(); });
  for (const operation of ['copy','cut']) $('text').addEventListener(operation, event => {
    if (!$('copyFormatted').checked) return;
    if (!event.clipboardData) {
      if (operation === 'cut') { event.preventDefault(); toast('Clipboard unavailable; text was not cut.'); }
      return;
    }
    try {
      const t = $('text'), result = Rtf.copySelection(doc,t.value,t.selectionStart,t.selectionEnd,Engine,TextFormat);
      if (result.empty) return;
      const removal = operation === 'cut' ? TextFormat.removeRich(t.value,result.start,result.end,Engine) : null;
      event.clipboardData.setData('text/rtf',result.rtf);
      event.clipboardData.setData('text/plain',result.plain);
      event.preventDefault();
      if (removal) {
        t.focus(); t.setSelectionRange(removal.start,removal.end);
        const edited = removal.replacement ? document.execCommand('insertText',false,removal.replacement) : document.execCommand('delete',false);
        if (!edited) t.setRangeText(removal.replacement,removal.start,removal.end,'end');
        t.setSelectionRange(removal.cursor,removal.cursor); setEditingText(t.value);
        isSample = false; noteSample(); refreshSelectionFonts(); schedule();
      }
    } catch (error) {
      if (operation === 'cut') event.preventDefault();
      toast('Could not '+operation+' formatted text: '+error.message);
    }
  });
  $('text').addEventListener('paste', event => {
    const rtf = event.clipboardData?.getData('text/rtf') || event.clipboardData?.getData('application/rtf');
    if (!rtf) return;
    event.preventDefault();
    try {
      const t = $('text'), result = Rtf.insert(rtf,doc,t.value,t.selectionStart,t.selectionEnd,Engine,LEGACY_TABLE,TextFormat);
      reportImport(result.warnings);
      if (result.empty) { toast('The pasted RTF contains no supported text or images.'); return; }
      t.focus(); t.setSelectionRange(result.start,result.end);
      // Supplied RTF keeps its own styles even when the typing font is locked.
      applyingLocked=true;
      try {if (!document.execCommand('insertText',false,result.replacement)) t.setRangeText(result.replacement,result.start,result.end,'end');}
      finally {applyingLocked=false;}
      doc.assets = result.assets; doc.images = result.images;
      t.setSelectionRange(result.cursor,result.cursor); setEditingText(t.value);
      isSample = false; noteSample(); refreshSelectionFonts(); buildImagePanel(); schedule();
      toast(result.warnings.length ? 'Formatted text pasted. Review the import notes.' : 'Formatted text pasted; surrounding styles kept.');
    } catch (error) { toast('Could not paste RTF: '+error.message); }
  });
  $('text').addEventListener('keydown', event => {
    if (event.key === 'Insert' && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      if (!event.repeat) $('typeover').checked = !$('typeover').checked;
    }
  });
  $('lockedKeyboard').addEventListener('change',refreshLockedKeyboard);
  for(const id of ['lockedFont','lockedSize','lockedColor','lockedBold','lockedItalic','lockedUnderline','lockedStrike'])$(id).addEventListener('change',()=>{
    const value={font:$('lockedFont').value,size:+$('lockedSize').value,color:$('lockedColor').value};
    if(!Engine.fontToken(value.font)||!$('lockedSize').value||!Number.isFinite(value.size)){fillLockedKeyboard();toast('Enter a font name and a size from 4 to 200 points.');return;}
    for(const key of ['bold','italic','underline','strike'])value[key]=$('locked'+key[0].toUpperCase()+key.slice(1)).checked;
    lockedPreferences=TextFormat.lockedSettings(value,Engine);fillLockedKeyboard();
    try{localStorage.setItem(LOCKED_PREF_KEY,JSON.stringify(lockedPreferences));}catch(_){toast('Locked font changed, but this browser could not remember it.');}
  });
  fillLockedKeyboard();
  $('text').addEventListener('beforeinput', event => {
    if (applyingLocked || !event.cancelable || event.isComposing || event.inputType !== 'insertText') return;
    const t=event.target,range=$('typeover').checked?TextFormat.typeoverRange(t.value,t.selectionStart,t.selectionEnd,event.data):null;
    if($('lockedKeyboard').checked&&event.data){
      event.preventDefault();applyTextEdit(TextFormat.insertLocked(t.value,range?.start??t.selectionStart,range?.end??t.selectionEnd,event.data,lockedPreferences,Engine));
    }else if(range)t.setSelectionRange(range.start,range.end);
  });
  $('text').addEventListener('compositionstart',()=>{
    const t=$('text');lockedComposition=$('lockedKeyboard').checked?{text:t.value,start:t.selectionStart,end:t.selectionEnd,doc,sectionIndex,pref:{...lockedPreferences}}:null;
  });
  $('text').addEventListener('compositionend',event=>{
    const saved=lockedComposition;lockedComposition=null;
    if(!saved||!event.data)return;
    setTimeout(()=>{
      const t=$('text');
      if(doc!==saved.doc||sectionIndex!==saved.sectionIndex||!$('lockedKeyboard').checked)return;
      const expected=saved.text.slice(0,saved.start)+event.data+saved.text.slice(saved.end);
      if(t.value!==expected){toast('Composed text kept; the locked font could not be applied to this composition.');return;}
      const result=TextFormat.insertLocked(saved.text,saved.start,saved.end,event.data,saved.pref,Engine);
      // The browser has committed the text already. Apply the remaining difference,
      // including any whole-token or combining-cluster boundary adjustment.
      if(t.value===result.text)return;
      let start=0,end=t.value.length,right=result.text.length;
      while(start<end&&start<right&&t.value[start]===result.text[start])start++;
      while(end>start&&right>start&&t.value[end-1]===result.text[right-1]){end--;right--;}
      applyTextEdit({...result,start,end,replacement:result.text.slice(start,right)});
    },0);
  });
  $('startSections').addEventListener('click', () => {
    doc.sections = [{ name: 'Text 1', text: doc.text, folioStart: doc.folio.start, restartLayout: true }];
    doc.text = ''; sectionIndex = 0; buildSectionPanel(); schedule();
  });
  $('sectionPick').addEventListener('change', e => { sectionIndex = +e.target.value; $('text').value = editingText(); buildSectionPanel(); });
  $('addSection').addEventListener('click', () => {
    if (doc.sections.length >= 200) { toast('This volume has reached the limit of 200 texts. Save it and start a new volume.'); return; }
    doc.sections.push({ name: `Text ${doc.sections.length + 1}`, text: '', folioStart: 1, restartLayout: true });
    sectionIndex = doc.sections.length - 1; $('text').value = ''; buildSectionPanel(); schedule(); $('text').focus();
  });
  $('sectionName').addEventListener('input', e => { doc.sections[sectionIndex].name = e.target.value; $('sectionPick').options[sectionIndex].textContent = `${sectionIndex + 1}. ${e.target.value || 'Untitled text'}`; schedule(); });
  $('sectionFolio').addEventListener('input', e => { if (e.target.value !== '') { doc.sections[sectionIndex].folioStart = Math.max(0, Math.min(9999, Math.round(+e.target.value) || 0)); schedule(); } });
  $('sectionOpening').addEventListener('change', e => { doc.sections[sectionIndex].restartLayout = e.target.checked; schedule(); });
  for (const side of ['Left', 'Right']) $('section' + side).addEventListener('change', e => { doc.sectionLabels[side.toLowerCase()] = e.target.checked; schedule(); });
  for (const [id, direction] of [['sectionEarlier', -1], ['sectionLater', 1]]) $(id).addEventListener('click', () => {
    const next = sectionIndex + direction;
    if (next < 0 || next >= doc.sections.length) return;
    [doc.sections[sectionIndex], doc.sections[next]] = [doc.sections[next], doc.sections[sectionIndex]];
    sectionIndex = next; buildSectionPanel(); schedule();
  });
  $('flow').addEventListener('change', e => { doc.flow = e.target.checked; schedule(); });
  $('orientation').addEventListener('change', e => {
    const short = Math.min(doc.paper.w, doc.paper.h), long = Math.max(doc.paper.w, doc.paper.h);
    [doc.paper.w, doc.paper.h] = e.target.value === 'portrait' ? [short, long] : [long, short];
    buildPanels(); schedule();
  });
  for (const [id, direction] of [['previousCode', -1], ['nextCode', 1]]) {
    $(id).addEventListener('click', () => {
      const t = $('text'), range = TextFormat.findCode(t.value, t.selectionStart, t.selectionEnd, direction);
      if (!range) { toast(direction < 0 ? 'No earlier formatting mark.' : 'No later formatting mark.'); return; }
      t.focus(); t.setSelectionRange(range.start, range.end);
    });
  }
  $('removeReturns').addEventListener('click', () => {
    const t = $('text');
    if (t.selectionStart === t.selectionEnd) { toast('Select the text whose line breaks you want to remove.'); return; }
    const result = TextFormat.removeReturns(t.value, t.selectionStart, t.selectionEnd);
    t.value = result.text; t.focus(); t.setSelectionRange(result.start, result.end);
    setEditingText(t.value); schedule();
  });
  $('selectionFormatting').addEventListener('toggle', () => { if ($('selectionFormatting').open) refreshSelectionFonts(); });
  $('selectionFont').addEventListener('change', () => {
    const custom = $('selectionFont').value === 'custom';
    $('selectionFontName').hidden = $('selectionFontNameLabel').hidden = !custom;
    if (custom) $('selectionFontName').focus();
  });
  $('applySelection').addEventListener('click', () => {
    const attrs = {}, size = $('selectionSize').value;
    if (size && (!Number.isFinite(+size) || +size < 4 || +size > 200)) { toast('Choose a text size from 4 to 200 pt.'); return; }
    if (size) attrs.size = +size;
    if ($('selectionFont').value === 'custom') {
      attrs.font = Engine.fontToken($('selectionFontName').value);
      if (!attrs.font) { toast('Enter a font name of 1–128 characters without control characters or semicolons.'); return; }
    } else if ($('selectionFont').value) attrs.font = $('selectionFont').value;
    if ($('selectionColor').value) attrs.color = $('selectionColor').value;
    for (const key of ['bold', 'italic', 'underline', 'strike']) {
      const value = $('selection' + key[0].toUpperCase() + key.slice(1)).value;
      if (value) attrs[key] = value === 'on';
    }
    if (!Object.keys(attrs).length) { toast('Choose an attribute to change.'); return; }
    const t = $('text'), result = TextFormat.apply(t.value, t.selectionStart, t.selectionEnd, attrs, Engine);
    t.value = result.text; t.focus(); t.setSelectionRange(result.start, result.end);
    setEditingText(t.value); refreshSelectionFonts(); schedule();
    toast('Chosen attributes applied; other formatting kept.');
  });
  $('table').addEventListener('contextmenu', e => {
    const target = e.target.closest('[data-image-id]'); if (!target) return;
    e.preventDefault(); imageId = target.dataset.imageId;
    document.querySelector('.tabs button[data-tab="text"]').click();
    $('imagePick').closest('details').open = true; buildImagePanel();
    $('imagePick').scrollIntoView({block: 'center'}); $('imagePick').focus();
  });
  $('addImage').addEventListener('click', () => $('imageFile').click());
  $('imageFile').addEventListener('change', e => { addImage(e.target.files[0]); e.target.value = ''; });
  $('imagePick').addEventListener('change', e => { imageId = e.target.value; buildImagePanel(); });
  $('exportImage').addEventListener('click', () => {
    const p = doc.images.find(p => p.id === imageId), size = p && PechaImages.dimensions(doc, p);
    if (!size) return; const a = document.createElement('a'); a.href = size.asset.data; a.download = 'pecha-image.png'; a.click();
  });
  for (const [button, move] of [['copyImage',false],['moveImage',true]]) {
    $(button).addEventListener('click', () => {
      const result = PechaImages.transferInline(doc,imageId,'i'+crypto.randomUUID(),sectionIndex,$('text').selectionStart,move);
      if (!result) { toast('Unable to place another inline image.'); return; }
      imageId=result.placement.id; $('text').value=editingText();
      $('text').focus(); $('text').setSelectionRange(result.cursor,result.cursor);
      buildPanels(); schedule(); toast('Image placed with default spacing and 100% scale.');
    });
  }
  $('deleteImage').addEventListener('click', () => {
    const id = imageId; if (!id) return;
    const strip = text => text.split(`{image:${id}}`).join('');
    doc.text = strip(doc.text); for (const s of doc.sections) s.text = strip(s.text);
    doc.images = doc.images.filter(p => p.id !== id);
    doc.assets = doc.assets.filter(a => doc.images.some(p => p.asset === a.id));
    if (doc.yigo.image === id) doc.yigo.image = '';
    $('text').value = editingText(); buildPanels(); schedule();
  });
  $('rolePick').addEventListener('change', buildRolePanel);
  $('applyRole').addEventListener('click', () => {
    const t = $('text'), a = t.selectionStart, b = t.selectionEnd, role = $('rolePick').value;
    if (a === b) { insertAtCursor(`{${role}}`); return; }
    // Resume the previous role after the selection instead of leaking the new role into following text.
    const before = Engine.parseStream(t.value.slice(0, b), false).filter(x => x.k === 'text').at(-1);
    const prior = before && before.style;
    const restore = prior ? `{${prior.role || '/role'}}${prior.size ? `{${prior.size}}` : ''}${prior.bold === null ? '' : prior.bold ? '{b}' : '{/b}'}` : '{/role}';
    insertAtCursor(`{${role}}${t.value.slice(a, b)}${restore}`);
  });
  $('exportRtf').addEventListener('click', () => {
    try {
      const url = URL.createObjectURL(new Blob([Rtf.write(doc, Engine)], {type: 'application/rtf'}));
      const a = document.createElement('a'); a.href = url; a.download = 'pecha-text.rtf'; a.click(); URL.revokeObjectURL(url);
      toast('RTF saved: body formatting and inline images. Page layout, labels and automatic marks are separate.');
    } catch(error) {toast('Could not export RTF: '+error.message);}
  });
  $('savePart').addEventListener('click', () => saveFile($('saveKind').value));
  $('exportPxt').addEventListener('click', () => {
    try {
      const result = Pxp.writeTemplate(doc, Engine, measure);
      $('exportMessages').replaceChildren(...result.warnings.map(message => {
        const li = document.createElement('li'); li.textContent = message; return li;
      }));
      $('exportReport').hidden = false; $('exportReport').open = true;
      const url = URL.createObjectURL(new Blob([result.text], {type:'text/plain'}));
      const a = document.createElement('a'); a.href = url; a.download = 'pecha-layout.pxt'; a.click(); URL.revokeObjectURL(url);
      toast('Windows layout template downloaded. Review the export notes.');
    } catch (e) { toast('Could not export the Windows template: ' + e.message); }
  });
  for (const [id,writer,kind,filename] of [
    ['exportPxp','writeDocument','document','pecha-document.pxp'],
    ['exportPxa','writeAnnotations','annotations','pecha-annotations.pxa'],
    ['exportPxc','writeContent','content','pecha-content.pxc']
  ]) $(id).addEventListener('click', () => {
    try {
      const result = Pxp[writer](doc, Engine, LEGACY_TABLE, measure);
      $('exportMessages').replaceChildren(...result.warnings.map(message => {
        const li = document.createElement('li'); li.textContent = message; return li;
      }));
      $('exportReport').hidden = false; $('exportReport').open = true;
      const url = URL.createObjectURL(new Blob([result.bytes], {type:'application/octet-stream'}));
      const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
      toast('Windows '+kind+' downloaded. Review the export notes.');
    } catch (e) {
      const message='Could not export Windows '+kind+': '+e.message, li=document.createElement('li');li.textContent=message;
      $('exportMessages').replaceChildren(li);$('exportReport').hidden=false;$('exportReport').open=true;toast(message);
    }
  });
  $('loadPart').addEventListener('click', () => $('partFile').click());
  $('partFile').addEventListener('change', e => { if (e.target.files[0]) openFile(e.target.files[0]); e.target.value = ''; });
  $('noteSide').addEventListener('change', e => { noteSide = e.target.value; buildNotePanel(); });
  $('wylie').addEventListener('input', e => { $('wyliePreview').textContent = wylieToTibetan(e.target.value); });
  $('wylieInsert').addEventListener('click', () => {
    const s = wylieToTibetan($('wylie').value);
    if (s) insertAtCursor(s);
    $('wylie').value = ''; $('wyliePreview').textContent = '';
  });
  $('newDoc').addEventListener('click', () => showStart());
  $('openFile').addEventListener('change', e => { if (e.target.files[0]) openFile(e.target.files[0]); e.target.value = ''; });
  $('pasteText').addEventListener('click', () => { setDoc(Documents.newContent(doc, Engine), false); $('text').focus(); });
  $('tryExample').addEventListener('click', () => setDoc(sampleDoc(), true));
  $('resume').addEventListener('click', () => { const s = restore(); if (s) setDoc(s.doc, s.isSample); });
  $('keepOther').addEventListener('change', e => { if (source) { const d = docFromPdf(source.result, e.target.checked); setEditingText(d.text); $('text').value = d.text; schedule(); } });
  let depth = 0;
  const fileDrag = e => Array.from(e.dataTransfer?.types || []).includes('Files');
  window.addEventListener('dragenter', e => { if (!fileDrag(e)) return; e.preventDefault(); depth++; document.body.classList.add('dragging'); });
  window.addEventListener('dragleave', () => { depth = Math.max(0, depth - 1); if (!depth) document.body.classList.remove('dragging'); });
  window.addEventListener('dragover', e => { if (fileDrag(e)) e.preventDefault(); });
  window.addEventListener('drop', e => {
    if (!fileDrag(e)) return;
    e.preventDefault();
    depth = 0; document.body.classList.remove('dragging');
    const f = e.dataTransfer.files[0];
    if (f) openFile(f);
  });
  $('recoveryInterval').value = String(recoveryMinutes);
  $('recoveryInterval').addEventListener('change', event => {
    recoveryMinutes = Number(event.target.value); recovery.configure(recoveryMinutes);
    try { localStorage.setItem(RECOVERY_PREF_KEY, String(recoveryMinutes)); } catch (_) { toast('This recovery preference could not be saved for next time.'); }
    persist(true);
  });
  setInterval(() => { if (recovery.pending && recovery.delay !== null) persist(); }, 1000);
  window.addEventListener('pagehide', () => persist(true));
  $('saveDoc').addEventListener('click', () => saveFile());
  $('closeDoc').addEventListener('click', () => {
    if (!confirm('Close this document and reset the next new pecha to default settings and empty annotations? Download a copy with Save first if needed.')) return;
    persist(true); clearTimeout(timer);
    doc = null; source = null; savedCheckpoint = null; latest = null;
    $('typeover').checked = false;$('lockedKeyboard').checked=false;lockedComposition=null;refreshLockedKeyboard();
    recovery.newDocument(); $('printRoot').replaceChildren();
    showStart('Document closed. A new pecha will start with default settings. Browser recovery, when available, can reopen the previous document.');
  });
  $('revertDoc').addEventListener('click', () => {
    if (!savedCheckpoint) return;
    if (!confirm('Discard changes since this document was opened or the full Save command was last used? This cannot be undone.')) return;
    const warnings = [...$('importMessages').children].map(li => li.textContent);
    const checkpoint = savedCheckpoint;
    setDoc(checkpoint.doc, checkpoint.isSample, checkpoint.source);
    reportImport(warnings);
    persist();
    toast('Restored the opened document or full-Save checkpoint.');
  });
  $('printBtn').addEventListener('click', openPrintPanel);
  for (const [id, direction] of [['previousPreview', -1], ['nextPreview', 1]]) {
    $(id).addEventListener('click', () => {
      previewStart = Math.max(0, previewStart + direction * PREVIEW_PAGES);
      render(); $('table').scrollTop = 0;
    });
  }
  $('goPageForm').addEventListener('submit', event => {
    event.preventDefault();
    const page = Number($('goPage').value);
    if (!Number.isInteger(page) || page < 1 || page > latest.pages.length) return;
    setView('pages', true);
    previewStart = page - 1;
    render(); $('table').scrollTop = 0;
  });
  document.addEventListener('keydown', event => {
    if (!doc || $('work').hidden || $('dctDialog').open || event.isComposing) return;
    if(event.key==='Escape' && $('characterPicker').open && (event.target===$('text') || $('characterPicker').contains(event.target))){
      event.preventDefault();$('characterPicker').open=false;$('text').focus();return;
    }
    if(event.altKey || !(event.ctrlKey || event.metaKey))return;
    const key = event.key.toLowerCase();
    if (key === 'g') {
      event.preventDefault(); $('goPage').focus(); $('goPage').select();
    } else if (key === 's' && !event.shiftKey) {
      event.preventDefault(); if (!event.repeat) saveFile();
    } else if (event.target === $('text') && !event.isComposing) {
      if(key==='i'&&!event.shiftKey){event.preventDefault();$('characterPicker').open=true;$('characterSource').focus();}
      else if(key==='k'&&!event.shiftKey){event.preventDefault();if(!event.repeat){$('lockedKeyboard').checked=!$('lockedKeyboard').checked;refreshLockedKeyboard();}}
      else if (key === 'enter' || key === '\\') {
        event.preventDefault(); insertAtCursor(key === 'enter' ? '{page}' : '{hs}');
      } else if (key === '<' || key === '>' || (event.shiftKey && (event.code === 'Comma' || event.code === 'Period'))) {
        event.preventDefault(); $(key === '<' || event.code === 'Comma' ? 'previousCode' : 'nextCode').click();
      }
    }
  });
  $('printSteps').addEventListener('click', e => { const b = e.target.closest('[data-pass]'); if (b) printNow(b.dataset.pass); });
  // The browser's own print command prints both sides in one file, or the proof.
  window.addEventListener('beforeprint', () => { if (doc && !printPass) buildPrint(doc.print.sides === 'sequence' ? 'sequence' : 'duplex'); });
  window.addEventListener('afterprint', () => {
    if (printPass === 'fronts') toast('Now turn the printed stack over its top edge, put it back in the tray, and print the backs.');
    printPass = null;
  });
  let resizing = null;
  window.addEventListener('resize', () => { clearTimeout(resizing); resizing = setTimeout(() => { if (!$('start').hidden) drawFlags(); }, 150); });
  for (const name of LegacyCharacters.fontNames(LEGACY_TABLE)) {
    const option=document.createElement('option');option.value=name;option.textContent=name;$('characterSource').append(option);
  }
  $('characterSource').addEventListener('change',buildCharacterPicker);
  $('characterGroup').addEventListener('change',buildCharacterPicker);
  $('characterFont').addEventListener('change',buildCharacterPicker);
  $('characterPicker').addEventListener('toggle',()=>{if($('characterPicker').open)refreshCharacterFonts();});
  $('text').addEventListener('select',refreshCharacterPreview);
  $('text').addEventListener('keyup',refreshCharacterPreview);
  $('text').addEventListener('click',refreshCharacterPreview);
  buildCharacterPicker();
  const params = new URLSearchParams(location.search);
  setView('pages', true);
  if (params.has('sample')) setDoc(sampleDoc(), true); else showStart();
  if (params.has('sheets')) setView('sheets');
  if (params.has('print')) { printPass = params.get('print') || null; buildPrint(printPass || undefined); }
}

function setView(v, quiet) {
  if (view !== v) previewStart = 0;
  view = v;
  segment($('viewSeg'), [['pages', 'Pages'], ['sheets', 'Print sheets']], view, x => setView(x));
  if (!quiet && doc) render();
}

Promise.all(['Jomolhari', 'Noto Serif Tibetan'].map(f => document.fonts.load(`20px "${f}"`, 'ཀ'))).catch(() => {}).then(init);
