// Unicode RTF body export. Page layout, automatic labels and margin annotations are separate.
const Rtf = (() => {
  function escape(text) {
    let out = '';
    for (let i = 0; i < text.length; i++) {
      const c = text[i], n = text.charCodeAt(i);
      if (c === '\\' || c === '{' || c === '}') out += '\\' + c;
      else if (c === '\n' || c === '\u2028') out += '\\line\n';
      else if (c === '\t') out += '\\tab ';
      else if (n > 126 || n < 32) out += `\\u${n > 32767 ? n - 65536 : n}?`;
      else out += c;
    }
    return out;
  }
  const hexColor = color => {
    if (!color) return '14100e';
    const s = color.slice(1); return s.length === 3 ? [...s].map(c => c + c).join('') : s;
  };
  function write(doc, Engine) {
    const colors = [], body = [], sources = doc.sections.length ? doc.sections.map(s => s.text) : [doc.text];
    sources.forEach((source, index) => {
      if (index) body.push('\\page\n');
      for (const run of Engine.parseStream(source, false)) {
        if (run.k === 'page') { body.push('\\page\n'); continue; }
        if (run.k === 'image') {
          const p = doc.images.find(p => p.id === run.id && p.kind === 'inline'), r = p && PechaImages.dimensions(doc, p);
          if (!r) continue;
          const binary = atob(r.asset.data.split(',')[1]), hex = Array.from(binary, c => c.charCodeAt(0).toString(16).padStart(2, '0')).join('');
          body.push(`{\\pict\\pngblip\\picw${r.asset.width}\\pich${r.asset.height}\\picwgoal${Math.round(r.w * 20)}\\pichgoal${Math.round(r.h * 20)}\n${hex}}`);
          continue;
        }
        const f = Engine.fontFor(doc, run, doc.types.body.fontSize), color = hexColor(run.style.color);
        if (!colors.includes(color)) colors.push(color);
        const font = /^'Noto/.test(f.family) ? 1 : /^(Georgia|'Georgia)/.test(f.family) ? 2 : 0;
        const align = {l:'ql',r:'qr',c:'qc',j:'qj'}[run.style.align] || 'qj';
        body.push(`\\${align}\\f${font}\\fs${Math.round(f.size * 2)}\\b${f.weight > 400 ? 1 : 0}\\i${f.italic ? 1 : 0}\\ul${f.underline ? 1 : 0}\\strike${f.strike ? 1 : 0}\\cf${colors.indexOf(color) + 1} ` + escape(run.s.replace(/\uE00D/g, '།')));
      }
    });
    const colorTable = colors.map(h => `\\red${parseInt(h.slice(0,2),16)}\\green${parseInt(h.slice(2,4),16)}\\blue${parseInt(h.slice(4,6),16)};`).join('');
    return '{\\rtf1\\ansi\\ansicpg1252\\deff0\\uc1\n{\\fonttbl{\\f0\\fnil Jomolhari;}{\\f1\\fnil Noto Serif Tibetan;}{\\f2\\froman Georgia;}}\n{\\colortbl;' + colorTable + '}\n' + body.join('') + '}';
  }
  return {write, escape};
})();
if (typeof module !== 'undefined') module.exports = Rtf;
