// Reader for PechaMaker .pxp / .pxc / .pxt files. Written from the sample files and the User's
// Guide, not from the program. A file is: a header with a font table, a NON-BODY block of
// "iNiT key=value" lines, a TEMPLATE block in INI form, then the body byte stream.
const Pxp = (() => {
  const LAT = (b, s, e) => Array.from(b.subarray(s, e), c => String.fromCharCode(c)).join('');

  function indexOf(b, needle, from = 0) {
    outer: for (let i = from; i <= b.length - needle.length; i++) {
      for (let j = 0; j < needle.length; j++) if (b[i + j] !== needle.charCodeAt(j)) continue outer;
      return i;
    }
    return -1;
  }

  function parseFonts(head) {
    const fonts = {};
    const list = head.replace(/^.*?u4 \d+ \d+ \d+ /s, '');
    const re = /(\d+) \d+ ([^\0]+)\0/g;
    let m;
    while ((m = re.exec(list))) fonts[+m[1]] = m[2];
    return fonts;
  }

  // Values of keys ending in ".s" or "Stream" are raw bytes: newline, slen bytes, newline.
  function parseNonBody(b, start, end) {
    const out = {}, raw = {};
    let i = start, lastLen = 0;
    while (i < end) {
      let nl = i;
      while (nl < end && b[nl] !== 10) nl++;
      const line = LAT(b, i, nl);
      i = nl + 1;
      const m = /^iNiT ([^=]+)=(.*)$/.exec(line);
      if (!m) continue;
      const [, k, v] = m;
      if (/(\.s|Stream)$/.test(k)) {
        raw[k] = b.subarray(i, i + lastLen);
        i += lastLen + 1;
      } else {
        out[k] = v;
        if (/(slen|Len)$/.test(k)) lastLen = +v;
      }
    }
    return { values: out, raw };
  }

  function parseIni(text) {
    const out = {};
    let sec = '';
    for (const line of text.split('\n')) {
      const s = /^\[(.+)\]$/.exec(line.trim());
      if (s) { sec = s[1]; out[sec] = {}; continue; }
      const kv = /^([^=]+)=(.*)$/.exec(line.trim());
      if (kv && sec) out[sec][kv[1]] = kv[2];
    }
    return out;
  }

  // Turns a coded byte stream into a list of events.
  //   0x11 op a b c 0x11   format code (font, size, style, colour, alignment)
  //   0x14 x font ch y 0x14  stack character taken from another font of the set
  function decodeStream(bytes, fonts, table, startFont = 0) {
    const ev = [];
    let font = startFont, buf = '';
    const unknown = {};
    const flush = () => { if (buf) { ev.push({ t: 'text', s: buf }); buf = ''; } };
    const map = (fontId, c) => {
      const name = fonts[fontId] || '';
      const t = table[name];
      if (t) {
        if (t[c] !== undefined) return t[c];
        if (c === 32) return ' ';
        unknown[name + ':' + c] = (unknown[name + ':' + c] || 0) + 1;
        return '';
      }
      return String.fromCharCode(c);   // western font: Latin-1 is close enough for a first pass
    };
    for (let i = 0; i < bytes.length; i++) {
      const c = bytes[i];
      if (c === 0x11 && bytes[i + 5] === 0x11) {
        const op = bytes[i + 1], a = bytes[i + 2], b = bytes[i + 3], d = bytes[i + 4];
        flush();
        if (op === 0x20) font = a;                 // font name
        ev.push({ t: 'code', op, a, b, d, font });
        i += 5;
      } else if (c === 0x14 && bytes[i + 5] === 0x14) {
        buf += map(bytes[i + 2], bytes[i + 3]);
        i += 5;
      } else if (c === 13 || c === 10) {
        flush(); ev.push({ t: 'hr' });
        if (c === 13 && bytes[i + 1] === 10) i++;
      } else if (c === 12) {
        flush(); ev.push({ t: 'page' });
      } else if (c === 9) {
        buf += '\t';
      } else {
        buf += map(font, c);
      }
    }
    flush();
    return { ev, unknown };
  }

  function parse(u8, table) {
    const b = u8 instanceof Uint8Array ? u8 : new Uint8Array(u8);
    const sNB = indexOf(b, '[START NON-BODY]');
    const eNB = indexOf(b, '[END NON-BODY]');
    const sT = indexOf(b, '[START TEMPLATE]');
    const eT = indexOf(b, '[END TEMPLATE]');
    if (LAT(b, 0, 4) !== '.pxp' && sNB < 0) throw new Error('Not a PechaMaker file');
    const fonts = parseFonts(LAT(b, 0, sNB < 0 ? 200 : sNB));
    const nb = sNB >= 0 ? parseNonBody(b, sNB + 17, eNB) : { values: {}, raw: {} };
    const tpl = sT >= 0 ? parseIni(LAT(b, sT + 16, eT)) : {};
    let bodyStart = eT >= 0 ? eT + 15 : (eNB >= 0 ? eNB + 15 : 0);
    return { version: LAT(b, 0, 12), fonts, nonBody: nb, template: tpl, body: b.subarray(bodyStart) };
  }

  const ALIGN = { 0x32: 'l', 0x33: 'r', 0x34: 'c', 0x35: 'j' };
  const TIB_SCALE = 0.75;   // TibetanMachine is drawn smaller on its em than Jomolhari

  // Events to the {code} text the engine reads. Colours and sizes carry over as the file has them.
  function eventsToText(ev, isTibetanFont) {
    let out = '', written = null, raw = null, font = 0;
    for (const e of ev) {
      if (e.t === 'text') {
        const v = raw === null ? null : Math.round(raw * (isTibetanFont(font) ? TIB_SCALE : 1));
        if (v && v !== written) { out += `{${v}}`; written = v; }
        out += e.s.replace(/[{}]/g, '');
      }
      else if (e.t === 'hr') out += '\n';
      else if (e.t === 'page') out += '{page}';
      else if (e.op === 0x20) font = e.a;
      else if (e.op === 0x21) raw = e.b;
      else if (e.op === 0x22) {
        const hex = [e.a, e.b, e.d].map(c => c.toString(16).padStart(2, '0')).join('');
        out += hex === '000000' ? '{color}' : `{#${hex}}`;
      }
      else if (e.op === 0x23) out += e.a ? '{b}' : '{/b}';
      else if (e.op === 0x24) out += e.a ? '{i}' : '{/i}';
      else if (ALIGN[e.op]) out += `{${ALIGN[e.op]}}`;
      else if (e.op === 0x48) out += '\t';
    }
    return out;
  }

  function plainText(bytes, fonts, table) {
    if (!bytes || !bytes.length) return '';
    return decodeStream(bytes, fonts, table).ev.filter(e => e.t === 'text').map(e => e.s).join('').trim();
  }

  const num = (v, d) => (v === undefined || v === '' || Number.isNaN(+v) ? d : +v);
  const on = (v, d) => (v === undefined ? d : +v !== 0);

  // Fills an engine document from a parsed file. Box geometry carries across unchanged. The first
  // line position does not, because the old fonts hang from the baseline, so it goes back to auto.
  function toDoc(u8, table, base, Engine) {
    const p = parse(u8, table);
    const d = base, t = p.template, v = p.nonBody.values, raw = p.nonBody.raw;
    const fontScale = TIB_SCALE;
    const { ev, unknown } = decodeStream(p.body, p.fonts, table);
    d.text = eventsToText(ev, id => !!table[p.fonts[id]]).replace(/\s+$/, '');
    d.flow = false;
    const S = t.PageSetup;
    if (S) {
      let w = num(S['PaperSize.x'], 11000) / 1000, h = num(S['PaperSize.y'], 8500) / 1000;
      if (+S.PageOrientation === 2 && w < h) [w, h] = [h, w];
      d.paper = { name: 'Custom', w, h };
      d.margins = { left: num(S['PageMargin.left'], 500) / 1000, right: num(S['PageMargin.right'], 500) / 1000 };
      d.pecha.perSheet = num(S.PechaPagesPerSheet, 1);
    }
    const C = t.PechaControl;
    if (C) { d.pecha.height = num(C.PechaHeight, 2.5); d.pecha.dlt = num(C.PechaboxDLT, 0.03); }
    const A = t.PechaAnnotation;
    if (A) {
      d.notes.outLeft = num(A.AnnoOutLeftSpace, 0);
      d.notes.outRight = num(A.AnnoOutRightSpace, 0);
      d.folio.inset = num(A.FolioNumInset, 0.1);
      d.folio.size = num(A.FolioNumPtSz, 20) * fontScale;
      d.pageNum.inset = num(A.PageNumInset, 0.05);
      d.pageNum.size = num(A.PageNumPtSz, 12);
    }
    let prevEnd = 0;
    for (const i of [0, 1, 2]) {
      const s = t[`Type_${i}`];
      if (!s) continue;
      const kind = (s.PageType || '').toLowerCase();
      if (!d.types[kind]) continue;
      const end = num(s.EndPage, 0);
      if (kind !== 'body') { d.counts[kind] = Math.max(0, end - prevEnd); prevEnd = Math.max(prevEnd, end); }
      Object.assign(d.types[kind], {
        lines: num(s.LinesPerPage, 6), lineHeight: num(s.LineHeight, 0.38), top: null,
        side: num(s.MarginSide, 0.05),
        style: ['none', 'single', 'double'][num(s.BoxLinestyle, 2)] || 'double',
        color: '#' + (s.BoxColor || '0x000000').slice(2).match(/../g).reverse().join(''),
        sideIn: num(s.SideBoxIn, 0), sideOut: num(s.SideBoxOut, 0),
        insideOn: on(s.InBoxEn, false), inside: num(s.InBox, 0.2),
        squeezeOn: on(s.OutBoxEn, false), squeeze: num(s.OutBox, 0),
      });
    }
    const sizes = ev.filter(e => e.t === 'code' && e.op === 0x21).map(e => e.b);
    if (sizes.length) for (const k of ['title', 'fancy', 'body']) d.types[k].fontSize = Math.round(sizes[sizes.length - 1] * fontScale);
    d.shad = { enabled: on(v.AutoShadEn, true), yang: on(v.YangShadEn, true), ignoreYigo: on(v.IgnoreYigoShadEn, false), titlePages: on(v.TitleShadEn, false) };
    d.dzog.enabled = on(v.DzogThikEn, false);
    d.yigo.enabled = on(v['Yigo.en'], true);
    const yig = plainText(raw['Yigo.s'], p.fonts, table);
    if (yig) d.yigo.text = yig;
    d.yigo.fancyStart = on(v.YigoStartFancy, true);
    d.yigo.title2 = on(v.YigoStart2ndTitle, false);
    d.folio.start = num(v.FolioStartNum, 1);
    d.folio.onTitle = on(v.FolioNumTitleEn, false);
    d.folio.jyon = on(v.FolioNumJyonEn, false);
    if (on(v.FolioRhinoEn, false)) d.folio.rhino = plainText(raw.FolioRhinoStream, p.fonts, table);
    d.pageNum.start = num(v.PageStartNum, 1);
    d.pageNum.on = d.pageNum.start > 0;
    d.pageNum.onTitle = on(v.PageNumTitleEn, false);
    ['title.front', 'title.back', 'fancy.front', 'fancy.back', 'body.front', 'body.back'].forEach((key, i) => {
      const slot = (name, inset) => {
        const text = plainText(raw[`${name}[${i}].s`], p.fonts, table);
        return { on: on(v[`${name}[${i}].en`], !!text) && !!text, text, size: num(v[`${name}[${i}].ptSz`], 14) * fontScale, inset: num(v[`${name}[${i}].insetF`], inset) };
      };
      const set = Engine.noteSet({ inL: slot('AnnoInL', 0.1), inR: slot('AnnoInR', 0.1), outL: slot('AnnoOutL', 0.1), outR: slot('AnnoOutR', 0.1) });
      if (i % 2 === 0) {
        const below = plainText(raw[`AnnoInLL[${i / 2}].s`], p.fonts, table);
        set.inB = { on: !!below && set.inL.on, text: below, size: set.inL.size, inset: set.inL.inset };
      }
      d.notes.sets[key] = set;
    });
    return { doc: d, unknown: Object.keys(unknown).length };
  }

  return { parse, decodeStream, eventsToText, toDoc };
})();
if (typeof module !== 'undefined') module.exports = Pxp;
