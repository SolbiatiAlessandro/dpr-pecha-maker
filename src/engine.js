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
    lines: 5, lineHeight: 0.40, top: null, baseline: null, side: 0.08, style: 'double', color: '#000000',
    sideIn: 0, sideOut: 0.42, insideOn: false, inside: 0.2, squeezeOn: false, squeeze: 0.1,
    fontSize: 23, ...over,
  });

  const noteSlot = (text = '', size = 13, inset = 0.1) => ({ on: !!text, text, size, inset, rich: false });
  const noteSet = (over = {}) => ({
    inL: noteSlot(), inB: noteSlot(), inR: noteSlot(), outL: noteSlot(), outR: noteSlot(), ...over,
  });

  function defaultDoc() {
    return {
      version: 1,
      text: '',
      sections: [],
      sectionLabels: { left: true, right: true },
      flow: true,
      font: "'Jomolhari','Noto Serif Tibetan',serif",
      fontName: 'Jomolhari',
      textSize: null,
      roles: {
        root: { font: 'Jomolhari', size: 23, bold: false },
        commentary: { font: 'Jomolhari', size: 23, bold: false },
        heading: { font: 'Jomolhari', size: 28, bold: false },
      },
      tabWidth: 0.5,
      tibetanRaise: 0,
      kerning: true,
      display: { baselines: false, hintColors: false, compact: false },
      paper: { name: 'A4', w: 11.69, h: 8.27 },
      margins: { left: 0.3, right: 0.3, top: 0, bottom: 0 },
      normal: { lineHeight: .38, baseline: .6 },
      pecha: { mode: true, height: 2.55, dlt: 0.03, perSheet: 3, placement: 'center' },
      counts: { title: 1, fancy: 2 },
      types: {
        title: pageType({ lines: 2, lineHeight: 0.5, fontSize: 25, sideIn: 0.42, sideOut: 0.72, insideOn: true, inside: 0.32, squeezeOn: true, squeeze: 0.14 }),
        fancy: pageType({ lines: 3, lineHeight: 0.5, fontSize: 26, sideIn: 0.42, sideOut: 1.0, insideOn: true, inside: 0.28 }),
        body: pageType(),
      },
      shad: { enabled: true, yang: true, ignoreYigo: false, titlePages: false },
      assets: [], images: [],
      yigo: { rich: false, ignoreColor: true, image: '', enabled: true, text: '༄༅༅། །', fancyStart: true, title2: false },
      dzog: { enabled: true, rise: 0.05, percentEnabled: false, percent: 20, leftUp: 0, rightUp: 0 },
      folio: { start: 1, onTitle: false, jyon: false, inset: 0.1, size: 13, rhino: '', rhinoEnabled: false, rhinoRich: false, angle: -90, font: '' },
      pageNum: { start: 1, onTitle: false, firstTitle: true, inset: 0.05, size: 9, on: true, angle: -90, position: 'bottom', font: 'Georgia' },
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
    const style = { align: 'j', size: null, color: null, bold: null, italic: false, underline: false, strike: false, role: null, font: null };
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
        else if (/^image:[\w-]+$/.test(tok)) items.push({k: 'image', id: tok.slice(6), style: {...style}});
        else if (tok === 'hs') pushText(HARD_SHAD);
        else if (tok === 'lc') pushText('{');
        else if (tok === 'rc') pushText('}');
        else if (tok === 'b') style.bold = true;
        else if (tok === '/b') style.bold = false;
        else if (tok === 'bold') style.bold = null;
        else if (tok === 'font') style.font = null;
        else if (tok.startsWith('font:') && fontFamily(tok.slice(5))) style.font = tok.slice(5);
        else if (tok === 'i') style.italic = true;
        else if (tok === '/i') style.italic = false;
        else if (tok === 'u') style.underline = true;
        else if (tok === '/u') style.underline = false;
        else if (tok === 's') style.strike = true;
        else if (tok === '/s') style.strike = false;
        else if (['root', 'commentary', 'heading'].includes(tok)) { style.role = tok; style.bold = null; style.size = null; }
        else if (tok === '/role') { style.role = null; style.bold = null; style.size = null; }
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
      if (it.k === 'image') {
        const placement = doc.images.find(p => p.id === it.id && p.kind === 'inline');
        if (placement && PechaImages.dimensions(doc, placement)) atoms.push({s: '', gap: 'none', spaces: 0, style: it.style, image: placement});
        continue;
      }
      // A style boundary must not swallow leading spaces in the next run.
      const leading = /^[ \u00a0]+/.exec(it.s), previous = atoms.at(-1);
      if (leading && previous && previous.s !== undefined) {
        previous.gap = 'space'; previous.spaces += leading[0].length;
      }
      for (const a of splitAtoms(it.s)) atoms.push({ ...a, style: it.style });
    }
    return atoms;
  }

  // ---------- geometry ----------

  function boxes(doc, type) {
    const w = (doc.paper.w - doc.margins.left - doc.margins.right) * PT;
    if (doc.pecha.mode === false) {
      const h = Math.max(.1,doc.paper.h-doc.margins.top-doc.margins.bottom)*PT;
      const rect={x0:0,y0:0,x1:w,y1:h};
      return {w,h,O:rect,I:rect,T:rect,d:0,lx1:0,lx2:0,rx1:w,rx2:w};
    }
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
    if (doc.pecha.mode === false) return 'body';
    const { title, fancy } = doc.counts;
    if (n <= title) return 'title';
    if (n <= title + fancy) return 'fancy';
    return 'body';
  }

  // ---------- lines and pages ----------

  function yigoWanted(doc, n, kind, isFirstFancy) {
    if (!doc.yigo.enabled) return false;
    if (doc.pecha.mode === false) return n + (doc.pageOffset || 0) > 1;
    if (kind === 'title') return doc.yigo.title2 && n > 1;
    if (kind === 'fancy' && !doc.yigo.fancyStart) return false;
    if (isFirstFancy) return true;
    return n % 2 === 1;
  }

  const fontFamilies = {jomolhari: "'Jomolhari','Noto Serif Tibetan',serif", noto: "'Noto Serif Tibetan','Jomolhari',serif", serif: "Georgia,'Times New Roman',serif"};
  function fontToken(name) {
    if (typeof name !== 'string' || !name.trim() || name.length > 128 || /[\u0000-\u001f\u007f-\u009f;]/.test(name)) return null;
    name = name.trim();
    const aliases = {'Jomolhari':'jomolhari','Noto Serif Tibetan':'noto','Georgia':'serif'};
    if (Object.hasOwn(aliases,name)) return aliases[name];
    try { return 'family:' + encodeURIComponent(name); } catch { return null; }
  }
  function fontFamily(token) {
    if (Object.hasOwn(fontFamilies, token)) return fontFamilies[token];
    if (!token?.startsWith('family:') || token.length > 1600) return null;
    try {
      const name = decodeURIComponent(token.slice(7));
      if (!fontToken(name)) return null;
      // A single quoted CSS family, never an arbitrary CSS declaration or fallback list.
      return JSON.stringify(name.trim()) + ",'Noto Serif Tibetan',serif";
    } catch { return null; }
  }
  function primaryFont(family) {
    if (family?.startsWith('"')) {
      const quoted = /^"(?:[^"\\]|\\.)*"/.exec(family);
      if (quoted) { try { return JSON.parse(quoted[0]); } catch {} }
    }
    return (family || '').split(',')[0].trim().replace(/^'|'$/g, '') || 'Jomolhari';
  }
  function fontFor(doc, atom, sizeDefault) {
    const st = atom.style || {};
    const role = doc.roles && doc.roles[st.role];
    const size = doc.textSize || st.size || (role && role.size) || sizeDefault;
    return { size, kerning: doc.kerning === false ? 'none' : 'normal', weight: (st.bold === null || st.bold === undefined ? role && role.bold : st.bold) ? 700 : 400,
      italic: !!st.italic, underline: !!st.underline, strike: !!st.strike,
      family: fontFamily(st.font) || (role ? `'${role.font}','Noto Serif Tibetan',serif` : doc.font) };
  }

  function fillLine(atoms, start, W, doc, sizeDefault, measure, yigo) {
    const items = [];
    let i = start, x = 0, prevGap = 0, hard = false, pageBreak = false, hasTab = false, yigoCount = 0;
    const place = a => {
      const f = fontFor(doc, a, sizeDefault);
      const imageSize = a.image && PechaImages.dimensions(doc, a.image);
      const w = imageSize ? imageSize.w + a.image.space * PT * 2 : measure(a.s, f);
      const gapW = a.gap === 'space' ? Math.max(measure(' ', f), f.size * 0.42) * Math.max(1, a.spaces) : 0;
      return { ...a, f, w, gapW };
    };
    const yigoImage = yigo && doc.images.find(p => p.id === doc.yigo.image && p.kind === 'yigo');
    if (yigoImage && PechaImages.dimensions(doc, yigoImage)) {
      const p = place({s: '', gap: 'none', spaces: 0, style: atoms[start].style, image: yigoImage});
      p.x = 0; items.push(p); x = p.w; yigoCount = 1;
    } else if (yigo) {
      const firstStyle = atoms[start].style;
      const firstSize = fontFor(doc, atoms[start], sizeDefault).size;
      const yiAtoms = doc.yigo.rich
        ? atomize(parseStream(doc.yigo.text, false).filter(it => it.k === 'text'), doc, measure).filter(a => !a.hr && !a.tab)
        : splitAtoms(doc.yigo.text);
      for (const a of yiAtoms) {
        const style = doc.yigo.rich ? {...a.style, role: null, size: firstSize,
          color: doc.yigo.ignoreColor || a.style.color === null ? firstStyle.color : a.style.color} : firstStyle;
        const p = place({ ...a, style });
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
    if (!o.ignoreYigo && line.items.slice(0,line.yigoCount).some(a => /[།]/.test(a.s))) return;
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
    // Tab stops were already positioned by fillLine. Rebuilding x from glyph widths erases them.
    if (line.hasTab) {
      line.width = line.natural;
      const off = line.align === 'c' ? (W - line.width) / 2 : line.align === 'r' ? W - line.width : 0;
      if (off > 0) line.items.forEach(p => { p.x += off; });
      line.endX = line.width + Math.max(0, off);
      return;
    }
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
      let type = doc.types[kind];
      if (doc.pecha.mode === false) {
        const h=Math.max(.1,doc.paper.h-doc.margins.top-doc.margins.bottom)*PT;
        const head=measure.head(doc,doc.textSize||type.fontSize);
        type={...type, style:'none', sideOut:0,sideIn:0,insideOn:false,squeezeOn:false,side:0,
          lineHeight:doc.normal.lineHeight,baseline:doc.normal.baseline,top:null,
          lines:Math.max(1,Math.floor((h-doc.normal.baseline*PT-head.descent)/(doc.normal.lineHeight*PT))+1)};
      }
      const B = boxes(doc, type);
      const W = B.T.x1 - B.T.x0;
      const isFirstFancy = kind === 'fancy' && firstFancy;
      if (kind === 'fancy') firstFancy = false;
      const fixedImages = doc.images.filter(p => p.kind === 'page' && p.page === n + (doc.pageOffset || 0))
        .map(p => PechaImages.pageRect(doc, p, B, type)).filter(Boolean);
      const startIndex = i;
      const fillPage = estimate => {
        const lines = []; let next = startIndex;
        const head = measure.head(doc, doc.textSize || type.fontSize);
        const startY = type.baseline !== null && type.baseline !== undefined ? B.T.y0 + type.baseline * PT - head.ascent : type.top === null ? B.T.y0 + (B.T.y1 - B.T.y0 - ((estimate - 1) * type.lineHeight * PT + head.height)) / 2 : B.T.y0 + type.top * PT;
        for (let ln = 0; ln < type.lines && next < atoms.length; ln++) {
          let left = B.T.x0, right = B.T.x1;
          const top = startY + ln * type.lineHeight * PT;
          for (const image of fixedImages) {
            if (!image.placement.anchor.startsWith('text') || top + head.height <= image.y || top >= image.y + image.h) continue;
            if (image.placement.anchor === 'text-left') left = Math.max(left, image.x + image.w + image.placement.margin * PT);
            else right = Math.min(right, image.x - image.placement.margin * PT);
          }
          const available = Math.max(0, right - left);
          if (available < 1) { lines.push({items: [], endX: 0, offset: 0}); continue; }
          const nextA = atoms[next];
          const startsTib = nextA && nextA.s && isTib(nextA.s[0]) && !isYigMgo(nextA.s[0]);
          const wantYigo = ln === 0 && startsTib && yigoWanted(doc, n, kind, isFirstFancy);
          const line = fillLine(atoms, next, available, doc, type.fontSize, measure, wantYigo);
          if (line.next === next) line.next = next + 1;
          next = line.next;
          convertShads(line, doc, kind, ln, measure);
          reflow(line, available, line.align === 'j' && !line.hard && next < atoms.length && !line.hasTab);
          line.offset = left - B.T.x0; line.endX += line.offset;
          lines.push(line);
          if (line.pageBreak) break;
        }
        return {lines, next};
      };
      let result = fillPage(type.lines);
      if (kind === 'title' && fixedImages.length && type.top === null && type.baseline === null) {
        let estimate = type.lines;
        for (let pass = 0; pass < 4 && result.lines.length !== estimate; pass++) {
          estimate = Math.max(1, result.lines.length); result = fillPage(estimate);
        }
      }
      const lines = result.lines; i = result.next;
      pages.push({ n, kind, lines, front: n % 2 === 1, boxes: B, type });
    } while (i < atoms.length && pages.length < limit);
    return pages;
  }

  // ---------- rendering ----------

  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(//g, SHAD);
  const num = v => Math.round(v * 100) / 100;

  function textEl(x, y, s, f, color, extra = '') {
    const st = (f.weight > 400 ? ' font-weight="700"' : '') + (f.italic ? ' font-style="italic"' : '');
    const decorations = [f.underline && 'underline', f.strike && 'line-through'].filter(Boolean).join(' ');
    return `<text x="${num(x)}" y="${num(y)}" font-size="${num(f.size)}"${f.family ? ` font-family="${esc(f.family)}"` : ''}${color ? ` fill="${esc(color)}"` : ''}${st}${decorations ? ` text-decoration="${decorations}"` : ''}${extra}>${esc(s)}</text>`;
  }

  function sideText(x, y, s, size, doc, anchor, angle = -90) {
    return `<text transform="translate(${num(x)} ${num(y)}) rotate(${num(angle)})" font-size="${num(size)}" text-anchor="${anchor}" font-family="${esc(doc.font)}">${esc(s)}</text>`;
  }

  function drawBoxes(p, doc, screen = false) {
    const { O, I, d, lx1, lx2, rx1, rx2 } = p.boxes;
    const t = p.type;
    if (t.style === 'none') return '';
    const color = screen && doc.display?.hintColors ? {title:"#b03020",fancy:"#16723b",body:"#245bb4"}[p.kind] : t.color;
    const stroke = `fill="none" stroke="${esc(color)}" stroke-width="0.7"`;
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
    const head = measure.head(doc, doc.textSize || t.fontSize);
    const room = T.y1 - T.y0;
    const nLines = p.kind === 'title' ? Math.max(1, p.lines.length) : t.lines;   // a short last page starts where full pages do
    const block = (nLines - 1) * t.lineHeight * PT + head.height;
    const start = t.baseline !== null && t.baseline !== undefined ? T.y0 + t.baseline * PT - head.ascent : t.top === null ? T.y0 + (room - block) / 2 : T.y0 + t.top * PT;
    let out = '';
    p.lineTops = []; p.lineBaselines = [];
    p.lines.forEach((line, ln) => {
      const top = start + ln * t.lineHeight * PT;
      p.lineTops.push(top);
      const baseline = top + head.ascent;
      p.lineBaselines.push(baseline);
      for (const a of line.items) {
        if (a.image) {
          const im = PechaImages.dimensions(doc, a.image);
          const y = baseline - a.image.above * PT - (a.image.addTibetan ? doc.tibetanRaise * PT : 0);
          out += `<image data-image-id="${esc(a.image.id)}" x="${num(T.x0 + (line.offset || 0) + a.x + a.image.space * PT)}" y="${num(y)}" width="${num(im.w)}" height="${num(im.h)}" preserveAspectRatio="none" href="${im.asset.data}"/>`;
          continue;
        }
        out += textEl(T.x0 + (line.offset || 0) + a.x, baseline - (isTib(a.s[0]) ? (doc.tibetanRaise || 0) * PT : 0), a.s, a.f, a.style && a.style.color);
      }
    });
    return out;
  }

  function drawDzog(p, doc, measure) {
    const { T } = p.boxes;
    const last = p.lines.length - 1;
    if (last < 0 || (last === 0 && !p.lines[last].items.length)) return '';
    const yOf = k => {
      const bottoms = p.lines[k].items.filter(a => !a.image && a.s).map(a => {
        const tibetan = isTib(a.s[0]);
        return measure.head({...doc, font: a.f.family}, a.f.size, tibetan).descent
          - (tibetan ? (doc.tibetanRaise || 0) * PT : 0);
      });
      return p.lineBaselines[k] + (bottoms.length ? Math.max(...bottoms) : measure.head(doc, p.type.fontSize).descent);
    };
    const y1 = yOf(last) - (doc.dzog.leftUp || 0) * PT;
    const final = p.lines[last].items.at(-1);
    const trailing = final && final.gap === 'space' ? final.gapW : 0;
    const end = T.x0 + p.lines[last].endX + trailing;
    const x = end + (doc.dzog.percentEnabled ? Math.max(0, T.x1 - end) * doc.dzog.percent / 100 : doc.dzog.rise * PT);
    const stroke = `fill="none" stroke="#000" stroke-width="0.9"`;
    if (last === 0 || x > T.x0 + 0.98 * (T.x1 - T.x0)) {
      return `<path d="M${num(T.x0)} ${num(y1)}H${num(T.x1)}" ${stroke}/>`;
    }
    const y0 = yOf(last - 1) - (doc.dzog.rightUp || 0) * PT;
    return `<path d="M${num(T.x0)} ${num(y1)}H${num(x)}V${num(y0)}H${num(T.x1)}" ${stroke}/>`;
  }

  function annotationRuns(slot, doc, measure) {
    const source = slot.rich ? parseStream(slot.text, false).filter(it => it.k === 'text') : [{s: slot.text, style: {}}];
    return source.map(it => {
      const s = it.s.replace(/[\u2028\r\n\t]/g, ' '), f = fontFor({...doc, textSize: slot.size}, it, slot.size);
      return {s, f, color: it.style.color, width: measure(s, f), head: measure.head({...doc, font: f.family}, f.size)};
    });
  }
  function richSideText(x, y, slot, doc, measure, anchor, angle = -90) {
    if (!slot.rich) return sideText(x, y, slot.text, slot.size, doc, anchor, angle);
    const runs = annotationRuns(slot, doc, measure), width = runs.reduce((sum, r) => sum + r.width, 0);
    let cursor = anchor === 'middle' ? -width / 2 : anchor === 'end' ? -width : 0;
    const text = runs.map(r => { const part = textEl(cursor, 0, r.s, r.f, r.color, ' style="white-space:pre"'); cursor += r.width; return part; }).join('');
    return `<g transform="translate(${num(x)} ${num(y)}) rotate(${num(angle)})">${text}</g>`;
  }

  function drawMargins(p, doc, measure, folioCount) {
    if (doc.pecha.mode === false) return '';
    const { O, w, h } = p.boxes;
    const sourceSet = doc.notes.sets[`${p.kind}.${p.front ? 'front' : 'back'}`];
    const set = { ...sourceSet };
    if (p.sectionName && doc.sectionLabels) {
      if (doc.sectionLabels.left) set.inL = { ...set.inL, on: true, rich: false, text: p.sectionName };
      if (doc.sectionLabels.right) set.inR = { ...set.inR, on: true, rich: false, text: p.sectionName };
    }
    let out = '';
    const asc = size => measure.head(doc, size);
    const pad = 9;
    const midY = (O.y0 + O.y1) / 2;
    const metrics = slot => {
      const heads = slot.rich ? annotationRuns(slot, doc, measure).map(r => r.head) : [asc(slot.size)];
      return {ascent: Math.max(0, ...heads.map(h => h.ascent)), descent: Math.max(0, ...heads.map(h => h.descent))};
    };
    const inX = (slot, right) => {
      const m = metrics(slot);
      return right ? O.x1 - slot.inset * PT - m.descent : O.x0 + slot.inset * PT + m.ascent;
    };
    if (set.inL.on && set.inL.text) out += richSideText(inX(set.inL), O.y0 + pad, set.inL, doc, measure, 'end');
    if (set.inB.on && set.inB.text) out += richSideText(inX(set.inB), O.y1 - pad, set.inB, doc, measure, 'start');
    if (set.inR.on && set.inR.text) out += richSideText(inX(set.inR, true), midY, set.inR, doc, measure, 'middle');
    if (set.outL.on && set.outL.text) out += richSideText(set.outL.inset * PT + metrics(set.outL).ascent, midY, set.outL, doc, measure, 'middle');
    if (set.outR.on && set.outR.text) out += richSideText(w - set.outR.inset * PT - metrics(set.outR).descent, midY, set.outR, doc, measure, 'middle');

    const fo = doc.folio;
    const folioStart = p.sectionFolioStart === undefined ? fo.start : p.sectionFolioStart;
    const showFolio = p.front && (fo.rhinoEnabled || (folioStart > 0 && (p.kind !== 'title' || fo.onTitle)));
    if (showFolio) {
      const number = p.folioNumber === undefined ? fo.start + (p.n - 1) / 2 : p.folioNumber;
      const isLast = p.sectionLastFolio === undefined ? (p.n + 1) / 2 >= folioCount : p.sectionLastFolio;
      const label = fo.rhinoEnabled ? fo.rhino : Folio.words(number) + (fo.jyon && isLast ? Folio.JYON : '');
      const folioDoc = fo.font ? {...doc, font: `'${fo.font}','Noto Serif Tibetan',serif`} : doc;
      const slot = {text:label, size:fo.size, rich:fo.rhinoEnabled && fo.rhinoRich};
      const ascent = slot.rich ? Math.max(0,...annotationRuns(slot,folioDoc,measure).map(r=>r.head.ascent)) : measure.head(folioDoc,fo.size).ascent;
      const x = O.x0 + fo.inset * PT + ascent;
      out += richSideText(x, midY, slot, folioDoc, measure, 'middle', fo.angle === undefined ? -90 : fo.angle);
    }
    const pn = doc.pageNum;
    if (pn.on && pn.start > 0 && (p.kind !== 'title' || (pn.onTitle && ((p.localN || p.n) !== 1 || pn.firstTitle !== false)))) {
      const x = O.x1 - pn.inset * PT - 2;
      const center = pn.position === 'center', angle = pn.angle === undefined ? -90 : pn.angle;
      out += `<text transform="translate(${num(x)} ${num(center ? midY : O.y1 - pad)}) rotate(${num(angle)})" text-anchor="${center ? 'middle' : 'start'}" font-size="${num(pn.size)}" font-family="${esc(fontFamily(fontToken(pn.font)) || doc.font)}">${pn.start + p.n - 1}</text>`;
    }
    return out;
  }

  function drawPageImages(p, doc) {
    return doc.images.filter(im => im.kind === 'page' && im.page === p.n).map(im => {
      const r = PechaImages.pageRect(doc, im, p.boxes, p.type); if (!r) return '';
      return `<image data-image-id="${esc(im.id)}" x="${num(r.x)}" y="${num(r.y)}" width="${num(r.w)}" height="${num(r.h)}" preserveAspectRatio="none" href="${r.asset.data}"/>`;
    }).join('');
  }

  function pageInner(p, doc, measure, folioCount, screen = false) {
    if (p.blank) return '';
    const text = drawText(p, doc, measure);
    const isLastPage = p.isLast;
    const guides = screen && doc.display?.baselines ? p.lineBaselines.map(y => `<line data-baseline-guide="true" x1="${num(p.boxes.T.x0)}" x2="${num(p.boxes.T.x1)}" y1="${num(y)}" y2="${num(y)}" stroke="#888" stroke-width="0.5" stroke-dasharray="3 3"/>`).join('') : '';
    return `<g text-rendering="geometricPrecision" style="font-kerning:${doc.kerning === false ? 'none' : 'normal'}" font-family="${esc(doc.font)}" fill="#14100e">`
      + drawBoxes(p, doc, screen) + drawPageImages(p, doc) + guides + text
      + (isLastPage && doc.dzog.enabled ? drawDzog(p, doc, measure) : '')
      + drawMargins(p, doc, measure, folioCount)
      + `</g>`;
  }

  function pageSvg(p, doc, measure, folioCount) {
    const { w, h } = p.boxes;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${num(w)} ${num(h)}" role="img" aria-label="Pecha page ${p.n}">${pageInner(p, doc, measure, folioCount, true)}</svg>`;
  }

  // ---------- sheets ----------

  // Backs run in reverse row order, because a flip along the top edge puts the bottom row behind
  // the top row. With "stack" the first sheet holds folios 1, S+1, 2S+1 so cut piles stay in order.
  // A pecha leaf is read by turning it over its top edge, so the backs of a sheet run in reverse row order.
  // pass: 'duplex' (both sides, alternating), 'fronts' or 'backs' (one side per run through the printer), or 'sequence'.
  function impose(doc, pages, opts = {}) {
    const n = doc.pecha.mode === false ? 1 : doc.pecha.perSheet;
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
    if (doc.pecha.mode === false) doc={...doc, pecha:{...doc.pecha,perSheet:1,height:Math.max(.1,doc.paper.h-doc.margins.top-doc.margins.bottom),placement:'top'},print:{...doc.print,cutMarks:false}};
    const W = doc.paper.w * PT, H = doc.paper.h * PT, n = doc.pecha.perSheet;
    // Mirror vertical margins on backs so a top-edge turn aligns every front with its back.
    const back = sheet.side === 'back';
    const top = (doc.margins[back ? 'bottom' : 'top'] || 0) * PT, bottom = (doc.margins[back ? 'top' : 'bottom'] || 0) * PT;
    const strip = (H - top - bottom) / n, h = doc.pecha.height * PT, x = doc.margins.left * PT;
    let out = '';
    sheet.slots.forEach((p, r) => {
      if (!p) return;
      const y = doc.pecha.placement === 'top' ? (back ? H - bottom - (r + 1) * h : top + r * h) : top + r * strip + (strip - h) / 2;
      out += `<g transform="translate(${num(x)} ${num(y)})">${pageInner(p, doc, measure, folioCount, screen)}</g>`;
    });
    if (doc.print.cutMarks) {
      const tick = 14;
      const line = (a, b, c, d) => `<line x1="${num(a)}" y1="${num(b)}" x2="${num(c)}" y2="${num(d)}" stroke="#000" stroke-width="0.35"/>`;
      for (let k = 1; k < n; k++) { const y = top + k * (doc.pecha.placement === 'top' ? h : strip); out += line(0, y, tick, y) + line(W - tick, y, W, y); }
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
    if (doc.pecha.mode === false) return doc.paper.h > doc.margins.top+doc.margins.bottom && doc.paper.w > doc.margins.left+doc.margins.right;
    return doc.pecha.perSheet * doc.pecha.height <= doc.paper.h - (doc.margins.top || 0) - (doc.margins.bottom || 0) + 1e-6;
  }

  function run(doc, measure) {
    if (doc.sections && doc.sections.length) {
      const pages = [];
      doc.sections.forEach((section, index) => {
        // Each text begins on the front of a new leaf. A blank back is a real volume page.
        if (doc.pecha.mode !== false && pages.length % 2) {
          const type = doc.types.body;
          pages.push({ n: pages.length + 1, kind: 'body', front: false, blank: true, lines: [], type, boxes: boxes(doc, type) });
        }
        const sub = { ...doc, pageOffset: pages.length, text: section.text, counts: section.restartLayout ? doc.counts : { title: 0, fancy: 0 } };
        const atoms = atomize(parseStream(sub.text, sub.flow), sub, measure);
        const local = paginate(sub, atoms, measure), offset = pages.length;
        const count = Math.ceil(local.length / 2);
        for (const p of local) {
          p.localN = p.n; p.sectionIndex = index; p.sectionName = section.name;
          p.sectionFolioStart = section.folioStart; p.folioNumber = section.folioStart + Math.floor((p.n - 1) / 2);
          p.sectionLastFolio = Math.ceil(p.n / 2) === count;
          p.n += offset; p.isLast = p.localN === local.length;
          pages.push(p);
        }
      });
      return { pages, folioCount: Math.ceil(pages.length / 2) };
    }
    const atoms = atomize(parseStream(doc.text, doc.flow), doc, measure);
    const pages = paginate(doc, atoms, measure);
    if (pages.length) pages[pages.length - 1].isLast = true;
    const folioCount = Math.ceil(pages.length / 2);
    return { pages, folioCount };
  }

  return { PT, defaultDoc, fontToken, fontFamily, primaryFont, fontFor, parseStream, splitAtoms, atomize, paginate, boxes, typeOfPage, pageSvg, sheetSvg, impose, fits, run, noteSet, noteSlot, pageType };
})();
if (typeof module !== 'undefined') module.exports = Engine;
