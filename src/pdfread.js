// Reads the text out of a PDF and rebuilds it as flowing pecha text. Text in old Tibetan fonts
// (TibetanMachine, Ededris and others) comes back as Latin letters, so it goes through the tables.
// Many Tibetan PDFs hold a damaged hidden text layer, and scans hold none, so when the text fails a
// spelling check each page is also read as an image with Tibetan OCR. A few bad stacks are filled in
// from the OCR, syllable by syllable, because the PDF's own text beats OCR everywhere else. A text
// layer that is wrong throughout, or a scan, uses the OCR alone.
const PdfRead = (() => {
  const WIN1252 = {
    0x20ac: 128, 0x201a: 130, 0x192: 131, 0x201e: 132, 0x2026: 133, 0x2020: 134, 0x2021: 135, 0x2c6: 136, 0x2030: 137,
    0x160: 138, 0x2039: 139, 0x152: 140, 0x17d: 142, 0x2018: 145, 0x2019: 146, 0x201c: 147, 0x201d: 148, 0x2022: 149,
    0x2013: 150, 0x2014: 151, 0x2dc: 152, 0x2122: 153, 0x161: 154, 0x203a: 155, 0x153: 156, 0x17e: 158, 0x178: 159,
  };
  const FONT_ALIASES = [[/^Dedris/, 'Ededris'], [/^Sama$/, 'Esama'], [/^Samb$/, 'Esamb'], [/^Samc$/, 'Esamc']];
  const TIB = /[ༀ-࿿]/;
  const TIB_G = /[ༀ-࿿]/g;

  // Stacks that exist in Tibetan spelling. A pair outside this list marks damaged text, because a
  // damaged PDF repeats one wrong mapping everywhere (ཆྗེན for ཆེན). Mantras add a few, hence the threshold.
  const STACKS = {
    'ར': 'ཀགངཇཉཏདནབམཙཛ', 'ལ': 'ཀགངཅཇཏདཔབཧ', 'ས': 'ཀགངཉཏདནཔབམཙ',
    'ཀ': 'ཡརལ', 'ཁ': 'ཡར', 'ག': 'ཡརལ', 'ཏ': 'ར', 'ཐ': 'ར', 'ད': 'ར', 'ན': 'ར', 'པ': 'ཡརལ', 'ཕ': 'ཡར', 'བ': 'ཡརལ',
    'མ': 'ཡར', 'ཟ': 'ལ', 'ཤ': 'ར', 'ཧ': 'ར', 'ཨ': '',
  };
  const DAMAGE_LIMIT = 0.025;     // mantras put a little of this in clean text
  const WRONG_THROUGHOUT = 0.1;
  const OCR_SCALES = [3, 1.5];     // large type reads better small, so pages with gaps left get a second look
  const UNREAD = '\u25A1';         // shown in the text wherever a stack could not be recovered
  const SEPARATORS = /([\u0F0B\u0F0C\u0F0D\u0F14\s]+)/;
  const baseOf = c => {
    const cp = c.codePointAt(0);
    return cp >= 0x0F90 && cp <= 0x0FB8 ? String.fromCodePoint(cp - 0x50) : c;
  };

  const syllablesOf = text => text.split(SEPARATORS).filter((s, i) => i % 2 === 0 && s);
  const hasHole = s => /[\u0000\uFFFD]/.test(s);

  function isDamaged(s) {
    if (hasHole(s)) return true;
    const letters = [...s].filter(c => /[\u0F40-\u0F6C\u0F90-\u0FBC]/.test(c));
    for (let i = 1; i < letters.length; i++) {
      const sub = letters[i].codePointAt(0);
      if (sub < 0x0F90 || sub === 0x0FAD) continue;     // a new letter, or wa-zur, which goes under most letters
      const allowed = STACKS[baseOf(letters[i - 1])];
      if (allowed === undefined || !allowed.includes(baseOf(letters[i]))) return true;
    }
    return false;
  }

  // A hole in the text layer is a glyph the PDF has no code for: a stacked letter or a vowel sign. So a
  // reading must fill the hole with one of those and agree with the letters around it. A plain letter
  // never leaves a hole, which rejects most OCR slips, such as རེ for རྗེ.
  function fits(damaged, reading) {
    if (isDamaged(reading)) return false;
    if (!hasHole(damaged)) return true;
    const pattern = [...damaged].map(c => (hasHole(c) ? '(?:[\\u0F40-\\u0F6C]?[\\u0F90-\\u0FBC]+|[\\u0F71-\\u0F84]+)' : c)).join('');
    return new RegExp(`^${pattern}$`).test(reading);
  }

  function damageRate(text) {
    const syllables = syllablesOf(text).filter(s => TIB.test(s));
    return syllables.length ? syllables.filter(isDamaged).length / syllables.length : 0;
  }

  // Longest common subsequence of two syllable lists, as ascending index pairs.
  function anchors(a, b) {
    const n = a.length, m = b.length;
    if (!n || !m || n * m > 3e7) return null;
    const t = new Uint16Array((n + 1) * (m + 1));
    const at = (i, j) => i * (m + 1) + j;
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        t[at(i, j)] = a[i] === b[j] ? t[at(i + 1, j + 1)] + 1 : Math.max(t[at(i + 1, j)], t[at(i, j + 1)]);
      }
    }
    const pairs = [];
    for (let i = 0, j = 0; i < n && j < m;) {
      if (a[i] === b[j]) { pairs.push([i, j]); i++; j++; }
      else if (t[at(i + 1, j)] >= t[at(i, j + 1)]) i++;
      else j++;
    }
    return pairs;
  }

  // Between two syllables the PDF and the OCR agree on, the same count of syllables means they line
  // up one to one, so a damaged syllable can take the OCR's reading. Anything else stays as it is.
  function repairPage(lines, ocrSyllables, holesOnly) {
    const wanted = holesOnly ? hasHole : isDamaged;
    const toks = [];
    for (const l of lines) {
      if (!l.tibetan) continue;
      l.parts = l.marked.split(SEPARATORS);
      l.parts.forEach((s, part) => { if (part % 2 === 0 && s) toks.push({ l, part, s }); });
    }
    const a = toks.map(t => t.s);
    const pairs = anchors(a, ocrSyllables);
    let filled = 0, left = a.filter(wanted).length;
    if (pairs) {
      const walk = [[-1, -1], ...pairs, [a.length, ocrSyllables.length]];
      for (let k = 1; k < walk.length; k++) {
        const [i0, j0] = walk[k - 1], [i1, j1] = walk[k];
        if (i1 - i0 !== j1 - j0) continue;
        for (let x = 1; x < i1 - i0; x++) {
          const reading = ocrSyllables[j0 + x];
          if (!wanted(a[i0 + x]) || !fits(a[i0 + x], reading)) continue;
          const t = toks[i0 + x];
          t.l.parts[t.part] = reading;
          filled++; left--;
        }
      }
    }
    for (const l of lines) {
      if (!l.parts) continue;
      l.marked = l.parts.join('');
      l.text = tidy(l.marked);
      delete l.parts;
    }
    return { filled, left };
  }

  // A text repeats its own words. A gap that OCR could not fill takes a word from this same document
  // when one word clearly fits it (at least twice, and four in five of all fitting words).
  function fillFromDocument(pages) {
    const seen = new Map();
    const tibetan = pages.flat().filter(l => l.tibetan);
    for (const l of tibetan) for (const s of syllablesOf(l.marked)) if (!hasHole(s) && !isDamaged(s)) seen.set(s, (seen.get(s) || 0) + 1);
    let filled = 0, left = 0;
    for (const l of tibetan) {
      if (!hasHole(l.marked)) continue;
      const parts = l.marked.split(SEPARATORS);
      parts.forEach((s, i) => {
        if (i % 2 || !hasHole(s)) return;
        const fitting = [...seen].filter(([w]) => fits(s, w)).sort((x, y) => y[1] - x[1]);
        const total = fitting.reduce((sum, [, c]) => sum + c, 0);
        if (fitting.length && fitting[0][1] >= 2 && fitting[0][1] / total >= 0.8) { parts[i] = fitting[0][0]; filled++; } else left++;
      });
      l.marked = parts.join('');
      l.text = tidy(l.marked);
    }
    return { filled, left };
  }

  // PDF kerning shows up as false spaces inside words; verses set in columns add one after a shad pair.
  function tidy(text, keepHoles) {
    return (keepHoles ? text : text.replace(/[\u0000\uFFFD]/g, UNREAD))
      .replace(/([\u0000\uFFFD\u0F40-\u0FBC]) +(?=[\u0000\uFFFD\u0F0B\u0F40-\u0FBC])/g, '$1')
      .replace(/\u0F0B +/g, '\u0F0B')
      .replace(/(\u0F0D \u0F0D) +(?=[\u0F40-\u0F6C])/g, '$1')
      .replace(/\s+/g, ' ').trim();
  }

  let lib = null;
  async function loadLibrary() {
    if (lib) return lib;
    lib = await import(new URL('vendor/pdf.min.js', document.baseURI).href);
    lib.GlobalWorkerOptions.workerSrc = new URL('vendor/pdf.worker.min.js', document.baseURI).href;
    return lib;
  }

  function tableFor(fontName, table) {
    const bare = (fontName || '').replace(/^[A-Z]{6}\+/, '').replace(/,.*$/, '');
    if (table[bare]) return { name: bare, map: table[bare] };
    for (const [re, to] of FONT_ALIASES) {
      const alt = bare.replace(re, to);
      if (alt !== bare && table[alt]) return { name: alt, map: table[alt] };
    }
    return null;
  }

  function convert(str, map) {
    if (TIB.test(str)) return str;           // this font already carries real Unicode
    let out = '';
    for (const ch of str) {
      const cp = ch.codePointAt(0);
      const code = WIN1252[cp] !== undefined ? WIN1252[cp] : cp;
      if (cp === 32) out += ' ';
      else if (code < 256 && map[code] !== undefined) out += map[code];
    }
    return out;
  }

  function realFontName(page, loadedName) {
    try { return page.commonObjs.get(loadedName).name || ''; } catch (e) { return ''; }
  }

  async function readPage(page, table, seen) {
    await page.getOperatorList();          // this is what makes the real font names available
    const content = await page.getTextContent({ disableNormalization: true });
    const items = [];
    for (const it of content.items) {
      if (!it.str || !it.str.trim() && !it.width) continue;
      const [a, b, c, d, x, y] = it.transform;
      if (Math.abs(b) > Math.abs(a) * 0.1) continue;      // rotated margin text
      const name = realFontName(page, it.fontName);
      const t = tableFor(name, table);
      if (t) seen.legacy.add(t.name);
      const text = t ? convert(it.str, t.map) : it.str;
      if (!t && /[^\x00-\x7f]/.test(it.str) === false && /[A-Za-z]/.test(it.str)) seen.latin.add(name.replace(/^[A-Z]{6}\+/, ''));
      items.push({ text, x, y, w: it.width, size: Math.hypot(c, d) || Math.abs(a) });
    }
    return groupLines(items);
  }

  function groupLines(items) {
    items.sort((p, q) => q.y - p.y || p.x - q.x);
    const lines = [];
    for (const it of items) {
      const last = lines[lines.length - 1];
      if (last && Math.abs(last.y - it.y) < Math.max(last.size, it.size) * 0.45) {
        last.items.push(it);
        last.size = Math.max(last.size, it.size);
      } else {
        lines.push({ y: it.y, size: it.size, items: [it] });
      }
    }
    return lines.map(l => {
      l.items.sort((p, q) => p.x - q.x);
      let s = '', end = null;
      for (const it of l.items) {
        if (end !== null && it.x - end > it.size * 0.3 && !/\s$/.test(s) && !/^\s/.test(it.text)) s += ' ';
        s += it.text;
        end = it.x + it.w;
      }
      return lineRecord(s, l.size);
    }).filter(l => l.text);
  }

  function lineRecord(raw, size) {
    const text = TIB.test(raw) ? tidy(raw) : raw.replace(/\s+/g, ' ').trim();
    const letters = text.replace(/\s/g, '').length;
    const tib = (text.match(TIB_G) || []).length;
    return { text, marked: tidy(raw, true), size, tibetan: letters > 0 && tib / letters >= 0.4 };
  }

  // Running heads and page numbers repeat at the top or bottom of the page and are not part of the text.
  function dropFurniture(pages) {
    const key = t => t.replace(/[\d༠-༩]+/g, '#').trim();
    const edge = new Map();
    for (const p of pages) {
      const ends = new Set([p[0], p[1], p[p.length - 2], p[p.length - 1]].filter(Boolean).map(l => key(l.text)));
      for (const k of ends) edge.set(k, (edge.get(k) || 0) + 1);
    }
    const limit = Math.max(3, pages.length * 0.4);
    return pages.map(p => p.filter((l, i) => {
      if (/^\[.*\]$/.test(l.text)) return false;      // a viewer's link or editorial mark, such as [Full Size]
      const atEdge = i < 2 || i >= p.length - 2;
      if (!atEdge) return true;
      if (/^[\s\d༠-༩.,\-–—]+$/.test(l.text)) return false;
      return edge.get(key(l.text)) < limit;
    }));
  }

  const median = xs => {
    if (!xs.length) return 0;
    const s = [...xs].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  };

  function joinLines(lines, keepOther) {
    let out = '';
    lines.forEach((l, i) => {
      out += l.text;
      const next = lines[i + 1];
      if (!next) return;
      if (keepOther && l.tibetan !== next.tibetan) { out += '\n\n'; return; }
      out += '\n';
    });
    return out;
  }

  // Everything flows, as the pecha lines itself. A larger opening line on the first page is the title.
  function compose(pages, keepOther) {
    const clean = dropFurniture(pages).map(p => (keepOther ? p : p.filter(l => l.tibetan)));
    const all = clean.flat();
    if (!all.length) return { text: '', title: '' };
    const bodySize = median(all.map(l => l.size));
    const first = (clean.find(p => p.length) || []);
    const titleLines = [];
    for (const l of first) {
      if (titleLines.length < 3 && l.size >= bodySize * 1.2 && l.tibetan) titleLines.push(l); else break;
    }
    const body = all.slice(titleLines.length);
    const title = titleLines.map(l => l.text).join(' ');
    const head = title ? `{c}{28}${title}\n\n{page}{j}{size}` : '';
    return { text: head + joinLines(body, keepOther), title };
  }

  function loadScript(url) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = url; s.onload = resolve; s.onerror = reject;
      document.head.append(s);
    });
  }

  async function ocrWorker(logger) {
    const base = new URL('vendor/ocr/', document.baseURI).href;
    if (!window.Tesseract) await loadScript(base + 'tesseract.min.js');
    return window.Tesseract.createWorker('bod', 1, {
      workerPath: base + 'worker.min.js', corePath: base, langPath: base, gzip: true, workerBlobURL: false, logger,
    });
  }

  // Non-Tibetan lines come out of a Tibetan OCR model as noise, so only Tibetan lines are kept.
  function ocrLines(text) {
    return text.split('\n').map(line => {
      const letters = line.replace(/\s/g, '').length;
      const tib = (line.match(TIB_G) || []).length;
      if (!letters || tib / letters < 0.6) return null;
      return lineRecord(line.replace(/[^\u0F00-\u0FFF\s]/g, ''), 1);
    }).filter(Boolean);
  }

  // Returns the Tibetan lines of each requested page, indexed by page number.
  // Progress goes out as (page, pages, stage, part done of this run), with the OCR's own progress within a page.
  async function ocrPdf(data, numPages, onProgress, wanted, scale = OCR_SCALES[0]) {
    const pdfjs = await loadLibrary();
    const list = wanted || Array.from({ length: numPages }, (_, i) => i + 1);
    const stage = scale === OCR_SCALES[0] ? 'ocr' : 'ocr2';
    let at = 0;
    const tell = part => { if (onProgress) onProgress(list[at], numPages, stage, (at + part) / list.length); };
    // The first run loads the OCR; a second, closer look reuses the cached files.
    if (onProgress) onProgress(list[0], numPages, stage === 'ocr' ? 'load' : stage, 0);
    const worker = await ocrWorker(m => { if (m.status === 'recognizing text' && typeof m.progress === 'number' && at < list.length) tell(m.progress); });
    const task = pdfjs.getDocument({ data, isEvalSupported: false, verbosity: 0 });
    const pdf = await task.promise;
    const pages = {};
    const canvas = document.createElement('canvas');
    for (at = 0; at < list.length; at++) {
      const n = list[at];
      tell(0);
      const page = await pdf.getPage(n);
      const viewport = page.getViewport({ scale });
      canvas.width = viewport.width; canvas.height = viewport.height;
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
      const { data: out } = await worker.recognize(canvas);
      pages[n] = ocrLines(out.text);
      page.cleanup();
    }
    await worker.terminate();
    await task.destroy();
    return pages;
  }

  async function read(bytes, table, onProgress) {
    const pdfjs = await loadLibrary();
    const task = pdfjs.getDocument({ data: bytes.slice(), isEvalSupported: false, disableFontFace: true, useSystemFonts: false, verbosity: 0 });
    const pdf = await task.promise;
    const seen = { legacy: new Set(), latin: new Set() };
    const pages = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      if (onProgress) onProgress(n, pdf.numPages, 'text', n / pdf.numPages);
      const page = await pdf.getPage(n);
      pages.push(await readPage(page, table, seen));
      page.cleanup();
    }
    await task.destroy();
    const numPages = pdf.numPages;
    await task.destroy();
    const lines = pages.flat();
    const text = lines.map(l => l.text).join(' ');
    const chars = text.replace(/\s/g, '').length;
    const tibetan = (text.match(TIB_G) || []).length;
    const scanned = chars < numPages * 12;
    const tibetanText = lines.filter(l => l.tibetan).map(l => l.marked).join(' ');
    const damage = damageRate(tibetanText);
    const result = {
      pages, pageCount: numPages, chars, tibetan, damage, ocr: false, scanned,
      legacyFonts: [...seen.legacy], otherFonts: [...seen.latin],
      hasOther: lines.some(l => !l.tibetan),
    };
    if (!scanned && tibetan && damage <= DAMAGE_LIMIT && !hasHole(tibetanText)) return result;
    if (!scanned && tibetan && damage <= WRONG_THROUGHOUT) {
      const holesOnly = hasHole(tibetanText);    // then the other flagged syllables are mantras, not damage
      let repaired = 0, left = {};
      for (const scale of OCR_SCALES) {
        const todo = scale === OCR_SCALES[0] ? null : Object.keys(left).filter(n => left[n]).map(Number);
        if (todo && !todo.length) break;
        const read = await ocrPdf(bytes.slice(), numPages, onProgress, todo, scale);
        for (const n of Object.keys(read)) {
          const c = repairPage(pages[n - 1], syllablesOf(read[n].map(l => l.text).join(' ')), holesOnly);
          repaired += c.filled; left[n] = c.left;
        }
      }
      const fromDocument = holesOnly ? fillFromDocument(pages) : { filled: 0, left: Object.values(left).reduce((s, c) => s + c, 0) };
      return { ...result, repaired: repaired + fromDocument.filled, unrepaired: fromDocument.left };
    }

    // No Tibetan in the text at all may be a font with no table, so try the first pages before reading them all.
    if (!scanned && !tibetan) {
      const trial = await ocrPdf(bytes.slice(), numPages, onProgress, [1, 2].filter(n => n <= numPages));
      if (!Object.values(trial).flat().length) return result;
    }
    const read = await ocrPdf(bytes.slice(), numPages, onProgress);
    const all = Object.keys(read).map(Number).sort((a, b) => a - b).map(n => read[n]);
    if (!all.flat().length) return result;
    return { ...result, pages: all, ocr: true, hasOther: false, tibetan: 1 };
  }

  return { read, compose, groupLines, dropFurniture, tableFor, convert, damageRate, tidy, repairPage, fillFromDocument, isDamaged, lineRecord, syllablesOf };
})();
if (typeof module !== 'undefined') module.exports = PdfRead;
