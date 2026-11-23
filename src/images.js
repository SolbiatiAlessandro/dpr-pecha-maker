// Embedded PNG assets and independent placements. No image URLs are fetched by the renderer.
const PechaImages = (() => {
  const anchors = ['outer-left', 'inner-left', 'text-left', 'text-right', 'inner-right', 'outer-right'];
  const clamp = (v, lo, hi, fallback) => Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : fallback;
  function placement(over = {}) {
    return {id: '', asset: '', kind: 'inline', page: 1, anchor: 'text-left', scale: 100,
      dpi: 96, dpiY: null, ignoreDpi: false, above: .3, addTibetan: false, space: .03, down: 0, inward: 0, margin: .05, ...over};
  }
  function normalize(input) {
    const assets = [], images = [], seen = new Set();
    for (const a of (Array.isArray(input.assets) ? input.assets : []).slice(0, 200)) {
      if (!a || typeof a.id !== 'string' || !/^[\w-]+$/.test(a.id) || seen.has(a.id)) continue;
      if (typeof a.data !== 'string' || a.data.length > 12000000 || !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(a.data)) continue;
      assets.push({id: a.id, data: a.data, width: clamp(a.width, 1, 20000, 1), height: clamp(a.height, 1, 20000, 1)}); seen.add(a.id);
    }
    seen.clear();
    for (const x of (Array.isArray(input.images) ? input.images : []).slice(0, 1000)) {
      if (!x || typeof x.id !== 'string' || !/^[\w-]+$/.test(x.id) || seen.has(x.id) || !assets.some(a => a.id === x.asset)) continue;
      const p = placement({id: x.id, asset: x.asset, kind: ['inline','page','yigo'].includes(x.kind) ? x.kind : 'inline'});
      p.anchor = anchors.includes(x.anchor) ? x.anchor : 'text-left';
      p.page = Math.round(clamp(x.page, 1, 3000, 1)); p.scale = clamp(x.scale, p.kind === 'page' ? 20 : 10, 200, 100);
      p.dpi = clamp(x.dpi, 10, 2400, 96); p.ignoreDpi = x.ignoreDpi === true; p.addTibetan = x.addTibetan === true;
      p.dpiY = x.dpiY == null ? null : clamp(x.dpiY, 10, 2400, p.dpi);
      for (const k of ['above','down','inward']) p[k] = clamp(x[k], -30, 30, p[k]);
      for (const k of ['space','margin']) p[k] = clamp(x[k], 0, 20, p[k]);
      images.push(p); seen.add(p.id);
    }
    return {assets, images};
  }
  // Copy/move inline placement, sharing embedded pixels and resetting layout controls.
  function transferInline(doc, id, newId, section, cursor, move = false) {
    const original = doc.images.find(p => p.id === id && p.kind === 'inline');
    if (!original || doc.images.some(p => p.id === newId) || doc.images.length >= 1000) return null;
    const target = doc.sections.length ? doc.sections[section] : doc;
    if (!target) return null;
    const token = `{image:${id}}`;
    cursor = Math.max(0, Math.min(target.text.length, cursor));
    for (const m of target.text.matchAll(/\{[^}]*\}/g)) {
      if (cursor > m.index && cursor < m.index + m[0].length) { cursor = m.index + m[0].length; break; }
    }
    if (move) {
      const before = target.text.slice(0, cursor);
      cursor -= before.length - before.split(token).join('').length;
      doc.text = doc.text.split(token).join('');
      for (const s of doc.sections) s.text = s.text.split(token).join('');
      doc.images = doc.images.filter(p => p.id !== id);
    }
    const added = placement({id:newId, asset:original.asset, dpi:original.dpi, dpiY:original.dpiY ?? null});
    doc.images.push(added);
    const inserted = `{image:${newId}}`;
    target.text = target.text.slice(0,cursor) + inserted + target.text.slice(cursor);
    return {placement:added, cursor:cursor+inserted.length};
  }
  function dimensions(doc, p) {
    const asset = doc.assets.find(a => a.id === p.asset);
    if (!asset) return null;
    const dpiX = p.ignoreDpi ? 96 : p.dpi;
    const dpiY = p.ignoreDpi ? 96 : (p.dpiY ?? p.dpi);
    return {asset, w: asset.width * 72 / dpiX * p.scale / 100,
      h: asset.height * 72 / dpiY * p.scale / 100};
  }
  function pageRect(doc, placement, boxes, type) {
    if (placement.kind !== 'page') return null;
    const size = dimensions(doc, placement); if (!size) return null;
    const {I, T, d, lx1, rx1} = boxes, anchor = placement.anchor, right = anchor.endsWith('right');
    if (anchor.startsWith('outer') && !type.sideOut) return null;
    if (anchor.startsWith('inner') && !type.sideIn) return null;
    const edge = anchor.startsWith('text') ? (right ? T.x1 : T.x0)
      : anchor.startsWith('outer') ? (right ? I.x1 - d : I.x0 + d)
      : (right ? rx1 - d : lx1 + d);
    return {...size, x: right ? edge - placement.inward * 72 - size.w : edge + placement.inward * 72,
      y: (anchor.startsWith('text') ? T.y0 : I.y0 + d) + placement.down * 72, placement};
  }
  function pngResolution(bytes) {
    if (bytes.length < 8 || bytes[0] !== 137 || bytes[1] !== 80) return null;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (let i = 8; i + 12 <= bytes.length;) {
      const len = view.getUint32(i); if (i + 12 + len > bytes.length) break;
      if (String.fromCharCode(...bytes.slice(i + 4, i + 8)) === 'pHYs' && len === 9 && bytes[i + 16] === 1) {
        const x = view.getUint32(i + 8) * .0254, y = view.getUint32(i + 12) * .0254;
        return x > 0 && y > 0 ? {x, y} : null;
      }
      i += len + 12;
    }
    return null;
  }
  const pngDpi = bytes => pngResolution(bytes)?.x ?? null;
  return {anchors, placement, normalize, dimensions, pageRect, pngDpi, pngResolution, transferInline};
})();
if (typeof module !== 'undefined') module.exports = PechaImages;
