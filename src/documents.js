// Browser document files. These JSON formats are independent of Windows PechaMaker's formats.
const Documents = (() => {
  const clone = value => JSON.parse(JSON.stringify(value));
  const layoutKeys = ['font', 'fontName', 'textSize', 'roles', 'tabWidth', 'tibetanRaise', 'kerning', 'paper', 'margins', 'pecha', 'normal', 'counts', 'types', 'shad', 'yigo', 'dzog', 'print'];
  const annotationKeys = ['folio', 'pageNum', 'notes', 'sectionLabels'];
  // Keep only known fields, merge older documents with defaults, and never assign prototype keys.
  function merge(base, input) {
    const out = clone(base);
    if (!input || typeof input !== 'object' || Array.isArray(input)) return out;
    for (const key of Object.keys(base)) {
      const value = input[key];
      if (value === undefined) continue;
      if (base[key] && typeof base[key] === 'object') out[key] = merge(base[key], value);
      else if (base[key] === null) out[key] = value === null || (typeof value === 'number' && Number.isFinite(value)) ? value : null;
      else if (typeof value === typeof base[key] && (typeof value !== 'number' || Number.isFinite(value))) out[key] = value;
    }
    return out;
  }
  function normalize(input, Engine) {
    if (!input || input.version !== 1 || typeof input.text !== 'string') throw new Error('Not a web pecha document');
    if (Array.isArray(input.sections) && input.sections.length > 200) throw new Error('Too many texts in this volume');
    const d = merge(Engine.defaultDoc(), input);
    Object.assign(d, PechaImages.normalize(input));
    if (!d.images.some(p => p.id === d.yigo.image && p.kind === 'yigo')) d.yigo.image = '';
    d.sections = Array.isArray(input.sections) ? input.sections.map((s, i) => ({
      name: typeof s.name === 'string' ? s.name : `Text ${i + 1}`,
      text: typeof s.text === 'string' ? s.text : '',
      folioStart: Number.isFinite(s.folioStart) ? Math.max(0, Math.min(9999, Math.round(s.folioStart))) : 1,
      restartLayout: s.restartLayout !== false,
    })) : [];
    const bound = (o, k, min, max, integer = false) => { o[k] = Math.max(min, Math.min(max, integer ? Math.round(o[k]) : o[k])); };
    for (const k of ['w', 'h']) bound(d.paper, k, 2, 60);
    for (const k of ['left', 'right', 'top', 'bottom']) bound(d.margins, k, 0, 20);
    bound(d.pecha, 'perSheet', 1, 8, true); bound(d.pecha, 'height', 0.5, 30);
    bound(d.dzog, 'rise', 0, 30); bound(d.dzog, 'percent', 0, 100);
    bound(d.dzog, 'leftUp', 0, 2); bound(d.dzog, 'rightUp', 0, 2);
    bound(d.normal, 'lineHeight', .05, 10); bound(d.normal, 'baseline', 0, 10);
    bound(d, 'tabWidth', 0.05, 20);
    bound(d, 'tibetanRaise', -2, 2);
    if (d.textSize !== null) bound(d, 'textSize', 5, 200);
    for (const k of ['title', 'fancy']) bound(d.counts, k, 0, 1000, true);
    for (const t of Object.values(d.types)) { bound(t, 'lines', 1, 100, true); bound(t, 'fontSize', 5, 200); bound(t, 'lineHeight', 0.05, 10); }
    for (const r of Object.values(d.roles)) { bound(r, 'size', 5, 200); if (!['Jomolhari', 'Noto Serif Tibetan'].includes(r.font)) r.font = 'Jomolhari'; }
    if (!['', 'Jomolhari', 'Noto Serif Tibetan'].includes(d.folio.font)) d.folio.font = '';
    if (!['Georgia', 'Jomolhari', 'Noto Serif Tibetan'].includes(d.pageNum.font)) d.pageNum.font = 'Georgia';
    if (d.pecha.placement === 'top') d.pecha.perSheet = 1;
    return d;
  }
  function artifact(doc, kind) {
    if (kind === 'document') return clone(doc);
    const keys = kind === 'template' ? layoutKeys : kind === 'annotations' ? annotationKeys : ['text', 'flow', 'sections', 'assets', 'images'];
    return { format: 'web-pecha-part', version: 1, kind, settings: Object.fromEntries(keys.map(k => [k, clone(doc[k])])) };
  }
  function apply(current, saved, Engine) {
    if (saved.format !== 'web-pecha-part') return normalize(saved, Engine);
    if (saved.version !== 1 || !['template', 'annotations', 'content'].includes(saved.kind)) throw new Error('Unknown pecha file');
    const keys = saved.kind === 'template' ? layoutKeys : saved.kind === 'annotations' ? annotationKeys : ['text', 'flow', 'sections', 'assets', 'images'];
    const combined = clone(current || Engine.defaultDoc());
    for (const k of keys) if (saved.settings && Object.hasOwn(saved.settings, k)) combined[k] = saved.settings[k];
    if (saved.kind === 'template' && !combined.images.some(p => p.id === combined.yigo.image)) combined.yigo.image = '';
    return normalize(combined, Engine);
  }
  function newContent(current, Engine) {
    const d = Engine.defaultDoc();
    if (!current) return d;
    d.notes = clone(current.notes); d.yigo = clone(current.yigo);
    d.folio.rhino = current.folio.rhino;
    // Retain only the active yi-go image, never prior body/page pictures.
    d.images = clone(current.images.filter(p => p.kind === 'yigo' && p.id === d.yigo.image));
    d.assets = clone(current.assets.filter(a => d.images.some(p => p.asset === a.id)));
    if (!d.images.length) d.yigo.image = '';
    return d;
  }
  return { normalize, artifact, apply, newContent };
})();
if (typeof module !== 'undefined') module.exports = Documents;
