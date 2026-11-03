// Pecha layout engine: text stream -> atoms -> lines -> pages -> SVG -> sheets.
// All geometry is in points (72 per inch). Stored settings are in inches, like the printed page.
const Engine = (() => {
  const PT = 72;
  const TSEK = '་', SHAD = '།', RINCHEN = '༑';
  const HARD_SHAD = '';                                  // private use: shows as a shad, never converted
  const isTib = c => c >= 'ༀ' && c <= '࿿';
  const isClosing = c => /[།-༒༔]/.test(c);
  const isYigMgo = c => /[༁-༊]/.test(c);

  const pageType = (over = {}) => ({
    lines: 5, lineHeight: 0.40, top: null, side: 0.08, style: 'double', color: '#000000',
    sideIn: 0, sideOut: 0.42, insideOn: false, inside: 0.2, squeezeOn: false, squeeze: 0.1,
    fontSize: 23, ...over,
  });

  const noteSlot = (text = '', size = 13, inset = 0.1) => ({ on: !!text, text, size, inset });
  const noteSet = (over = {}) => ({
    inL: noteSlot(), inB: noteSlot(), inR: noteSlot(), outL: noteSlot(), outR: noteSlot(), ...over,
  });

  function defaultDoc() {
    return {
      version: 1,
      text: '',
      flow: true,
      font: "'Jomolhari','Noto Serif Tibetan',serif",
      fontName: 'Jomolhari',
      tabWidth: 0.5,
      paper: { name: 'A4', w: 11.69, h: 8.27 },
      margins: { left: 0.3, right: 0.3 },
      pecha: { height: 2.55, dlt: 0.03, perSheet: 3 },
      counts: { title: 1, fancy: 2 },
      types: {
        title: pageType({ lines: 2, lineHeight: 0.5, fontSize: 25, sideIn: 0.42, sideOut: 0.72, insideOn: true, inside: 0.32, squeezeOn: true, squeeze: 0.14 }),
        fancy: pageType({ lines: 3, lineHeight: 0.5, fontSize: 26, sideIn: 0.42, sideOut: 1.0, insideOn: true, inside: 0.28 }),
        body: pageType(),
      },
      shad: { enabled: true, yang: true, ignoreYigo: false, titlePages: false },
      yigo: { enabled: true, text: '༄༅༅། །', fancyStart: true, title2: false },
      dzog: { enabled: true, rise: 0.05 },
      folio: { start: 1, onTitle: false, jyon: false, inset: 0.1, size: 13, rhino: '' },
      pageNum: { start: 1, onTitle: false, inset: 0.05, size: 9, on: true },
      notes: {
        outLeft: 0, outRight: 0,
        sets: {
          'title.front': noteSet(), 'title.back': noteSet(),
          'fancy.front': noteSet(), 'fancy.back': noteSet(),
          'body.front': noteSet(), 'body.back': noteSet(),
        },
      },
      print: { sides: 'duplex', cutMarks: true, stack: false, turnBacks: false, reverseBacks: false, firstOnly: false },
    };
  }

  // ---------- stream ----------

  // Format codes sit in the text, as in PechaMaker: {c} {j} {l} {r} {30} {#b03020} {b} {/b} {i} {/i} {page}
  function parseStream(text, flow) {
    const style = { align: 'j', size: null, color: null, bold: false, italic: false };
    const items = [];
    const src = prepareBreaks(text || '', flow);
    const re = /\{([^{}\n]*)\}/g;
    let last = 0, m;
    const pushText = s => { if (s) items.push({ k: 'text', s, style: { ...style } }); };
    while ((m = re.exec(src))) {
      pushText(src.slice(last, m.index));
      last = re.lastIndex;
      for (const tok of m[1].trim().split(/\s+/)) {
        if (tok === 'c' || tok === 'center') style.align = 'c';
        else if (tok === 'j' || tok === 'justify') style.align = 'j';
        else if (tok === 'l' || tok === 'left') style.align = 'l';
        else if (tok === 'r' || tok === 'right') style.align = 'r';
        else if (tok === 'page') items.push({ k: 'page' });
        else if (tok === 'hs') pushText(HARD_SHAD);
        else if (tok === 'b') style.bold = true;
        else if (tok === '/b') style.bold = false;
        else if (tok === 'i') style.italic = true;
        else if (tok === '/i') style.italic = false;
        else if (/^\d+(\.\d+)?$/.test(tok)) style.size = +tok;
        else if (/^#[0-9a-f]{3,6}$/i.test(tok)) style.color = tok;
        else if (tok === 'size') style.size = null;
        else if (tok === 'color') style.color = null;
      }
    }
    pushText(src.slice(last));
    return items;
  }

  // Flow mode: pasted verses run on, and a blank line is a hard return. Shad and tsheg at the end
  // of a verse join the next verse with no added space, which is how a pecha reads.
  function prepareBreaks(text, flow) {
    const t = text.replace(/\r\n?/g, '\n');
    if (!flow) return t.replace(/\n/g, ' ');
    return t
      .split(/\n[ \t]*\n+/)
      .map(par => par.split('\n').map(l => l.trim()).filter(Boolean).reduce((acc, line) => {
        if (!acc) return line;
        const end = acc[acc.length - 1];
        const twoShads = end === SHAD && line[0] === SHAD;     // a shad pair split across two lines keeps its gap
        return acc + (isTib(end) && !twoShads ? '' : ' ') + line;
      }, ''))
      .join(' ');
  }

  function splitAtoms(s) {
    const out = [];
    let cur = '', sawLetter = false;
    const push = gap => {
      if (cur) out.push({ s: cur, gap, spaces: 0 });
      cur = ''; sawLetter = false;
    };
    for (let i = 0; i < s.length; i++) {
      const ch = s[i], nx = s[i + 1] || '';
      if (ch === ' ') { push('none'); out.push({ hr: true }); continue; }
      if (ch === '\t') { push('none'); out.push({ tab: true }); continue; }
      if (ch === ' ' || ch === ' ') {
        if (cur) push('space');
        if (out.length) { const a = out[out.length - 1]; if (a.s !== undefined) { a.gap = 'space'; a.spaces++; } }
        continue;
      }
      cur += ch;
      if (!isClosing(ch) && ch !== TSEK) sawLetter = true;
      if (ch === TSEK) {
        if (!isClosing(nx)) push('tsheg');
      } else if (isClosing(ch) && sawLetter && nx && nx !== ' ' && !isClosing(nx)) {
        push('tsheg');
      } else if (!isTib(ch) && isTib(nx)) {
        push('tsheg');
      }
    }
    push('none');
    return out;
  }

  function atomize(items, doc, measure) {
    const atoms = [];
    for (const it of items) {
      if (it.k === 'page') { atoms.push({ page: true }); continue; }
      for (const a of splitAtoms(it.s)) atoms.push({ ...a, style: it.style });
    }
    return atoms;
  }

  // ---------- geometry ----------

  function boxes(doc, type) {
    const w = (doc.paper.w - doc.margins.left - doc.margins.right) * PT;
    const h = doc.pecha.height * PT;
    const sq = type.squeezeOn ? type.squeeze * PT : 0;
    const O = { x0: sq + doc.notes.outLeft * PT, y0: sq, x1: w - sq - doc.notes.outRight * PT, y1: h - sq };
    const ins = type.insideOn ? type.inside * PT : 0;
    const I = { x0: O.x0 + ins, y0: O.y0 + ins, x1: O.x1 - ins, y1: O.y1 - ins };
    const d = type.style === 'double' ? doc.pecha.dlt * PT : 0;
    const cellA = type.sideOut * PT, cellB = type.sideIn * PT;
    const lx1 = I.x0 + d + cellA, lx2 = lx1 + (cellB ? d + cellB : 0);
    const rx1 = I.x1 - d - cellA, rx2 = rx1 - (cellB ? d + cellB : 0);
    const inner = (cellA ? d : 0);
    const T = {
      x0: lx2 + inner + type.side * PT, x1: rx2 - inner - type.side * PT,
      y0: I.y0 + d, y1: I.y1 - d,
    };
    return { w, h, O, I, T, d, lx1, lx2, rx1, rx2 };
  }

  function typeOfPage(doc, n) {
    const { title, fancy } = doc.counts;
    if (n <= title) return 'title';
    if (n <= title + fancy) return 'fancy';
    return 'body';
  }

  // ---------- lines and pages ----------

  function yigoWanted(doc, n, kind, isFirstFancy) {
    if (!doc.yigo.enabled) return false;
    if (kind === 'title') return doc.yigo.title2 && n > 1 && n % 2 === 1;
    if (kind === 'fancy' && !doc.yigo.fancyStart) return false;
    if (isFirstFancy) return true;
    return n % 2 === 1;
  }

  function fontFor(doc, atom, sizeDefault) {
    const st = atom.style || {};
    const size = st.size || sizeDefault;
    return { size, weight: st.bold ? 700 : 400, italic: !!st.italic, family: doc.font };
  }

  function fillLine(atoms, start, W, doc, sizeDefault, measure, yigo) {
    const items = [];
    let i = start, x = 0, prevGap = 0, hard = false, pageBreak = false, hasTab = false, yigoCount = 0;
    const place = a => {
      const f = fontFor(doc, a, sizeDefault);
      const w = measure(a.s, f);
      const gapW = a.gap === 'space' ? Math.max(measure(' ', f), f.size * 0.42) * Math.max(1, a.spaces) : 0;
      return { ...a, f, w, gapW };
    };
    if (yigo) {
      for (const a of splitAtoms(doc.yigo.text)) {
        const p = place({ ...a, style: atoms[start].style });
        p.x = x + prevGap; x = p.x + p.w; prevGap = p.gapW;
        items.push(p); yigoCount++;
      }
      const last = items[items.length - 1];
      if (last && last.gap === 'none') { last.gap = 'tsheg'; }
    }
    for (; i < atoms.length; i++) {
      const a = atoms[i];
      if (a.hr) { hard = true; i++; break; }
      if (a.page) { pageBreak = true; hard = true; i++; break; }
      if (a.tab) {
        const tab = doc.tabWidth * PT;
        x = (Math.floor((x + prevGap + 0.01) / tab) + 1) * tab;
        prevGap = 0; hasTab = true;
        continue;
      }
      const p = place(a);
      if (items.length > yigoCount && x + prevGap + p.w > W + 0.01) break;
      if (items.length === yigoCount && yigoCount && x + prevGap + p.w > W) break;
      p.x = x + prevGap;
      x = p.x + p.w; prevGap = p.gapW;
      items.push(p);
    }
    const align = (items.length ? items[items.length - 1].style.align : (atoms[start] && atoms[start].style ? atoms[start].style.align : 'j')) || 'j';
    return { items, next: i, hard, pageBreak, hasTab, align, yigoCount, natural: x };
  }

  // A shad straight after the tsheg-bar that opens a line becomes a rinchen pung shad; display only.
  function convertShads(line, doc, kind, lineIndex, measure) {
    const o = doc.shad;
    if (!o.enabled || !line.items.length) return;
    if (kind === 'title' && (!o.titlePages || lineIndex === 0)) return;
    if (line.yigoCount && /[།]/.test(doc.yigo.text) && !o.ignoreYigo) return;
    const idx = line.yigoCount;
    const a = line.items[idx];
    if (!a || !isTib(a.s[0])) return;
    const m = /^([^་༌།-༔\s]+་?)།/.exec(a.s);
    if (!m) return;
    a.s = m[1] + RINCHEN + a.s.slice(m[0].length);
    a.w = measure(a.s, a.f);
    const b = line.items[idx + 1];
    if (o.yang && b && a.gap === 'space' && b.s[0] === SHAD) {
      b.s = RINCHEN + b.s.slice(1);
      b.w = measure(b.s, b.f);
    }
  }

  function reflow(line, W, justify) {
    let x = 0, spaces = [], tshegs = [];
    const its = line.items;
    its.forEach((p, k) => {
      if (k < its.length - 1) (p.gap === 'space' ? spaces : p.gap === 'tsheg' ? tshegs : []).push(p);
    });
    let extraSpace = 0, extraTsheg = 0;
    if (justify) {
      const natural = its.reduce((s, p, k) => s + p.w + (k < its.length - 1 ? p.gapW : 0), 0);
      const extra = Math.max(0, W - natural);
      if (spaces.length) {
        const cap = (its[0] ? its[0].f.size : 20) * 3.2;
        extraSpace = Math.min(extra / spaces.length, tshegs.length ? cap : Infinity);
        if (tshegs.length) extraTsheg = (extra - extraSpace * spaces.length) / tshegs.length;
      } else if (tshegs.length) {
        extraTsheg = extra / tshegs.length;
      }
    }
    its.forEach((p, k) => {
      p.x = x;
      x += p.w;
      if (k < its.length - 1) x += p.gapW + (p.gap === 'space' ? extraSpace : p.gap === 'tsheg' ? extraTsheg : 0);
    });
    line.width = x;
    const off = line.align === 'c' ? (W - x) / 2 : line.align === 'r' ? W - x : 0;
    if (off > 0) its.forEach(p => { p.x += off; });
    line.endX = x + Math.max(0, off);
  }

  function paginate(doc, atoms, measure) {
    const pages = [];
    let i = 0, firstFancy = true;
    const limit = 3000;
    do {
      const n = pages.length + 1;
      const kind = typeOfPage(doc, n);
      const type = doc.types[kind];
      const B = boxes(doc, type);
      const W = B.T.x1 - B.T.x0;
      const lines = [];
      const isFirstFancy = kind === 'fancy' && firstFancy;
      if (kind === 'fancy') firstFancy = false;
      for (let ln = 0; ln < type.lines && i < atoms.length; ln++) {
        const nextA = atoms[i];
        const startsTib = nextA && nextA.s && isTib(nextA.s[0]) && !isYigMgo(nextA.s[0]);
        const wantYigo = ln === 0 && startsTib && yigoWanted(doc, n, kind, isFirstFancy);
        const line = fillLine(atoms, i, W, doc, type.fontSize, measure, wantYigo);
        if (line.next === i) { line.next = i + 1; }        // an atom wider than the line must not stall the loop
        i = line.next;
        convertShads(line, doc, kind, ln, measure);
        const atEnd = i >= atoms.length;
        reflow(line, W, line.align === 'j' && !line.hard && !atEnd && !line.hasTab);
        lines.push(line);
        if (line.pageBreak) break;
      }
      pages.push({ n, kind, lines, front: n % 2 === 1, boxes: B, type });
    } while (i < atoms.length && pages.length < limit);
    return pages;
  }

  // ---------- rendering ----------

  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(//g, SHAD);
  const num = v => Math.round(v * 100) / 100;

  function textEl(x, y, s, f, color, extra = '') {
    const st = (f.weight > 400 ? ' font-weight="700"' : '') + (f.italic ? ' font-style="italic"' : '');
    return `<text x="${num(x)}" y="${num(y)}" font-size="${num(f.size)}"${color ? ` fill="${color}"` : ''}${st}${extra}>${esc(s)}</text>`;
  }

  function sideText(x, y, s, size, doc, anchor) {
    return `<text transform="translate(${num(x)} ${num(y)}) rotate(-90)" font-size="${num(size)}" text-anchor="${anchor}">${esc(s)}</text>`;
  }

  function drawBoxes(p, doc) {
    const { O, I, d, lx1, lx2, rx1, rx2 } = p.boxes;
    const t = p.type;
    if (t.style === 'none') return '';
    const stroke = `fill="none" stroke="${t.color}" stroke-width="0.7"`;
    const rect = (r, inset = 0) => `<rect x="${num(r.x0 + inset)}" y="${num(r.y0 + inset)}" width="${num(r.x1 - r.x0 - 2 * inset)}" height="${num(r.y1 - r.y0 - 2 * inset)}" ${stroke}/>`;
    let out = rect(O);
    if (d) out += rect(O, d);
    if (t.insideOn) { out += rect(I); if (d) out += rect(I, d); }
    const y0 = I.y0 + d, y1 = I.y1 - d;
    const vert = x => `<line x1="${num(x)}" y1="${num(y0)}" x2="${num(x)}" y2="${num(y1)}" ${stroke}/>`;
    const vs = [];
    if (t.sideOut) vs.push(lx1, rx1);
    if (t.sideIn) vs.push(lx2, rx2);
    for (const x of vs) {
      out += vert(x);
      if (d) out += vert(x < (O.x0 + O.x1) / 2 ? x + d : x - d);
    }
    return out;
  }

  function drawText(p, doc, measure) {
    const { T } = p.boxes, t = p.type;
    const head = measure.head(doc, t.fontSize);
    const room = T.y1 - T.y0;
    const nLines = p.kind === 'title' ? Math.max(1, p.lines.length) : t.lines;   // a short last page starts where full pages do
    const block = (nLines - 1) * t.lineHeight * PT + head.height;
    const start = t.top === null ? T.y0 + (room - block) / 2 : T.y0 + t.top * PT;
    let out = '';
    p.lineTops = [];
    p.lines.forEach((line, ln) => {
      const top = start + ln * t.lineHeight * PT;
      p.lineTops.push(top);
      for (const a of line.items) {
        const h = measure.head(doc, a.f.size, isTib(a.s[0]));
        out += textEl(T.x0 + a.x, top + h.ascent, a.s, a.f, a.style && a.style.color);
      }
    });
    return out;
  }

  function drawDzog(p, doc, measure) {
    const { T } = p.boxes;
    const last = p.lines.length - 1;
    if (last < 0) return '';
    const head = measure.head(doc, p.type.fontSize);
    const yOf = k => p.lineTops[k] + head.height + 1.5;
    const y1 = yOf(last);
    const x = T.x0 + p.lines[last].endX + doc.dzog.rise * PT;
    const stroke = `fill="none" stroke="#000" stroke-width="0.9"`;
    if (last === 0 || x > T.x0 + 0.98 * (T.x1 - T.x0)) {
      return `<path d="M${num(T.x0)} ${num(y1)}H${num(T.x1)}" ${stroke}/>`;
    }
    const y0 = yOf(last - 1);
    return `<path d="M${num(T.x0)} ${num(y1)}H${num(x)}V${num(y0)}H${num(T.x1)}" ${stroke}/>`;
  }

  function drawMargins(p, doc, measure, folioCount) {
    const { O, w, h } = p.boxes;
    const set = doc.notes.sets[`${p.kind}.${p.front ? 'front' : 'back'}`];
    let out = '';
    const asc = size => measure.head(doc, size);
    const pad = 9;
    const midY = (O.y0 + O.y1) / 2;
    const inX = (slot, right) => {
      const m = asc(slot.size);
      return right ? O.x1 - slot.inset * PT - m.descent : O.x0 + slot.inset * PT + m.ascent;
    };
    if (set.inL.on && set.inL.text) out += sideText(inX(set.inL), O.y0 + pad, set.inL.text, set.inL.size, doc, 'end');
    if (set.inB.on && set.inB.text) out += sideText(inX(set.inB), O.y1 - pad, set.inB.text, set.inB.size, doc, 'start');
    if (set.inR.on && set.inR.text) out += sideText(inX(set.inR, true), midY, set.inR.text, set.inR.size, doc, 'middle');
    if (set.outL.on && set.outL.text) out += sideText(set.outL.inset * PT + asc(set.outL.size).ascent, midY, set.outL.text, set.outL.size, doc, 'middle');
    if (set.outR.on && set.outR.text) out += sideText(w - set.outR.inset * PT - asc(set.outR.size).descent, midY, set.outR.text, set.outR.size, doc, 'middle');

    const fo = doc.folio;
    const showFolio = p.front && fo.start > 0 && (p.kind !== 'title' || fo.onTitle);
    if (showFolio) {
      const number = fo.start + (p.n - 1) / 2;
      const isLast = (p.n + 1) / 2 >= folioCount;
      const label = fo.rhino || Folio.words(number) + (fo.jyon && isLast ? Folio.JYON : '');
      const x = O.x0 + fo.inset * PT + asc(fo.size).ascent;
      out += sideText(x, midY, label, fo.size, doc, 'middle');
    }
    const pn = doc.pageNum;
    if (pn.on && pn.start > 0 && (p.kind !== 'title' || pn.onTitle)) {
      const x = O.x1 - pn.inset * PT - 2;
      out += `<text transform="translate(${num(x)} ${num(O.y1 - pad)}) rotate(-90)" font-size="${pn.size}" font-family="Georgia,'Times New Roman',serif">${pn.start + p.n - 1}</text>`;
    }
    return out;
  }

  function pageInner(p, doc, measure, folioCount) {
    const text = drawText(p, doc, measure);
    const isLastPage = p.isLast;
    return `<g text-rendering="geometricPrecision" font-family="${doc.font.replace(/"/g, '&quot;')}" fill="#14100e">`
      + drawBoxes(p, doc) + text
      + (isLastPage && doc.dzog.enabled ? drawDzog(p, doc, measure) : '')
      + drawMargins(p, doc, measure, folioCount)
      + `</g>`;
  }

  function pageSvg(p, doc, measure, folioCount) {
    const { w, h } = p.boxes;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${num(w)} ${num(h)}" role="img" aria-label="Pecha page ${p.n}">${pageInner(p, doc, measure, folioCount)}</svg>`;
  }

  // ---------- sheets ----------

  // Backs run in reverse row order, because a flip along the top edge puts the bottom row behind
  // the top row. With "stack" the first sheet holds folios 1, S+1, 2S+1 so cut piles stay in order.
  // A pecha leaf is read by turning it over its top edge, so the backs of a sheet run in reverse row order.
  // pass: 'duplex' (both sides, alternating), 'fronts' or 'backs' (one side per run through the printer), or 'sequence'.
  function impose(doc, pages, opts = {}) {
    const n = doc.pecha.perSheet;
    const mode = opts.pass || (doc.print.sides === 'manual' ? 'duplex' : doc.print.sides);
    const folios = Math.ceil(pages.length / 2);
    const sheetsNeeded = Math.ceil(folios / n);
    const folioAt = (s, r) => (doc.print.stack ? r * sheetsNeeded + s : s * n + r);
    const pageOf = no => pages[no - 1] || null;
    const sheets = [];
    if (mode === 'sequence') {
      for (let i = 0; i < pages.length; i += n) sheets.push({ side: 'seq', sheet: i / n + 1, slots: Array.from({ length: n }, (_, r) => pages[i + r] || null) });
      return sheets;
    }
    const count = opts.firstOnly ? Math.min(1, sheetsNeeded) : sheetsNeeded;
    for (let s = 0; s < count; s++) {
      const fronts = [], backs = [];
      for (let r = 0; r < n; r++) {
        const f = folioAt(s, r);
        fronts.push(f < folios ? pageOf(2 * f + 1) : null);
        backs.unshift(f < folios ? pageOf(2 * f + 2) : null);
      }
      if (mode !== 'backs') sheets.push({ side: 'front', sheet: s + 1, slots: fronts });
      if (mode !== 'fronts') sheets.push({ side: 'back', sheet: s + 1, slots: backs });
    }
    if (mode === 'backs' && doc.print.reverseBacks) sheets.reverse();
    return sheets;
  }

  function sheetSvg(sheet, doc, measure, folioCount, screen) {
    const W = doc.paper.w * PT, H = doc.paper.h * PT, n = doc.pecha.perSheet;
    const strip = H / n, h = doc.pecha.height * PT, x = doc.margins.left * PT;
    let out = '';
    sheet.slots.forEach((p, r) => {
      if (!p) return;
      const y = r * strip + (strip - h) / 2;
      out += `<g transform="translate(${num(x)} ${num(y)})">${pageInner(p, doc, measure, folioCount)}</g>`;
    });
    if (doc.print.cutMarks) {
      const tick = 14;
      const line = (a, b, c, d) => `<line x1="${num(a)}" y1="${num(b)}" x2="${num(c)}" y2="${num(d)}" stroke="#000" stroke-width="0.35"/>`;
      for (let k = 1; k < n; k++) { const y = k * strip; out += line(0, y, tick, y) + line(W - tick, y, W, y); }
      const w = W - (doc.margins.left + doc.margins.right) * PT;
      for (const px of [x, x + w]) out += line(px, 0, px, tick * 0.6) + line(px, H - tick * 0.6, px, H);
      // The sheet number sits in the margin that is cut away, so a misfed back shows before it is cut.
      if (sheet.sheet && x > 12) {
        const label = sheet.side === 'seq' ? `Proof ${sheet.sheet}` : `Sheet ${sheet.sheet} ${sheet.side}`;
        out += `<text transform="translate(${num(x - 4)} ${num(H / 2)}) rotate(-90)" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="6" fill="#777">${label}</text>`;
      }
    }
    // For printers that put the second side on upside down: turn the whole back round.
    if (sheet.side === 'back' && doc.print.turnBacks) out = `<g transform="rotate(180 ${num(W / 2)} ${num(H / 2)})">${out}</g>`;
    const size = screen ? '' : ` width="${doc.paper.w}in" height="${doc.paper.h}in"`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${num(W)} ${num(H)}"${size}>${out}</svg>`;
  }

  function fits(doc) {
    return doc.pecha.perSheet * doc.pecha.height <= doc.paper.h + 1e-6;
  }

  function run(doc, measure) {
    const atoms = atomize(parseStream(doc.text, doc.flow), doc, measure);
    const pages = paginate(doc, atoms, measure);
    if (pages.length) pages[pages.length - 1].isLast = true;
    const folioCount = Math.ceil(pages.length / 2);
    return { pages, folioCount };
  }

  return { PT, defaultDoc, parseStream, splitAtoms, atomize, paginate, boxes, typeOfPage, pageSvg, sheetSvg, impose, fits, run, noteSet, noteSlot, pageType };
})();
if (typeof module !== 'undefined') module.exports = Engine;
