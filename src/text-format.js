// Attribute-only edits keep unrelated formatting and resume the original style after a selection.
const TextFormat = (() => {
  const names = {bold: 'b', italic: 'i', underline: 'u', strike: 's'};
  const role = t => ['root', 'commentary', 'heading', '/role'].includes(t);
  function token(key, value) {
    if (names[key]) return value === null ? 'bold' : (value ? '' : '/') + names[key];
    if (key === 'size') return value === null ? 'size' : String(value);
    if (key === 'color') return value || 'color';
    if (key === 'font') return value ? `font:${value}` : 'font';
    throw new Error('Unknown text attribute');
  }
  function belongs(t, key) {
    if (names[key]) return [names[key], '/' + names[key], ...(key === 'bold' ? ['bold'] : [])].includes(t);
    if (key === 'size') return t === 'size' || /^\d+(\.\d+)?$/.test(t);
    if (key === 'color') return t === 'color' || /^#[0-9a-f]{3,6}$/i.test(t);
    return key === 'font' && (t === 'font' || t.startsWith('font:'));
  }
  function apply(text, start, end, attrs, Engine) {
    const entries = Object.entries(attrs);
    if (!entries.length) return {text, start, end};
    // A formatting token is indivisible, even if the user selects part of its visible spelling.
    for (const m of text.matchAll(/\{[^{}\n]*\}/g)) {
      const right = m.index + m[0].length;
      if (start > m.index && start < right) start = m.index;
      if (end > m.index && end < right) end = right;
    }
    const codes = entries.map(([k, v]) => token(k, v)).join(' ');
    if (start === end) {
      const mark = `{${codes}}`;
      return {text: text.slice(0, start) + mark + text.slice(end), start: start + mark.length, end: start + mark.length};
    }
    // Sentinel text exposes the state after trailing formatting tokens as well as plain text.
    const old = Engine.parseStream(text.slice(0, end) + '\uFFFC', false).filter(x => x.k === 'text').at(-1).style;
    const selected = text.slice(start, end).replace(/\{([^{}\n]*)\}/g, (_, body) => {
      const tokens = [];
      for (const t of body.trim().split(/\s+/)) {
        if (entries.some(([k]) => belongs(t, k))) continue;
        tokens.push(t);
        // Role changes reset these two attributes; reapply only the requested overrides.
        if (role(t)) for (const [k, v] of entries) if (k === 'size' || k === 'bold') tokens.push(token(k, v));
      }
      return tokens.length ? `{${tokens.join(' ')}}` : '';
    });
    const opening = `{${codes}}`, restore = `{${entries.map(([k]) => token(k, old[k])).join(' ')}}`;
    return {text: text.slice(0, start) + opening + selected + restore + text.slice(end), start: start + opening.length, end: start + opening.length + selected.length};
  }
  function insertCharacter(text, start, end, character, font, Engine) {
    const collapsed=start===end;
    for(const m of text.matchAll(/\{[^{}\n]*\}/g)) {
      const right=m.index+m[0].length;
      if(collapsed && start>m.index && start<right){start=end=right;break;}
      if(start>m.index && start<right)start=m.index;
      if(end>m.index && end<right)end=right;
    }
    const replaced=text.slice(0,start)+character+text.slice(end);
    if(!font)return {text:replaced,cursor:start+character.length};
    const result=apply(replaced,start,start+character.length,{font},Engine);
    return {text:result.text,cursor:result.end};
  }
  return {apply,insertCharacter};
})();
if (typeof module !== 'undefined') module.exports = TextFormat;
