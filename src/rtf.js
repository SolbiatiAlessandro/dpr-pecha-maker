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
    const colors = [], fonts = ['Jomolhari','Noto Serif Tibetan','Georgia'], body = [], sources = doc.sections.length ? doc.sections.map(s => s.text) : [doc.text];
    sources.forEach((source, index) => {
      if (index) body.push('\\page\n');
      for (const run of Engine.parseStream(source, false)) {
        if (run.k === 'page') { body.push('\\page\n'); continue; }
        if (run.k === 'image') {
          const p = doc.images.find(p => p.id === run.id && p.kind === 'inline'), r = p && PechaImages.dimensions(doc, p);
          if (!r) continue;
          const binary = atob(r.asset.data.split(',')[1]), hex = Array.from(binary, c => c.charCodeAt(0).toString(16).padStart(2, '0')).join('');
          const align = {l:'ql',r:'qr',c:'qc',j:'qj'}[run.style.align] || 'qj';
          body.push(`\\${align}{\\pict\\pngblip\\picw${r.asset.width}\\pich${r.asset.height}\\picwgoal${Math.round(r.w * 20)}\\pichgoal${Math.round(r.h * 20)}\n${hex}}`);
          continue;
        }
        const f = Engine.fontFor(doc, run, doc.types.body.fontSize), color = hexColor(run.style.color);
        if (!colors.includes(color)) colors.push(color);
        const name = Engine.primaryFont(f.family);
        if (!fonts.includes(name)) fonts.push(name);
        const font = fonts.indexOf(name);
        const align = {l:'ql',r:'qr',c:'qc',j:'qj'}[run.style.align] || 'qj';
        body.push(`\\${align}\\f${font}\\fs${Math.round(f.size * 2)}\\b${f.weight > 400 ? 1 : 0}\\i${f.italic ? 1 : 0}\\ul${f.underline ? 1 : 0}\\strike${f.strike ? 1 : 0}\\cf${colors.indexOf(color) + 1} ` + escape(run.s.replace(/\uE00D/g, '།')));
      }
    });
    const colorTable = colors.map(h => `\\red${parseInt(h.slice(0,2),16)}\\green${parseInt(h.slice(2,4),16)}\\blue${parseInt(h.slice(4,6),16)};`).join('');
    const fontTable = fonts.map((name,id) => `{\\f${id}\\fnil ${escape(name.replace(/;/g,''))};}`).join('');
    return '{\\rtf1\\ansi\\ansicpg1252\\deff0\\uc1\n{\\fonttbl' + fontTable + '}\n{\\colortbl;' + colorTable + '}\n' + body.join('') + '}';
  }
  function copySelection(doc, source, start, end, Engine, TextFormat) {
    const selected = TextFormat.selectedRich(source,start,end,Engine);
    const fragment = {...doc,text:selected.text,sections:[]};
    let plain = '';
    for (const run of Engine.parseStream(selected.text,false)) {
      if (run.k === 'text') plain += run.s.replace(/\uE00D/g,'།').replace(/\u2028/g,'\n');
      else if (run.k === 'page') plain += '\f';
      else if (run.k === 'image' && doc.images.some(p=>p.id===run.id && p.kind==='inline' && PechaImages.dimensions(doc,p))) plain += '\uFFFC';
    }
    if (!plain) return {...selected,empty:true};
    return {...selected,plain,rtf:write(fragment,Engine)};
  }
  function copyMark(doc, slot, start, end, Engine, TextFormat) {
    let source = slot.text;
    if (!slot.rich) {
      const literal = s => s.replace(/[{}]/g,c=>c==='{'?'{lc}':'{rc}');
      start = literal(source.slice(0,start)).length;
      end = literal(source.slice(0,end)).length;
      source = literal(source);
    }
    const selected = TextFormat.selectedRich(source,start,end,Engine);
    // Native mark-entry controls normalize to 18 pt, independently of printed position sizes.
    // These fields render text only, so layout/image codes are ignored.
    const text = selected.text.replace(/\{([^{}\n]*)\}/g,(_,body)=>{
      const kept = body.trim().split(/\s+/).filter(t=>t!=='page' && !t.startsWith('image:'));
      return kept.length ? '{'+kept.join(' ')+'}' : '';
    }).replace(/\r\n?|\n|\u2028|\t/g,' ');
    return copySelection({...doc,font:slot.font||doc.font,textSize:18,assets:[],images:[]},text,0,text.length,Engine,TextFormat);
  }
  function read(input, Engine, table = {}, current = null) {
    const source = typeof input === 'string' ? input : Array.from(input, b => String.fromCharCode(b)).join('');
    if (!/^\s*\{\\rtf1\b/.test(source) || source.length > 24000000) throw new Error('Not a supported RTF file (maximum 24 MB).');
    const fallbackLength = n => Math.max(0,Math.min(source.length,n ?? 1));
    const charsetPages = {0:1252,77:10000,128:932,129:949,134:936,136:950,161:1253,162:1254,163:1258,177:1255,178:1256,186:1257,204:1251,222:874,238:1250};
    // RTF-J raw lead bytes consume the following byte before RTF syntax is parsed.
    // Track only the encoding-related controls here; the semantic reader below
    // still handles text/styles, Unicode fallback and ignored destinations.
    const lexicalFonts = {}; let lexicalDefault = 0;
    const rawLead = (page,b) => page === 932 ? (b>=0x81&&b<=0x9f)||(b>=0xe0&&b<=0xfc)
      : [936,949,950].includes(page) && b>=0x81&&b<=0xfe;
    let pos = 0, count = 0;
    function group(depth = 0, inherited = {font:0,codepage:1252,uc:1}) {
      const state = {...inherited, destination:null, fontTable:inherited.destination==='fonttbl'};
      let fallback = 0;
      const encoding = () => {
        const f = lexicalFonts[state.font];
        return f?.page ?? (f?.charset === undefined || f.charset === 1 ? state.codepage : charsetPages[f.charset]);
      };
      const track = t => {
        if (fallback) {fallback=Math.max(0,fallback-(t.text?.length||1));return;}
        if (t.name && !state.destination) state.destination=t.name;
        if (t.name==='fonttbl') state.fontTable=true;
        if (t.name==='ansicpg') state.codepage=t.value;
        if (t.name==='mac') state.codepage=10000;
        if (t.name==='ansi') state.codepage=1252;
        if (t.name==='deff') state.font=lexicalDefault=t.value;
        if (t.name==='f') state.font=t.value;
        if (t.name==='plain') state.font=lexicalDefault;
        if (t.name==='uc') state.uc=fallbackLength(t.value);
        if (t.name==='u') fallback=state.uc;
        if (state.fontTable && ['fonttbl','f'].includes(state.destination) && ['fcharset','cpg'].includes(t.name)) {
          const f = lexicalFonts[state.font] ||= {};
          f[t.name==='cpg'?'page':'charset']=t.value;
        }
      };
      if (depth > 200) throw new Error('RTF groups are nested too deeply.');
      const out = [];
      while (pos < source.length) {
        if (++count > 3000000) throw new Error('RTF is too complex.');
        const before = out.length, c = source[pos++];
        if (c === '{') {fallback=0;out.push({group: group(depth + 1,state)});}
        else if (c === '}') return out;
        else if (c === '\\') {
          const next = source[pos++];
          if (next === "'") { const hex = source.slice(pos, pos + 2); pos += 2; if (/^[0-9a-f]{2}$/i.test(hex)) out.push({byte: parseInt(hex,16)}); }
          else if (/[a-z]/i.test(next || '')) {
            let name = next; while (/[a-z]/i.test(source[pos] || '')) name += source[pos++];
            const num = /^-?\d+/.exec(source.slice(pos)); const value = num ? +num[0] : null; if (num) pos += num[0].length;
            if (source[pos] === ' ') pos++;
            if (name === 'bin') { const len = Math.max(0, value || 0); out.push({binary: source.slice(pos, pos + len)}); pos += len; }
            else out.push({name, value});
          } else if (next === '\\' || next === '{' || next === '}') out.push({literal: next});
          else out.push({symbol: next});
        } else if (c !== '\r' && c !== '\n') {
          let text = '', b = c;
          do {
            text += b;
            if (rawLead(encoding(),b.charCodeAt(0)) && pos<source.length && source.charCodeAt(pos)<=255) text += source[pos++];
            if (pos>=source.length || /[{}\\\r\n]/.test(source[pos])) break;
            b=source[pos++];
          } while (true);
          out.push({text});
        }
        if (out.length>before && !out[out.length-1].group) track(out[out.length-1]);
      }
      if (depth) throw new Error('Incomplete RTF group.');
      return out;
    }
    const root = group(), flatten = list => list.flatMap(t => t.group ? flatten(t.group) : [t]);
    const all = flatten(root), fonts = {}, fontCharsets = {}, fontPages = {}, colors = [], warnings = new Set();
    const headerPage = all.find(t=>t.name==='ansicpg')?.value || (all.some(t=>t.name==='mac') ? 10000 : 1252);
    const pageLabels = {874:'windows-874',932:'shift_jis',936:'gbk',949:'euc-kr',950:'big5',10000:'macintosh',65001:'utf-8',...Object.fromEntries(Array.from({length:9},(_,i)=>[1250+i,'windows-'+(1250+i)]))};
    // RTF 1.9.1: an explicit font code page supersedes the page implied by fcharset.
    const pageFor = (font, fallbackPage) => fontPages[font] ?? (fontCharsets[font] === undefined || fontCharsets[font] === 1 ? fallbackPage : charsetPages[fontCharsets[font]]);
    function byteDecoder(page, charset) {
      if (!Object.hasOwn(pageLabels,page)) return bytes => {
        if (bytes.length) warnings.add('An unsupported RTF font charset or code page could not be decoded. Unconverted characters appear as �.');
        return bytes.map(b=>b === 32 || (charset !== 2 && b > 32 && b < 127) ? String.fromCharCode(b) : '�').join('');
      };
      const decoder = new TextDecoder(pageLabels[page]);
      return (bytes,final) => {
        const text = decoder.decode(Uint8Array.from(bytes),{stream:!final});
        if (text.includes('�') || /[\u0000-\u001f\u007f-\u009f]/.test(text)) warnings.add('Some RTF text bytes are undefined in their character encoding or form an invalid sequence and appear as �.');
        return text.replace(/[\u0000-\u001f\u007f-\u009f]/g,'�');
      };
    }
    // A character may span adjacent hex escapes, raw bytes or an escaped ASCII trail byte.
    // Bound the byte buffer while retaining the decoder's unfinished character between chunks.
    function byteBuffer(makeDecoder, emit) {
      let bytes = [], decoder = null;
      const flush = (final = true) => {
        if (!bytes.length && !decoder) return;
        decoder ||= makeDecoder(); emit(decoder(bytes,final)); bytes = [];
        if (final) decoder = null;
      };
      return {flush,append(b) { bytes.push(b); if (bytes.length >= 16384) flush(false); }};
    }
    function destination(list) { return list.find(t => t.name)?.name; }
    function visit(list, fn, uc = 1) {
      for (const t of list) {
        if (t.name === 'uc') uc = fallbackLength(t.value);
        if (t.group) { fn(t.group,uc); visit(t.group,fn,uc); }
      }
    }
    function readFontNames(list, inheritedUc = 1) {
      let id = null, name = '', skip = 0, uc = inheritedUc;
      // Font names are ordinary text even when the font's glyph charset is Symbol.
      const names = byteBuffer(()=>byteDecoder(pageFor(id,headerPage) ?? headerPage),text=>{name+=text;});
      for (const t of list) {
        if (t.group) {
          names.flush(); skip = 0;
          // Font entries may be grouped or flat. Nested destinations (panose, fname,
          // falt, fontemb, etc.) describe the font; they are not part of its name.
          if (destination(t.group) === 'f') readFontNames(t.group,uc);
          continue;
        }
        // A fallback control word/symbol (including an entire binary token) counts
        // as one character and must not change the name's decoding state.
        if (skip && t.text === undefined && t.literal === undefined) {skip--;continue;}
        if (t.name === 'f') { names.flush(); id = t.value; name = ''; skip = 0; }
        if (t.name === 'fcharset' && id !== null) {names.flush(); fontCharsets[id] = t.value;}
        if (t.name === 'cpg' && id !== null) {names.flush(); fontPages[id] = t.value;}
        if (t.name === 'uc') uc = fallbackLength(t.value);
        if (t.name === 'u') { names.flush(); name += String.fromCharCode((t.value + 65536) % 65536); skip = uc; }
        const text = t.text ?? t.literal ?? (t.byte === undefined ? '' : String.fromCharCode(t.byte));
        for (const c of text) {
          if (skip) { skip--; continue; }
          if (c === ';') { names.flush(); if (id !== null) fonts[id] = name.trim(); name = ''; id = null; }
          else if (c.charCodeAt(0) <= 255) names.append(c.charCodeAt(0));
          else { names.flush(); name += c; }
        }
      }
      names.flush();
    }
    visit(root, (list, uc) => {
      const dest = destination(list), tokens = flatten(list);
      if (dest === 'fonttbl') readFontNames(list,uc);
      if (dest === 'colortbl') {
        let rgb = [0,0,0], set = false;
        for (const t of tokens) {
          const i = ['red','green','blue'].indexOf(t.name); if (i >= 0) { rgb[i] = Math.max(0,Math.min(255,t.value || 0)); set = true; }
          for (const c of t.text || '') if (c === ';') { colors.push(set ? '#' + rgb.map(n => n.toString(16).padStart(2,'0')).join('') : null); rgb=[0,0,0]; set=false; }
        }
      }
    });
    const defaultFont = all.find(t => t.name === 'deff')?.value || 0;
    const doc = JSON.parse(JSON.stringify(current || Engine.defaultDoc()));
    doc.text = ''; doc.flow = false; doc.textSize = null; doc.sections = [];
    doc.images = doc.images.filter(p => p.kind === 'yigo' && p.id === doc.yigo.image);
    doc.assets = doc.assets.filter(a => doc.images.some(p => p.asset === a.id));
    if (!doc.images.length) doc.yigo.image = '';
    const uniqueId = (prefix, items) => { let i=items.length; while(items.some(x=>x.id===prefix+i)) i++; return prefix+i; };
    const initial = {font:defaultFont,size:12,bold:false,italic:false,underline:false,strike:false,color:0,align:'l',uc:1,codepage:1252};
    let output = '', lastStyle = '';
    const fontToken = id => Object.hasOwn(table,fonts[id]) ? 'jomolhari' : Engine.fontToken(fonts[id]) || 'serif';
    function emitStyle(state) {
      const size = state.size * (Object.hasOwn(table,fonts[state.font]) ? .75 : 1);
      const style = `{/role font:${fontToken(state.font)} ${size} ${state.bold?'b':'/b'} ${state.italic?'i':'/i'} ${state.underline?'u':'/u'} ${state.strike?'s':'/s'} ${colors[state.color] || 'color'} ${state.align}}`;
      if (style !== lastStyle) { output += style; lastStyle = style; }
    }
    function emit(text, state) {
      if (!text) return;
      emitStyle(state);
      output += text.replace(/[{}]/g, c => c === '{' ? '{lc}' : '{rc}');
    }
    function picture(list, state) {
      if (!list.some(t => t.name === 'pngblip')) { warnings.add('A non-PNG RTF picture was skipped.'); return; }
      const value = name => list.find(t => t.name === name)?.value;
      const hex = list.map(t => t.text || (t.binary ? Array.from(t.binary,c => c.charCodeAt(0).toString(16).padStart(2,'0')).join('') : '')).join('').replace(/\s/g,'');
      if (!/^[0-9a-f]+$/i.test(hex) || hex.length % 2 || hex.length > 12000000) {warnings.add('An invalid or oversized RTF picture was skipped.'); return;}
      const bytes = Uint8Array.from(hex.match(/../g), h => parseInt(h,16));
      if (bytes.length < 24 || hex.slice(0,16).toLowerCase() !== '89504e470d0a1a0a') {warnings.add('An invalid PNG was skipped.'); return;}
      const view = new DataView(bytes.buffer), width = view.getUint32(16), height = view.getUint32(20);
      if (!width || !height || width * height > 16000000) {warnings.add('An oversized PNG was skipped.'); return;}
      let binary = ''; for (const b of bytes) binary += String.fromCharCode(b);
      const data = 'data:image/png;base64,' + btoa(binary);
      let asset = doc.assets.find(a => a.data === data);
      if (!asset) {asset = {id:uniqueId('rtf-asset-',doc.assets), data, width, height}; doc.assets.push(asset);}
      const resolution = PechaImages.pngResolution(bytes), goal = value('picwgoal'), heightGoal = value('pichgoal');
      const dpi = goal > 0 ? width * 1440 / goal : resolution?.x || 96;
      const dpiY = heightGoal > 0 ? height * 1440 / heightGoal : resolution?.y || 96;
      const p = PechaImages.placement({id:uniqueId('rtf-image-',doc.images),asset:asset.id,dpi,
        dpiY:dpiY === dpi ? null : dpiY,scale:value('picscalex') || 100});
      if (value('picscaley') && value('picscaley') !== p.scale) warnings.add('Nonuniform RTF image scaling was reduced to its width scale.');
      doc.images.push(p); emitStyle(state); output += `{image:${p.id}}`;
    }
    const skip = new Set(['fonttbl','colortbl','stylesheet','info','header','headerl','headerr','footer','footerl','footerr','footnote','annotation','object','objdata','fldinst','listtable','listoverridetable','generator','themedata','colorschememapping','datastore','xmlnstbl','shp','nonshppict']);
    function walk(list, inherited) {
      const state = {...inherited};
      let fallback = 0;
      const bytes = byteBuffer(()=>{
        const map = Object.hasOwn(table,fonts[state.font]) ? table[fonts[state.font]] : null;
        return map ? values=>values.map(b=>{
          if (map[b] !== undefined) return map[b];
          if (b === 32) return ' ';
          warnings.add('Some legacy font characters could not be mapped.'); return '�';
        }).join('') : byteDecoder(pageFor(state.font,state.codepage),fontCharsets[state.font]);
      },text=>emit(text,state));
      const appendByte = b => {if (fallback) fallback--; else bytes.append(b);};
      for (const t of list) {
        if (t.group) {
          // Opening and closing braces end fallback skipping, even for destinations
          // that are ignored, images, or the Unicode branch of a dual representation.
          bytes.flush(); fallback = 0;
          const dest = destination(t.group), starred = t.group.some((x,i) => i < 2 && x.symbol === '*');
          if (skip.has(dest) || (starred && !['ud','shppict'].includes(dest))) { if (['object','shp','nonshppict'].includes(dest)) warnings.add('Some embedded objects or drawings were skipped.'); continue; }
          if (dest === 'pict') { picture(t.group, state); continue; }
          if (dest === 'upr') {
            const branches = t.group.filter(t => t.group);
            const unicode = branches.find(t => destination(t.group) === 'ud');
            if (unicode || branches[0]) walk((unicode || branches[0]).group, state);
            continue;
          }
          walk(t.group,state); continue;
        }
        if (t.text !== undefined) {
          for (let i=0;i<t.text.length;i++) { const n=t.text.charCodeAt(i); if(n<=255) appendByte(n); else if(!fallback) {bytes.flush();emit(t.text[i],state);} else fallback--; }
          continue;
        }
        if (t.byte !== undefined) { appendByte(t.byte); continue; }
        if (t.literal) { appendByte(t.literal.charCodeAt(0)); continue; }
        bytes.flush();
        if (fallback) {fallback--;continue;}
        if (t.symbol) { if (t.symbol === '~') emit('\u00a0',state); else if (t.symbol === '_') emit('\u2011',state); continue; }
        const n = t.value, name = t.name;
        if (name === 'u' && n !== null) { emit(String.fromCharCode(n < 0 ? n + 65536 : n),state); fallback = state.uc; }
        else if (name === 'uc') state.uc = fallbackLength(n);
        else if (name === 'f') state.font = n;
        else if (name === 'fs') state.size = Math.max(1,Math.min(200,(n || 24)/2));
        else if (name === 'b') state.bold = n !== 0;
        else if (name === 'i') state.italic = n !== 0;
        else if (name === 'ul') state.underline = n !== 0;
        else if (name === 'ulnone') state.underline = false;
        else if (name === 'strike') state.strike = n !== 0;
        else if (name === 'cf') state.color = n || 0;
        else if (['ql','qr','qc','qj'].includes(name)) state.align = name[1];
        else if (name === 'plain') Object.assign(state, {font:defaultFont,size:12,bold:false,italic:false,underline:false,strike:false,color:0});
        else if (name === 'pard') state.align = 'l';
        else if (name === 'ansicpg') state.codepage = n;
        else if (name === 'mac') state.codepage = 10000;
        else if (name === 'par' || name === 'line') emit('\n',state);
        else if (name === 'tab') emit('\t',state);
        else if (name === 'page') output += '{page}';
        else if (name === 'emdash') emit('—',state);
        else if (name === 'endash') emit('–',state);
        else if (name === 'bullet') emit('•',state);
        else if (name === 'lquote' || name === 'rquote') emit(name === 'lquote' ? '‘' : '’',state);
        else if (name === 'ldblquote' || name === 'rdblquote') emit(name === 'ldblquote' ? '“' : '”',state);
        else if (name === 'cell' || name === 'row') { emit(name === 'cell' ? '\t' : '\n',state); warnings.add('Table layout was converted to tabs and lines.'); }
      }
      bytes.flush();
    }
    walk(root,initial); doc.text = output;
    return {doc, warnings:[...warnings]};
  }

  function insert(input, current, source, start, end, Engine, table, TextFormat) {
    const imported = read(input,Engine,table), fragment = imported.doc;
    if (!fragment.text) return {empty:true,warnings:imported.warnings};
    const assets = [...current.assets], images = [...current.images], ids = new Map(), assetIds = new Map();
    const unique = (prefix, items) => { let n=items.length; while(items.some(x=>x.id===prefix+n)) n++; return prefix+n; };
    for (const asset of fragment.assets) {
      let existing = assets.find(a=>a.data===asset.data && a.width===asset.width && a.height===asset.height);
      if (!existing) { existing = {...asset,id:unique('paste-asset-',assets)}; assets.push(existing); }
      assetIds.set(asset.id,existing.id);
    }
    for (const placement of fragment.images) {
      const id = unique('paste-image-',images); ids.set(placement.id,id);
      images.push({...placement,id,asset:assetIds.get(placement.asset)});
    }
    if (assets.length > 200 || images.length > 1000) throw new Error('Pasting would exceed the document image limit.');
    const text = fragment.text.replace(/\{image:([\w-]+)\}/g,(_,id)=>`{image:${ids.get(id)}}`);
    return {...TextFormat.insertRich(source,start,end,text,Engine),assets,images,warnings:imported.warnings};
  }

  function insertMark(input, slot, start, end, Engine, table, TextFormat, kind = 'note') {
    const imported = read(input,Engine,table), warnings = new Set(imported.warnings);
    const literal = s => s.replace(/[{}]/g,c=>c==='{'?'{lc}':'{rc}');
    let fragment = '', hasText = false;
    for (const run of Engine.parseStream(imported.doc.text,false)) {
      if (run.k === 'image') { warnings.add('Pictures were skipped: this text field contains text only.'); continue; }
      if (run.k === 'page') { fragment += ' '; warnings.add('Line breaks, page breaks and tabs were converted to spaces in the single-line field.'); continue; }
      if (run.k !== 'text') continue;
      if (/[\r\n\u2028\t]/.test(run.s)) warnings.add('Line breaks, page breaks and tabs were converted to spaces in the single-line field.');
      const s = run.style;
      // Automatic marks own their size. Native yi-go streams use font/colour only.
      const emphasis = kind === 'yigo' ? [] : [s.bold?'b':'/b',s.italic?'i':'/i',s.underline?'u':'/u',s.strike?'s':'/s'];
      if (kind === 'yigo' && (s.bold || s.italic || s.underline || s.strike)) warnings.add('Yi-go paste keeps fonts and colours; pasted emphasis is ignored.');
      fragment += '{'+[s.font ? 'font:'+s.font : 'font',...emphasis,s.color||'color'].join(' ')+'}'+literal(run.s.replace(/[\r\n\u2028\t]/g,' '));
      hasText ||= !!run.s.trim();
    }
    if (!hasText) return {empty:true,warnings:[...warnings]};
    let source = slot.text;
    if (!slot.rich) {
      start = literal(source.slice(0,start)).length;
      end = literal(source.slice(0,end)).length;
      source = literal(source);
    }
    const result = TextFormat.insertRich(source,start,end,fragment,Engine);
    // Convert literal braces outside the selection in the same undoable edit when enabling rich text.
    if (!slot.rich) Object.assign(result,{start:0,end:slot.text.length,replacement:result.text});
    return {...result,warnings:[...warnings]};
  }

  const insertNote = (...args) => insertMark(...args);
  return {write, escape, read, copySelection, copyMark, insert, insertMark, insertNote};
})();
if (typeof module !== 'undefined') module.exports = Rtf;
