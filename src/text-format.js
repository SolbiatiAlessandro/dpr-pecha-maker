// Attribute-only edits keep unrelated formatting and resume the original style after a selection.
const TextFormat = (() => {
  const names = {bold: 'b', italic: 'i', underline: 'u', strike: 's'};
  const role = t => ['root', 'commentary', 'heading', '/role'].includes(t);
  function fontChoices(doc, Engine) {
    const choices = new Map();
    const add = token => {
      const family = Engine.fontFamily(token);
      if (family) choices.set(token, Engine.primaryFont(family));
    };
    for (const name of ['Jomolhari','Noto Serif Tibetan','Georgia','Times New Roman','Arial','Courier New',doc.fontName]) add(Engine.fontToken(name));
    for (const value of Object.values(doc.roles || {})) add(Engine.fontToken(value.font));
    for (const text of [doc.text, ...(doc.sections || []).map(s => s.text)]) {
      for (const run of Engine.parseStream(text || '',false)) if (run.style?.font) add(run.style.font);
    }
    return [...choices];
  }
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
  function styleMark(style) {
    return '{'+[style.role || '/role', ...['font','size','bold','italic','underline','strike','color'].map(k=>token(k,style[k])), style.align].join(' ')+'}';
  }
  function selectedRich(text, start, end, Engine) {
    if (start === end) return {text:'',start,end};
    for (const m of text.matchAll(/\{[^{}\n]*\}/g)) {
      const right = m.index+m[0].length;
      if (start > m.index && start < right) start = m.index;
      if (end > m.index && end < right) end = right;
    }
    // A selection inherits formatting from before its first character, even when no codes are selected.
    const style = Engine.parseStream(text.slice(0,start)+'\uFFFC',false).filter(r=>r.k==='text').at(-1).style;
    return {text:styleMark(style)+text.slice(start,end),start,end};
  }
  function removeRich(text, start, end, Engine) {
    const range = selectedRich(text,start,end,Engine);
    start = range.start; end = range.end;
    const stateAt = at => Engine.parseStream(text.slice(0,at)+'\uFFFC',false).filter(r=>r.k==='text').at(-1).style;
    const before = styleMark(stateAt(start)), after = styleMark(stateAt(end));
    // Keep following text's appearance when the removed range contains persistent format changes.
    const replacement = end < text.length && before !== after ? after : '';
    return {text:text.slice(0,start)+replacement+text.slice(end),start,end,replacement,cursor:start};
  }
  function insertRich(text, start, end, fragment, Engine) {
    const collapsed = start === end;
    for (const m of text.matchAll(/\{[^{}\n]*\}/g)) {
      const right = m.index + m[0].length;
      if (collapsed && start > m.index && start < right) { start = end = right; break; }
      if (start > m.index && start < right) start = m.index;
      if (end > m.index && end < right) end = right;
    }
    const old = Engine.parseStream(text.slice(0,end)+'\uFFFC',false).filter(r=>r.k==='text').at(-1).style;
    const restore = styleMark(old);
    // Keep imported paragraphs hard even when the surrounding document uses verse flow.
    const rich = '{/role font size bold /i /u /s color j}'+fragment.replace(/\r\n?|\n/g,'\u2028');
    const replacement = rich+restore;
    return {text:text.slice(0,start)+replacement+text.slice(end),start,end,replacement,cursor:start+rich.length};
  }
  function lockedSettings(value, Engine) {
    const v=value&&typeof value==='object'?value:{};
    const name=typeof v.font==='string'&&Engine.fontToken(v.font)?v.font.trim():'Jomolhari';
    return {font:name,size:Number.isFinite(v.size)?Math.max(4,Math.min(200,v.size)):23,
      color:/^#[0-9a-f]{6}$/i.test(v.color||'')?v.color.toLowerCase():'#14100e',
      ...Object.fromEntries(['bold','italic','underline','strike'].map(k=>[k,v[k]===true]))};
  }
  function insertLocked(text, start, end, inserted, settings, Engine) {
    const collapsed=start===end;
    for(const m of text.matchAll(/\{[^{}\n]*\}/g)){
      const right=m.index+m[0].length;
      if(collapsed&&start>m.index&&start<right){start=end=right;break;}
      if(start>m.index&&start<right)start=m.index;
      if(end>m.index&&end<right)end=right;
    }
    // Keep a newly typed combining mark in the same Unicode cluster as its base.
    if(start===end && /^[\p{M}\u200d\ufe0f]/u.test(inserted) && typeof Intl.Segmenter==='function'){
      for(const part of new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(text.slice(0,start))){
        if(part.index+part.segment.length===start&&!/[{}\r\n\u2028]/.test(part.segment)){
          inserted=part.segment+inserted;start=part.index;break;
        }
      }
    }
    const pref=lockedSettings(settings,Engine),attrs={...pref,font:Engine.fontToken(pref.font)};
    const stateAt=at=>Engine.parseStream(text.slice(0,at)+'\uFFFC',false).filter(r=>r.k==='text').at(-1).style;
    const before=stateAt(start),after=stateAt(end),same=Object.entries(attrs).every(([k,v])=>before[k]===v);
    const opening=same?'':'{'+Object.entries(attrs).map(([k,v])=>token(k,v)).join(' ')+'}';
    const literal=inserted.replace(/[{}]/g,c=>c==='{'?'{lc}':'{rc}');
    const restore=same&&start===end?'':styleMark(after),replacement=opening+literal+restore;
    return {text:text.slice(0,start)+replacement+text.slice(end),start,end,replacement,cursor:start+opening.length+literal.length};
  }
  function findCode(text, start, end, direction) {
    const marks = [...text.matchAll(/\{[^{}\n]*\}/g)];
    const mark = direction < 0 ? marks.reverse().find(m => m.index < start)
      : marks.find(m => m.index >= end);
    return mark ? {start: mark.index, end: mark.index + mark[0].length} : null;
  }
  function removeReturns(text, start, end) {
    const selected = text.slice(start, end).replace(/\r\n|\r|\n/g, '');
    return {text: text.slice(0, start) + selected + text.slice(end), start, end: start + selected.length};
  }
  // Return a native replacement selection; the browser still performs the edit and owns undo.
  // Visible codes and line boundaries must not be consumed as ordinary characters.
  function typeoverRange(text, start, end, inserted) {
    if (start !== end || !inserted || /[{}\r\n\u2028]/.test(inserted)
        || /^[\p{M}\u200d\ufe0f]/u.test(inserted) || typeof Intl.Segmenter !== 'function') return null;
    const segmenter = new Intl.Segmenter(undefined, {granularity: 'grapheme'});
    for (const m of text.matchAll(/\{[^{}\n]*\}/g)) {
      if (start >= m.index && start < m.index + m[0].length) return null;
    }
    let remaining = [...segmenter.segment(inserted)].length, right = start;
    // Segment the full text so a caret inside a Tibetan stack or surrogate pair is detected.
    for (const {segment, index} of segmenter.segment(text)) {
      if (index < start) {
        if (index + segment.length > start) return null;
        continue;
      }
      if (!remaining || /[{}\r\n\u2028]/.test(segment)) break;
      right = index + segment.length;
      remaining--;
    }
    return right > start ? {start, end: right} : null;
  }
  return {lockedSettings,insertLocked,fontChoices,apply,insertCharacter,selectedRich,removeRich,insertRich,findCode,removeReturns,typeoverRange};
})();
if (typeof module !== 'undefined') module.exports = TextFormat;
