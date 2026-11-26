// Reader for PechaMaker .pxp / .pxc / .pxt / .pxa files. Written from the sample files and the User's
// Guide, with targeted observations of file-format framing. A file is: a header with a font table, a NON-BODY block of
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
    const fonts = {}, fontCharsets = {};
    const annotationHeader = /^\.pxa 0\.1 u1 u2 u3 u4 (\d+) (\d+) /.exec(head);
    if (annotationHeader && +annotationHeader[1]) {
      // Native PXA inherits five TCC slots; family switching replaces fonts without rewriting streams.
      // Normalize their shared legacy encoding with the independently maintained conversion tables.
      for (let i=0;i<5;i++) {fonts[i] = i ? 'TibetanMachineSkt'+i : 'TibetanMachine'; fontCharsets[i] = 0;}
    }
    const list = annotationHeader ? head.slice(annotationHeader[0].length) : head.replace(/^.*?u4 \d+ \d+ \d+ /s, '');
    const re = /(\d+) (\d+) ([^\0]+)\0/g;
    let m;
    while ((m = re.exec(list))) {
      const id = +m[1] + (annotationHeader ? 5 : 0);
      fonts[id] = m[3]; fontCharsets[id] = +m[2];
    }
    return {fonts, fontCharsets};
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
      if (line.replace(/\r$/, '') === '[END NON-BODY]') return {values:out,raw,end:i};
      const m = /^(?:iNiT )?([^=]+)=(.*)$/.exec(line.replace(/\r$/, ''));
      if (!m) continue;
      const [, k, v] = m;
      if (/(\.s|Stream)$/.test(k)) {
        if (!Number.isInteger(lastLen) || lastLen < 0 || lastLen > end - i) throw new Error('Invalid native text-stream length');
        raw[k] = b.subarray(i, i + lastLen);
        i += lastLen;
        if (b[i] === 13) i++;
        if (b[i] !== 10) throw new Error('Invalid native text-stream separator');
        i++;
      } else {
        out[k] = v;
        if (/(slen|Len)$/.test(k)) lastLen = +v;
      }
    }
    throw new Error('Missing native NON-BODY terminator');
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
  // Windows font charset values map to standard code pages. DBCS bytes are
  // decoded together, ending at native records rather than crossing their boundaries.
  const charsetPages = {0:1252,1:1252,161:1253,162:1254,163:1258,177:1255,178:1256,186:1257,204:1251,222:874,238:1250};
  const multibyteLabels = {128:'shift_jis',129:'euc-kr',134:'gbk',136:'big5'};
  const byteDecoders = new Map();
  let nativeEncodingCache;
  function nativeEncodings() {
    if (nativeEncodingCache) return nativeEncodingCache;
    const encodings = [[0,1252],[238,1250],[204,1251],[161,1253],[162,1254],[177,1255],[178,1256],[186,1257],[163,1258],[222,874]].map(([charset,page])=>{
      const decoded=new TextDecoder('windows-'+page).decode(Uint8Array.from({length:256},(_,i)=>i)),map=new Map();
      for(let b=32;b<256;b++)if(!/[\u007f-\u009f�]/.test(decoded[b]))map.set(decoded[b],b);
      return {charset,map};
    });
    for (const charset of [128,129,134,136]) {
      let map;
      encodings.push({charset,get map() {
        if(map)return map;
        map=new Map();const decoder=new TextDecoder(multibyteLabels[charset]);
        const add=bytes=>{
          const text=decoder.decode(Uint8Array.from(bytes));
          // Keep exact BMP mappings only: no best-fit, replacement, private-use
          // or multi-character aliases. Lowest byte sequence wins duplicates.
          if(text.length===1&&!/[\u0000-\u001f\u007f-\u009f\ue000-\uf8ff�]/.test(text)&&!map.has(text))map.set(text,bytes);
        };
        for(let b=32;b<256;b++)add([b]);
        // The Big5 extension area below A1 and above F9 is not Windows CP950.
        for(let a=charset===136?0xa1:0x81;a<=(charset===136?0xf9:0xfe);a++)
          for(let b=0x40;b<=0xfe;b++)add([a,b]);
        return map;
      }});
    }
    return nativeEncodingCache=encodings;
  }
  function decodeStream(bytes, fonts, table, startFont = 0, fontCharsets = {}) {
    const ev = [];
    let font = startFont, buf = '', bufFont = startFont;
    const unknown = {}, warnings = new Set();
    const flush = () => { if (buf) { ev.push({ t: 'text', s: buf, font: bufFont }); buf = ''; } };
    const append = (text, id) => { if (id !== bufFont) flush(); bufFont = id; buf += text; };
    const map = (fontId, c) => {
      const name = fonts[fontId] || '';
      const t = Object.hasOwn(table,name) ? table[name] : null;
      if (t) {
        if (t[c] !== undefined) return t[c];
        if (c === 32) return ' ';
        unknown[name + ':' + c] = (unknown[name + ':' + c] || 0) + 1;
        return '';
      }
      const charset = fontCharsets[fontId] ?? 0, page = charsetPages[charset];
      let text = null;
      if (page) {
        if (!byteDecoders.has(page)) byteDecoders.set(page, Array.from(new TextDecoder('windows-'+page).decode(Uint8Array.from({length:256},(_,i)=>i))));
        text = byteDecoders.get(page)[c];
        if (charset === 1 && c >= 128) warnings.add('A system-default font charset was decoded as Windows-1252. The source Windows locale is not recorded; check extended characters.');
      } else if (multibyteLabels[charset]) {
        // A framed glyph contains exactly one byte; it cannot borrow a trail byte.
        text = new TextDecoder(multibyteLabels[charset]).decode(Uint8Array.of(c));
      } else {
        warnings.add(`Native font charset ${charset} (${name || 'unnamed font'}) is unsupported. Unconverted glyphs appear as �; check against the original.`);
        // ASCII survives in unsupported text encodings, but symbol glyphs do not.
        if (c === 32 || (charset !== 2 && c >= 32 && c < 127)) text = String.fromCharCode(c);
      }
      if (!text || text === '�' || /[\u0000-\u001f\u007f-\u009f]/.test(text)) {
        const key = `${name || 'font '+fontId}:charset${charset}:${c}`;
        unknown[key] = (unknown[key] || 0) + 1;
        warnings.add('Some native text bytes could not be decoded and appear as �.');
        return '�';
      }
      return text;
    };
    let pending = [], decoder = null;
    const flushBytes = (final = true) => {
      if (!pending.length && !decoder) return;
      decoder ||= new TextDecoder(multibyteLabels[fontCharsets[font]]);
      const text = decoder.decode(Uint8Array.from(pending),{stream:!final}); pending = [];
      const invalid = text.match(/[�\u0000-\u001f\u007f-\u009f]/g);
      if (invalid) {
        const key = `${fonts[font] || 'font '+font}:charset${fontCharsets[font]}:sequence`;
        unknown[key] = (unknown[key] || 0) + invalid.length;
        warnings.add('Some native text bytes could not be decoded and appear as �.');
      }
      append(text.replace(/[\u0000-\u001f\u007f-\u009f]/g,'�'),font);
      if (final) decoder = null;
    };
    for (let i = 0; i < bytes.length; i++) {
      const c = bytes[i];
      if (c === 0x11 && bytes[i + 5] === 0x11) {
        const op = bytes[i + 1], a = bytes[i + 2], b = bytes[i + 3], d = bytes[i + 4];
        flushBytes(); flush();
        if (op === 0x20) font = a;                 // font name
        ev.push({ t: 'code', op, a, b, d, font });
        i += 5;
      } else if (c === 0x14 && bytes[i + 5] === 0x14) {
        flushBytes();
        append(map(bytes[i + 2], bytes[i + 3]), bytes[i + 2]);
        i += 5;
      } else if (c === 0x13 && i + 5 < bytes.length) {
        flushBytes(); flush(); ev.push({t:'image',index:bytes[i+3]+256*bytes[i+4]}); i+=5;
      } else if (c === 11) {
        // Native Hard Shad is a one-byte control, independent of the active font.
        flushBytes(); flush(); ev.push({ t: 'hardShad', font });
      } else if (c === 13 || c === 10) {
        flushBytes(); flush(); ev.push({ t: 'hr' });
        if (c === 13 && bytes[i + 1] === 10) i++;
      } else if (c === 12) {
        flushBytes(); flush(); ev.push({ t: 'page' });
      } else if (c === 9) {
        flushBytes(); append('\t', font);
      } else {
        if (multibyteLabels[fontCharsets[font]] && !Object.hasOwn(table,fonts[font])) {
          pending.push(c); if (pending.length >= 16384) flushBytes(false);
        } else append(map(font, c), font);
      }
    }
    flushBytes(); flush();
    return { ev, unknown, warnings: [...warnings] };
  }

  function parse(u8, table) {
    const b = u8 instanceof Uint8Array ? u8 : new Uint8Array(u8);
    const sNB = indexOf(b, '[START NON-BODY]');
    let sT = -1, eT = -1, templateEnd = -1;
    // Standalone template files use the INI layout without the document's font/body wrapper.
    // The original executable exposes this template heading and File Version section.
    if (sNB < 0 && indexOf(b, '[PageSetup]') >= 0 && indexOf(b, '[PechaControl]') >= 0) {
      return {version: '', fonts: {}, fontCharsets: {}, nonBody: {values: {}, raw: {}}, template: parseIni(LAT(b, 0, b.length)), body: b.subarray(b.length)};
    }
    if (!/^\.px[pcta]$/.test(LAT(b, 0, 4)) && sNB < 0) throw new Error('Not a PechaMaker file');
    const {fonts, fontCharsets} = parseFonts(LAT(b, 0, sNB < 0 ? 200 : sNB));
    // Raw annotation streams can contain section-marker text. Follow their byte lengths
    // before looking for a template, and recognize template markers only as whole lines.
    const nb = sNB >= 0 ? parseNonBody(b, sNB + '[START NON-BODY]'.length, b.length) : {values:{},raw:{},end:0};
    const header = /^\.px[pc] [\d.]+ \d+ u1 u2 u3 u4 (\d+) /.exec(LAT(b,0,sNB < 0 ? 200 : sNB));
    const bodyLength = header ? +header[1] : null;
    const imageHeaderAt = at => /^\n\[START IMAGES\] [^\r\n]+\r?\n(?:ImageInfoCount|ImageInfo_SizeOf)=\d+/.test(LAT(b,at,Math.min(b.length,at+160)));
    const bodyEndsAt = at => at === b.length || (at < b.length && imageHeaderAt(at));
    // Real PXC files omit the template. A leading marker in their declared body is text.
    const directContent = LAT(b,0,4) === '.pxc' && bodyLength > 0 && bodyEndsAt(nb.end+bodyLength);
    let next = nb.end;
    while (b[next] === 10 || b[next] === 13) next++;
    if (!directContent && LAT(b,next,next+'[START TEMPLATE]'.length) === '[START TEMPLATE]') {
      let cursor = next+'[START TEMPLATE]'.length;
      if (b[cursor] === 13) cursor++;
      if (b[cursor] === 10) {
        sT = ++cursor;
        while (cursor < b.length) {
          let nl = cursor; while (nl < b.length && b[nl] !== 10) nl++;
          if (LAT(b,cursor,nl).replace(/\r$/, '') === '[END TEMPLATE]') {eT=cursor;templateEnd=Math.min(nl+1,b.length);break;}
          cursor = nl+1;
        }
        if (eT < 0) throw new Error('Missing native TEMPLATE terminator');
      }
    }
    const tpl = sT >= 0 ? parseIni(LAT(b,sT,eT)) : {};
    const bodyStart = templateEnd >= 0 ? templateEnd : nb.end;
    const declaredEnd = bodyLength !== null ? bodyStart+bodyLength : -1;
    const imageStart = declaredEnd >= bodyStart && bodyEndsAt(declaredEnd) ? (declaredEnd < b.length ? declaredEnd : -1) : indexOf(b, '\n[START IMAGES] ', bodyStart);
    const hasImageBlock = imageStart >= 0 && imageHeaderAt(imageStart);
    return { version: LAT(b, 0, 12), fonts, fontCharsets, nonBody: nb, template: tpl,
      imageBlock: hasImageBlock ? b.subarray(imageStart) : null,
      body: b.subarray(bodyStart, hasImageBlock ? imageStart : b.length) };
  }

  // Independent reader for observed image-header versions 1.0 and 1.1.
  // Unsupported record sizes and page anchor codes are reported explicitly.
  function readImages(block) {
    const assets=[], images=[], warnings=[];
    if (!block) return {assets,images,warnings};
    warnings.push('Native image import is experimental; check every image position and size.');
    if (block.length>24000000) {warnings.push('The native image block is too large.'); return {assets,images,warnings};}
    let pos=0, phase='', record={}, payload=null; const groups={IINFO:[],LIINFO:[],PIINFO:[]};
    const line=()=>{let end=pos;while(end<block.length && block[end]!==10)end++;const value=LAT(block,pos,end).replace(/\r$/,'');pos=end+1;return value;};
    if (line()==='') {} else pos=0;
    const version=line();
    if (!['[START IMAGES] 1.0','[START IMAGES] 1.1'].includes(version)) {warnings.push('This native image-header version is not supported.');return {assets,images,warnings};}
    if(version.endsWith('1.0')) {
      // Version 1.0 uses fixed little-endian records between textual count lines.
      // Only the observed complete record sizes are supported; never guess older layouts.
      try {
        const number=key=>{const text=line();if(!text.startsWith(key+'=') || !/^\d+$/.test(text.slice(key.length+1)))throw 0;return +text.slice(key.length+1);};
        const records=(prefix,kind,size,read)=>{
          if(number(prefix+'_SizeOf')!==size)throw 0;
          const count=number(prefix+'Count');if(count>1000 || pos+count*size>block.length)throw 0;
          for(let index=0;index<count;index++,pos+=size)groups[kind][index]=read(new DataView(block.buffer,block.byteOffset+pos,size));
          if(line()!=='')throw 0;
        };
        records('ImageInfo','IINFO',28,v=>({imageOffset:v.getUint32(0,true),compSize:v.getUint32(8,true),
          dibXDPI:v.getUint16(24,true),dibYDPI:v.getUint16(26,true)}));
        records('LineImageInfo','LIINFO',40,v=>({iInfoIndex:v.getUint16(0,true),ignoreImgDPI:v.getInt32(4,true),
          scale:v.getInt32(8,true),sideSp_float:v.getFloat64(20,true),yAdj_float:v.getFloat64(28,true),addTFA:v.getInt32(36,true)}));
      } catch {warnings.push('Unsupported or incomplete native 1.0 image records were skipped.');return {assets,images,warnings};}
    }
    let count=0;
    while(pos<block.length && count++<40000) {
      const text=line();
      const header=/^(ImageInfoCount|LineImageInfoCount|PageImageInfoCount)=(\d+)$/.exec(text);
      if(header){phase={ImageInfoCount:'IINFO',LineImageInfoCount:'LIINFO',PageImageInfoCount:'PIINFO'}[header[1]];record={};continue;}
      const end=/^\[END (IINFO|LIINFO|PIINFO) (\d+)\]$/.exec(text);
      if(end){const index=+end[2];if(index<1000 && end[1]===phase)groups[phase][index]=record;record={};continue;}
      const total=/^Images_totalBytes=(\d+)$/.exec(text);
      if(total){const size=+total[1];if(size<=block.length-pos)payload=block.subarray(pos,pos+size);break;}
      const field=/^([A-Za-z_]+)=(-?\d+(?:\.\d+)?)$/.exec(text);
      if(field && phase)record[field[1]]=+field[2];
    }
    if(!payload){warnings.push('The native image payload is incomplete.');return {assets,images,warnings};}
    const assetIds=new Map(), resolutions=new Map();
    groups.IINFO.slice(0,200).forEach((info,index)=>{
      if(!info)return;
      const offset=info.imageOffset,size=info.compSize;
      if(!Number.isInteger(offset)||!Number.isInteger(size)||offset<0||size<24||size>8000000||offset+size>payload.length){warnings.push('An invalid native image record was skipped.');return;}
      const bytes=payload.subarray(offset,offset+size);
      if(LAT(bytes,0,8)!=='\x89PNG\r\n\x1a\n'){warnings.push('A non-PNG native image was skipped.');return;}
      const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),width=view.getUint32(16),height=view.getUint32(20);
      if(!width||!height||width*height>16000000){warnings.push('An oversized native image was skipped.');return;}
      let binary='';for(const b of bytes)binary+=String.fromCharCode(b);
      const data='data:image/png;base64,'+btoa(binary);
      let asset=assets.find(a=>a.data===data);
      if(!asset){asset={id:'native-asset-'+index,data,width,height};assets.push(asset);}
      assetIds.set(index,asset.id);
      // Windows decodes each PNG after reading the image table and replaces
      // the saved DPI fields. Its bitmap starts at 2835 pixels/metre (72 DPI);
      // only absolute pHYs replaces that default. Conversion truncates to u16.
      const density=PechaImages.pngDensity(bytes);
      const x=density?.unit===1 ? Math.trunc(density.x*.0254)&65535 : 72;
      const y=density?.unit===1 ? Math.trunc(density.y*.0254)&65535 : 72;
      if(density?.unit!==1)warnings.push('An embedded native PNG has no absolute resolution; the Windows bitmap default of 72 DPI is used.');
      if((info.dibXDPI!==undefined && info.dibXDPI!==x) || (info.dibYDPI!==undefined && info.dibYDPI!==y))warnings.push('Embedded PNG resolution overrides the saved native image-table DPI, as in Windows.');
      if(!x || !y)warnings.push('Zero native PNG resolution; both axes use the web fallback of 96 DPI. Windows uses its reference display.');
      resolutions.set(index,x && y ? {dpi:x,dpiY:x===y?null:y} : {dpi:96,dpiY:null});
    });
    groups.LIINFO.forEach((info,index)=>{
      if(!info||!assetIds.has(info.iInfoIndex))return;
      images.push(PechaImages.placement({id:'native-inline-'+index,asset:assetIds.get(info.iInfoIndex),
        ...resolutions.get(info.iInfoIndex),ignoreDpi:!!info.ignoreImgDPI,scale:info.scale||100,
        above:info.yAdj_float||0,space:info.sideSp_float||0,addTibetan:!!info.addTFA}));
    });
    const nativeAnchors={0:'outer-left',1:'inner-left',2:'text-left',4:'text-right',5:'inner-right',6:'outer-right'};
    groups.PIINFO.forEach((info,index)=>{
      if(!info || !assetIds.has(info.iInfoIndex))return;
      if(!nativeAnchors[info.slot] || !Number.isInteger(info.pageNbr) || info.pageNbr<1 || info.pageNbr>3000) {
        warnings.push('A native page-image anchor or page number is unsupported and was skipped.');return;
      }
      const down=Math.max(.01,info.yAdj_float||0),inward=Math.max(.01,info.xAdj_float||0);
      if(down!==(info.yAdj_float||0)||inward!==(info.xAdj_float||0))warnings.push('Native page-image offsets below 0.01 inch are raised to 0.01 inch, as in Windows.');
      images.push(PechaImages.placement({id:'native-page-'+index,asset:assetIds.get(info.iInfoIndex),kind:'page',
        page:info.pageNbr,anchor:nativeAnchors[info.slot],...resolutions.get(info.iInfoIndex),
        ignoreDpi:!!info.ignoreImgDPI,scale:info.scale||100,down,
        inward,margin:info.xMar_float||0}));
    });
    return {assets,images,warnings:[...new Set(warnings)]};
  }

  const ALIGN = { 0x32: 'l', 0x33: 'r', 0x34: 'c', 0x35: 'j' };
  const TIB_SCALE = 0.75;   // TibetanMachine is drawn smaller on its em than Jomolhari

  // Events to the {code} text the engine reads. Colours and sizes carry over as the file has them.
  function eventsToText(ev, isTibetanFont, fontMarks = false) {
    const fontToken = typeof fontMarks === 'function' ? fontMarks : id => isTibetanFont(id) ? 'jomolhari' : 'serif';
    let face = fontMarks ? fontToken(0) : null;
    let out = face && ev.length ? `{font:${face}}` : '', written = null, raw = null, font = 0;
    const writeFont = id => {
      const next = fontMarks && fontToken(id);
      if (next && next !== face) { out += `{font:${next}}`; face = next; }
    };
    for (const e of ev) {
      if (e.t === 'text' || e.t === 'hardShad') {
        const effectiveFont = e.font ?? font;
        writeFont(effectiveFont);
        const v = raw === null ? null : Math.round(raw * (isTibetanFont(effectiveFont) ? TIB_SCALE : 1));
        if (v && v !== written) { out += `{${v}}`; written = v; }
        out += e.t === 'hardShad' ? '{hs}' : e.s.replace(/[{}]/g, c => c === '{' ? '{lc}' : '{rc}');
      }
      else if (e.t === 'image') out += `{image:native-inline-${e.index}}`;
      else if (e.t === 'hr') out += '\n';
      else if (e.t === 'page') out += '{page}';
      else if (e.op === 0x20) { font = e.a; writeFont(font); }
      else if (e.op === 0x21) raw = e.b;
      else if (e.op === 0x22) {
        const hex = [e.a, e.b, e.d].map(c => c.toString(16).padStart(2, '0')).join('');
        out += `{#${hex}}`;  // Native RGB black is explicit, not the web default-color reset.
      }
      else if (e.op === 0x23) out += e.a ? '{b}' : '{/b}';
      else if (e.op === 0x24) out += e.a ? '{i}' : '{/i}';
      else if (e.op === 0x25) out += e.a ? '{u}' : '{/u}';
      else if (e.op === 0x26) out += e.a ? '{s}' : '{/s}';
      else if (ALIGN[e.op]) out += `{${ALIGN[e.op]}}`;
      else if (e.op === 0x48) out += '\t';
    }
    return out;
  }

  const nativeFont = (id, fonts, table, Engine) => Object.hasOwn(table,fonts[id]) ? 'jomolhari' : Engine.fontToken(fonts[id]) || 'serif';
  function richText(bytes, fonts, table, fontCharsets, Engine, yigo = false) {
    if (!bytes || !bytes.length) return '';
    let events = decodeStream(bytes, fonts, table, 0, fontCharsets).ev;
    // The original yi-go renderer handles font and colour codes; its size follows the page's first character.
    if (yigo) events = events.filter(e => e.t !== 'code' || e.op === 0x20 || e.op === 0x22);
    return eventsToText(events, id => Object.hasOwn(table,fonts[id]), id => nativeFont(id,fonts,table,Engine)).replace(/[\r\n]/g, ' ');
  }

  const num = (v, d) => (v === undefined || v === '' || Number.isNaN(+v) ? d : +v);
  const on = (v, d) => (v === undefined ? d : +v !== 0);

  // Fills an engine document from a parsed file. Box geometry carries across unchanged. The first
  // explicit box-to-first-baseline distance is retained; missing legacy values use automatic placement.
  function toDoc(u8, table, base, Engine) {
    const p = parse(u8, table);
    const d = base, t = p.template, v = p.nonBody.values, raw = p.nonBody.raw;
    const fontScale = TIB_SCALE;
    const nativeImages=readImages(p.imageBlock);
    if (Object.values(p.fonts).some(name => Object.hasOwn(table,name) && /^(?:TibetanClassic|TibetanChogyal)(?:Skt[1-4]?)?$/.test(name))) nativeImages.warnings.push('TibetanClassic/Chogyal conversion is experimental and still needs comparison with the original fonts.');
    if (p.version.startsWith('.pxa 0.1')) {
      nativeImages.warnings.push('Native annotation-file import is experimental; exact legacy rendering still needs original-app verification.');
      const head=LAT(u8 instanceof Uint8Array ? u8 : new Uint8Array(u8),0,100);
      if (/^\.pxa 0\.1 u1 u2 u3 u4 [1-9]/.test(head)) nativeImages.warnings.push('Inherited TCC font slots use the TibetanMachine conversion tables. Check Tibetan glyphs and appearance against the original; the source typeface is not recorded.');
    }
    d.assets=nativeImages.assets; d.images=nativeImages.images; d.yigo.image='';
    if(on(v.YigoImageEn,false)) {
      const source=d.images.find(im=>im.id==='native-inline-'+num(v.YigoLineImageIndex,-1));
      if(source){const yi={...source,id:'native-yigo',kind:'yigo'};d.images.push(yi);d.yigo.image=yi.id;}
    }
    const { ev, unknown, warnings } = decodeStream(p.body, p.fonts, table, 0, p.fontCharsets);
    nativeImages.warnings.push(...warnings);
    for (const bytes of Object.values(raw)) {
      const decoded = decodeStream(bytes,p.fonts,table,0,p.fontCharsets);
      nativeImages.warnings.push(...decoded.warnings);
      if (Object.keys(decoded.unknown).length) nativeImages.warnings.push('Some annotation or yi-go characters could not be converted. Check these marks against the original.');
    }
    if(ev.some(e=>e.t==='image'&&!d.images.some(p=>p.id==='native-inline-'+e.index))) nativeImages.warnings.push('Some inline image references could not be recovered.');
    d.text = eventsToText(ev, id => Object.hasOwn(table,p.fonts[id]), id => nativeFont(id,p.fonts,table,Engine)).replace(/\s+$/, '');
    if (Object.values(p.fonts).some(name => !Object.hasOwn(table,name))) nativeImages.warnings.push('Native font families are retained for local browser rendering. Unavailable fonts use fallbacks; compare font appearance and line breaks with the original.');
    if (Object.values(p.fonts).some(name => !Object.hasOwn(table,name) && !Engine.fontToken(name))) nativeImages.warnings.push('An invalid or overlong native font name was replaced with the serif fallback.');
    d.flow = false;
    const S = t.PageSetup;
    if (S) {
      let w = num(S['PaperSize.x'], 11000) / 1000, h = num(S['PaperSize.y'], 8500) / 1000;
      if (+S.PageOrientation === 2 && w < h) [w, h] = [h, w];
      d.paper = { name: 'Custom', w, h };
      d.margins = { left: num(S['PageMargin.left'], 500) / 1000, right: num(S['PageMargin.right'], 500) / 1000,
        top: num(S['PageMargin.top'], 0) / 1000, bottom: num(S['PageMargin.bottom'], 0) / 1000 };
      d.pecha.mode = on(S.PechaMode,true);
      d.pecha.perSheet = num(S.PechaPagesPerSheet, 1);
      d.pecha.placement = on(S.PechaPagesCentered, true) ? 'center' : 'top';
    }
    if (t.LineControl) {
      d.normal.lineHeight = num(t.LineControl.LineHeight,.38);
      d.normal.baseline = num(t.LineControl.BaseLnAdjTM,.3);
      d.tabWidth = num(t.LineControl.TabWidth, d.tabWidth);
      d.tibetanRaise = num(t.LineControl.TibFontAdj, d.tibetanRaise);
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
      d.pageNum.position = on(A.PageNumCenter, false) ? 'center' : 'bottom';
      d.pageNum.angle = num(A.PageNumAngle, 90) === 0 ? 0 : -90;
      if (A.PageNumFIndex !== undefined) {
        // Full documents keep font-table IDs. PXA writes the source ID unchanged
        // despite compacting its font table; standalone PXT has no font table.
        const index = /^\d+$/.test(A.PageNumFIndex) ? +A.PageNumFIndex : -1;
        const name = p.fonts[index];
        if (p.version.startsWith('.pxa') || !p.version) {
          nativeImages.warnings.push('The partial file’s page-number font reference is not portable. The current page-number font was kept; check it against the original.');
        } else if (!name || !Engine.fontToken(name)) {
          nativeImages.warnings.push('The native page-number font reference could not be resolved. The current page-number font was kept.');
        } else if (Object.hasOwn(table,name)) {
          d.pageNum.font = 'Jomolhari';
          nativeImages.warnings.push('The legacy page-number font uses the Unicode Jomolhari substitute. Check numeral appearance against the original.');
        } else d.pageNum.font = name;
      }
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
        baseline: s.BaseLineAdj === undefined ? null : num(s.BaseLineAdj, 0.25),
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
    d.dzog.rise = num(v.DzogThik_HexactF, .05);
    d.dzog.percentEnabled = on(v.DzogThik_HpercentEn, false);
    d.dzog.percent = num(v.DzogThik_Hpercent, 20);
    d.dzog.leftUp = num(v.DzogThik_VLAdjF, 0);
    d.dzog.rightUp = num(v.DzogThik_VRAdjF, 0);
    d.yigo.enabled = on(v['Yigo.en'], true);
    if (raw['Yigo.s'] !== undefined) {
      d.yigo.text = richText(raw['Yigo.s'], p.fonts, table, p.fontCharsets, Engine, true);
      d.yigo.rich = true;
    }
    d.yigo.fancyStart = on(v.YigoStartFancy, true);
    d.yigo.title2 = on(v.YigoStart2ndTitle, false);
    d.folio.start = num(v.FolioStartNum, 1);
    d.folio.onTitle = on(v.FolioNumTitleEn, false);
    d.folio.jyon = on(v.FolioNumJyonEn, false);
    d.folio.rhinoEnabled = on(v.FolioRhinoEn, false);
    d.folio.rhino = richText(raw.FolioRhinoStream, p.fonts, table, p.fontCharsets, Engine);
    d.folio.rhinoRich = true;
    d.pageNum.start = num(v.PageStartNum, 1);
    d.pageNum.on = d.pageNum.start > 0;
    d.pageNum.onTitle = on(v.PageNumTitleEn, false);
    d.pageNum.firstTitle = on(v.PageNumTitle1stEn, true);
    ['title.front', 'title.back', 'fancy.front', 'fancy.back', 'body.front', 'body.back'].forEach((key, i) => {
      const slot = (name, inset) => {
        const text = richText(raw[`${name}[${i}].s`], p.fonts, table, p.fontCharsets, Engine);
        return { rich: true, on: on(v[`${name}[${i}].en`], !!text) && !!text, text, size: num(v[`${name}[${i}].ptSz`], 14) * fontScale, inset: num(v[`${name}[${i}].insetF`], inset) };
      };
      const set = Engine.noteSet({ inL: slot('AnnoInL', 0.1), inR: slot('AnnoInR', 0.1), outL: slot('AnnoOutL', 0.1), outR: slot('AnnoOutR', 0.1) });
      if (i % 2 === 0) {
        const below = richText(raw[`AnnoInLL[${i / 2}].s`], p.fonts, table, p.fontCharsets, Engine);
        set.inB = { rich: true, on: !!below && set.inL.on, text: below, size: set.inL.size, inset: set.inL.inset };
      }
      d.notes.sets[key] = set;
    });
    return { doc: d, unknown: Object.keys(unknown).length, warnings: [...new Set(nativeImages.warnings)] };
  }

  // Native partial files have different scopes (guide section 3). A template must not erase text.
  function load(u8, extension, table, current, Engine) {
    const base = current ? JSON.parse(JSON.stringify(current)) : Engine.defaultDoc();
    const parsed = parse(u8, table);
    const result = toDoc(u8, table, JSON.parse(JSON.stringify(base)), Engine), imported = result.doc;
    if (extension === 'pxp') { imported.sections = []; imported.textSize = null; return result; }
    if (extension === 'pxt') {
      for (const key of ['paper', 'margins', 'pecha', 'normal', 'counts', 'types', 'tabWidth', 'tibetanRaise']) base[key] = imported[key];
      if (parsed.template.PechaAnnotation) {
        for (const key of ['size', 'inset']) base.folio[key] = imported.folio[key];
        for (const key of ['size', 'inset', 'position', 'angle']) base.pageNum[key] = imported.pageNum[key];
        base.notes.outLeft = imported.notes.outLeft; base.notes.outRight = imported.notes.outRight;
      }
    } else if (extension === 'pxc' || extension === 'pxa') {
      base.notes.sets = imported.notes.sets;
      for (const key of ['start', 'onTitle', 'jyon', 'rhino', 'rhinoEnabled', 'rhinoRich']) base.folio[key] = imported.folio[key];
      for (const key of ['start', 'on', 'onTitle', 'firstTitle']) base.pageNum[key] = imported.pageNum[key];
      if (parsed.template.PechaAnnotation) {
        for (const key of ['size', 'inset']) base.folio[key] = imported.folio[key];
        for (const key of ['size', 'inset', 'position', 'angle']) base.pageNum[key] = imported.pageNum[key];
        base.notes.outLeft = imported.notes.outLeft; base.notes.outRight = imported.notes.outRight;
        if (extension === 'pxc') base.pageNum.font = imported.pageNum.font;
      }
      if (extension === 'pxc') {
        // A content file supplies its own run sizes; the prior web override would mask them.
        if (base.textSize != null) result.warnings.push('The previous web text-size override was cleared so the Windows content file can use its stored font sizes.');
        base.text = imported.text; base.textSize = null; base.sections = []; base.flow = false; base.assets = imported.assets; base.images = imported.images;
        for (const key of ['yigo', 'shad', 'dzog']) base[key] = imported[key];
      }
    } else throw new Error('Unknown PechaMaker file type');
    return {doc: base, unknown: result.unknown, warnings: result.warnings};
  }

  // Standalone layouts omit document-local font IDs. Embedded layouts receive
  // a page-number font index registered in the enclosing document's full table.
  function writeTemplate(doc, Engine, measure, pageFontIndex = null) {
    const embedded = pageFontIndex !== null;
    const warnings = embedded ? [] : [
      'Experimental Windows template: opening and layout fidelity in PechaMaker still need verification.',
      'Only layout settings are exported. Text, images, annotation text, numbering starts, automatic marks, web styles and print options are not included.',
      'Font choices are not exported; Windows uses its own fonts. Keep a full web Save for an exact web document copy.'
    ];
    const integer = value => {
      if (!Number.isFinite(value)) throw new Error('A template setting is not a finite number.');
      return String(Math.round(value));
    };
    const decimal = value => {
      if (!Number.isFinite(value)) throw new Error('A template setting is not a finite number.');
      return value.toFixed(6);
    };
    const flag = value => value ? '1' : '0';
    const lines = embedded ? [] : ['; PechaMaker Template file.  Pecha layout control settings.', '; WARNING, whitespace is not forgiven.', ';', '', '[File Version 0.1]'];
    const section = (name, fields) => { lines.push('', '[' + name + ']'); for (const [key,value] of Object.entries(fields)) lines.push(key + '=' + value); };
    section('PageSetup', {
      PechaMode:flag(doc.pecha.mode !== false), 'PaperSize.x':integer(doc.paper.w*1000), 'PaperSize.y':integer(doc.paper.h*1000),
      PageOrientation:doc.paper.w > doc.paper.h ? '2' : '1',
      ...Object.fromEntries(['left','right','top','bottom'].map(side=>['PageMargin.'+side,integer(doc.margins[side]*1000)])),
      PechaPagesPerSheet:integer(doc.pecha.perSheet), PechaPagesCentered:flag(doc.pecha.placement !== 'top')
    });
    section('LineControl', {TibFontAdj:decimal(doc.tibetanRaise),TabWidth:decimal(doc.tabWidth),LineHeight:decimal(doc.normal.lineHeight),BaseLnAdjTM:decimal(doc.normal.baseline)});
    section('PechaControl', {PechaHeight:decimal(doc.pecha.height),PechaboxDLT:decimal(doc.pecha.dlt)});
    section('PechaAnnotation', {
      AnnoOutLeftSpace:decimal(doc.notes.outLeft),AnnoOutRightSpace:decimal(doc.notes.outRight),
      FolioNumInset:decimal(doc.folio.inset),FolioNumPtSz:integer(doc.folio.size/TIB_SCALE),
      ...(embedded ? {PageNumFIndex:integer(pageFontIndex)} : {}),
      PageNumInset:decimal(doc.pageNum.inset),PageNumPtSz:integer(doc.pageNum.size),
      PageNumCenter:flag(doc.pageNum.position === 'center'),PageNumAngle:doc.pageNum.angle === 0 ? '0' : '90'
    });
    if (doc.pageNum.angle !== 0 && doc.pageNum.angle !== -90) warnings.push('The page-number rotation is exported using the native 90-degree setting.');
    if (!Number.isInteger(doc.folio.size/TIB_SCALE) || !Number.isInteger(doc.pageNum.size)) warnings.push('Number sizes are rounded to whole native font points; Tibetan sizing uses the import conversion ratio.');
    for (const [i,kind] of ['title','fancy','body'].entries()) {
      const t = doc.types[kind]; let baseline = t.baseline;
      if (baseline == null) {
        if (!measure?.head) throw new Error('Font measurements are needed to export automatic first-line placement.');
        const head = measure.head(doc,doc.textSize || t.fontSize), box = Engine.boxes(doc,t).T;
        baseline = t.top == null ? ((box.y1-box.y0)-((t.lines-1)*t.lineHeight*72+head.height))/144+head.ascent/72 : t.top+head.ascent/72;
        // Native templates store a fixed baseline, while web titles can center a shorter block.
        warnings.push('Automatic first-line placement is converted to a fixed baseline for the configured line count. Short title pages may move.');
      }
      if (baseline < 0) {baseline = 0;warnings.push('An overflowing text block needed a zero first-line baseline; check the Windows layout.');}
      if (!/^#[0-9a-f]{6}$/i.test(t.color)) throw new Error('A frame color is not a six-digit color.');
      const color = '0x'+t.color.slice(1).match(/../g).reverse().join('').toUpperCase();
      section('Type_'+i, {
        PageType:kind[0].toUpperCase()+kind.slice(1),EndPage:integer(i===0?doc.counts.title:i===1?doc.counts.title+doc.counts.fancy:65535),
        LinesPerPage:integer(t.lines),LineHeight:decimal(t.lineHeight),BaseLineAdj:decimal(baseline),MarginSide:decimal(t.side),
        BoxLinestyle:integer(['none','single','double'].indexOf(t.style)),BoxColor:color,
        SideBoxIn:decimal(t.sideIn),SideBoxOut:decimal(t.sideOut),InBoxEn:flag(t.insideOn),InBox:decimal(t.inside),
        OutBoxEn:flag(t.squeezeOn),OutBox:decimal(t.squeeze)
      });
    }
    const newline=embedded?'\n':'\r\n';
    return {text:lines.join(newline)+newline,warnings:[...new Set(warnings)]};
  }

  // Native image-header 1.1 stores PNG payloads, indexed line placements and
  // a CRC32 over each complete PNG. Windows reloads DPI from PNG pHYs.
  function nativeImages(doc, warnings, full, pageLimit = Infinity) {
    if(doc.images.some(p=>!['inline','yigo','page'].includes(p.kind)))throw new Error('An image placement has an unsupported kind.');
    const assets=[], lines=[], pages=[], used=new Set(), variants=new Map();let total=0;
    const crcTable=Uint32Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=(n>>>1)^((n&1)?0xedb88320:0);return n>>>0;});
    const crc=bytes=>{let value=0xffffffff;for(const b of bytes)value=(value>>>8)^crcTable[(value^b)&255];return (value^0xffffffff)>>>0;};
    const join=chunks=>{const out=new Uint8Array(chunks.reduce((n,c)=>n+c.length,0));let at=0;for(const c of chunks){out.set(c,at);at+=c.length;}return out;};
    const integer=(v,min,max,name)=>{if(!Number.isFinite(v)||v<min||v>max)throw new Error('Invalid image '+name+'.');const n=Math.round(v);if(n!==v)warnings.add('Image DPI and scale are rounded to whole native values. Check image sizes in Windows.');return n;};
    const decimal=(v,min,max)=>{if(!Number.isFinite(v)||v<min||v>max)throw new Error('Invalid image spacing or baseline adjustment.');return v.toFixed(6);};
    const prepare=(asset,x,y)=>{
      if(typeof asset.data!=='string'||asset.data.length>12000000||!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(asset.data))throw new Error('An image asset is not a supported embedded PNG.');
      let bytes;try{bytes=Uint8Array.from(atob(asset.data.slice(22)),c=>c.charCodeAt(0));}catch{throw new Error('An image PNG has invalid base64 data.');}
      if(bytes.length>8000000||bytes.length<45||LAT(bytes,0,8)!=='\x89PNG\r\n\x1a\n')throw new Error('An image PNG is invalid or exceeds the 8 MB limit.');
      const view=new DataView(bytes.buffer), chunks=[];let at=8,ended=false,data=false,width=0,height=0;
      while(at+12<=bytes.length){
        const length=view.getUint32(at),end=at+12+length;if(end>bytes.length)throw new Error('An image PNG has an incomplete chunk.');
        const name=LAT(bytes,at+4,at+8);
        if(crc(bytes.subarray(at+4,end-4))!==view.getUint32(end-4))throw new Error('An image PNG has an invalid chunk checksum.');
        if(at===8){if(name!=='IHDR'||length!==13)throw new Error('An image PNG has no valid header.');width=view.getUint32(at+8);height=view.getUint32(at+12);}
        else if(name==='IHDR')throw new Error('An image PNG has duplicate headers.');
        if(name==='IDAT')data=true;
        if(name!=='pHYs')chunks.push(bytes.subarray(at,end));
        at=end;if(name==='IEND'){if(length!==0)throw new Error('An image PNG has an invalid end chunk.');ended=true;break;}
      }
      if(!ended||!data||at!==bytes.length||!width||!height||width*height>16000000||width!==asset.width||height!==asset.height)throw new Error('An image PNG is incomplete, oversized or has inconsistent dimensions.');
      const density=PechaImages.pngDensity(bytes);
      if(density?.unit!==1 || Math.trunc(density.x*.0254)!==x || Math.trunc(density.y*.0254)!==y){
        // Ceiling makes the native truncation recover the requested whole DPI.
        const phys=new Uint8Array(21),v=new DataView(phys.buffer);v.setUint32(0,9);phys.set([112,72,89,115],4);
        v.setUint32(8,Math.ceil(x/.0254));v.setUint32(12,Math.ceil(y/.0254));phys[16]=1;v.setUint32(17,crc(phys.subarray(4,17)));
        bytes=join([bytes.subarray(0,8),chunks[0],phys,...chunks.slice(1)]);
        if(bytes.length>8000000)throw new Error('An image PNG exceeds the 8 MB export limit after adding resolution metadata.');
        warnings.add('Exported PNG resolution metadata is adjusted to match the image settings; pixels and the editable web document are unchanged.');
      }
      return {bytes,width,height,crc:crc(bytes)|0};
    };
    const add=(id,kind)=>{
      const p=doc.images.find(p=>p.id===id&&p.kind===kind),asset=p&&doc.assets.find(a=>a.id===p.asset);
      if(!p||!asset)throw new Error('The document contains an unsupported image reference.');
      if(lines.length+pages.length>=1000)throw new Error('Native export supports at most 1000 image occurrences.');
      const x=integer(p.dpi,10,2400,'horizontal DPI'),y=integer(p.dpiY??p.dpi,10,2400,'vertical DPI'),scale=integer(p.scale,kind==='page'?20:10,200,'scale');
      let fields;
      if(kind==='page'){
        const slot={'outer-left':0,'inner-left':1,'text-left':2,'text-right':4,'inner-right':5,'outer-right':6}[p.anchor];
        if(!Number.isInteger(slot)||!Number.isInteger(p.page)||p.page<1||p.page>3000)throw new Error('Invalid native page-image anchor or page number.');
        const offset=v=>{decimal(v,-30,30);if(v<.01)warnings.add('Page-image offsets below 0.01 inch are exported as 0.01 inch to match Windows reopening.');return Math.max(.01,v).toFixed(6);};
        fields={yAdj_float:offset(p.down),xAdj_float:offset(p.inward),xMar_float:decimal(p.margin,0,20),pageNbr:p.page,slot};
      }else fields={sideSp_float:decimal(p.space,0,20),yAdj_float:decimal(p.above,-30,30),addTFA:p.addTibetan?1:0};
      let byDensity=variants.get(asset.data);if(!byDensity){byDensity=new Map();variants.set(asset.data,byDensity);}
      const key=x+','+y;let index=byDensity.get(key);
      if(index===undefined){
        if(assets.length>=200)throw new Error('Native export supports at most 200 image assets and resolution variants.');
        const encoded=prepare(asset,x,y);if(total+encoded.bytes.length>20000000)throw new Error('Native image payload exceeds the 20 MB export limit.');
        index=assets.length;assets.push({...encoded,x,y,offset:total,usage:0});total+=encoded.bytes.length;byDensity.set(key,index);
      }
      const source=assets[index];
      if(source.width!==asset.width||source.height!==asset.height)throw new Error('An image PNG has inconsistent dimensions.');
      source.usage++;used.add(id);
      // Serialized drawing caches use the web reference of 96 display units/inch.
      // Native display-dependent cache rounding remains experimental.
      const draw=n=>Math.floor((n*scale+50)/100);
      const width=p.ignoreDpi?source.width:Math.round(source.width*96/x),height=p.ignoreDpi?source.height:Math.round(source.height*96/y);
      const records=kind==='page'?pages:lines;
      records.push({iInfoIndex:index,ignoreImgDPI:p.ignoreDpi?1:0,scale,drawWidth:draw(width),drawHeight:draw(height),...fields});
      return records.length-1;
    };
    const finish=()=>{
      let omitted=0;
      for(const p of doc.images.filter(p=>p.kind==='page')){
        if(!Number.isInteger(p.page)||p.page<1||p.page>3000)throw new Error('Invalid native page-image anchor or page number.');
        if(!full&&p.page>pageLimit){omitted++;continue;}
        add(p.id,'page');
      }
      if(pages.length)warnings.add(full
        ? 'Page images keep their one-based document page assignments, including pages beyond the current text. Native pagination may place them differently.'
        : 'Page images keep their one-based document page assignments within the current web page count. The receiving layout and Windows pagination may place them differently.');
      if(omitted)warnings.add(`${omitted} page-image placement(s) beyond the current ${pageLimit} web page(s) are omitted from this content file. The editable document is unchanged; a full Windows file (.pxp) retains future-page assignments.`);
      if(doc.images.some(p=>p.kind!=='page'&&!used.has(p.id)))warnings.add('Unused inline and yi-go placements are omitted from the Windows file.');
      if(!lines.length&&!pages.length)return null;
      warnings.add('Native image export is experimental. Drawing caches use a 96-DPI reference; Windows display rounding, image positioning and physical printing still need verification.');
      const text=['','[START IMAGES] 1.1','ImageInfoCount='+assets.length];
      const record=(kind,index,fields)=>{for(const [k,v] of Object.entries(fields))text.push(k+'='+v);text.push('[END '+kind+' '+index+']');};
      assets.forEach((a,i)=>record('IINFO',i,{imageOffset:a.offset,usageCount:a.usage,compSize:a.bytes.length,crc:a.crc,dibWidth:a.width,dibHeight:a.height,dibXDPI:a.x,dibYDPI:a.y}));
      text.push('LineImageInfoCount='+lines.length);lines.forEach((p,i)=>record('LIINFO',i,p));
      text.push('PageImageInfoCount='+pages.length);pages.forEach((p,i)=>record('PIINFO',i,p));
      text.push('','Images_totalBytes='+total,'');
      return join([new TextEncoder().encode(text.join('\n')),...assets.map(a=>a.bytes)]);
    };
    return {add,finish};
  }

  // Independent writers share native text/font encoding while keeping each file's scope.
  function writeNative(doc, Engine, table, mode = 'pxa', measure = null) {
    const content=mode!=='pxa', full=mode==='pxp';
    const warnings = new Set(full ? [
      'Experimental Windows document: opening and appearance in PechaMaker still need verification. Keep a full web Save.',
      'Text, automatic marks and native layout settings are exported. Web print options, style definitions, volume metadata and exact font metrics are not preserved.',
      'Implicit page-type sizes use the body size; explicit text sizes and roles are materialized. Check title/fancy pages, Tibetan metrics and line breaks in Windows.',
      'Tibetan folio-number font selection is not exported; Windows keeps its own choice. The Arabic page-number font is included in the full font table.'
    ] : content ? [
      'Experimental Windows content: opening and appearance in PechaMaker still need verification. Keep a full web Save.',
      'Body text and automatic marks are exported. Page layout, numbering sizes/fonts, outside-note spacing and volume metadata are not included; the receiving document keeps its layout.',
      'Implicit page-type sizes use the body size; explicit text sizes and roles are materialized. Check title/fancy pages, Tibetan metrics and line breaks in Windows.'
    ] : [
      'Experimental Windows annotations: opening and appearance in PechaMaker still need verification. Keep a full web Save.',
      'Only static annotations, fixed folio text and numbering settings are exported. Body text, page layout, images, yi-go and volume section labels are not included.',
      'Numbering font choices are not portable and are omitted; Windows keeps its own choices. Check them after opening.'
    ]);
    let pageLimit=Infinity;
    if(content&&!full&&doc.images.some(p=>p.kind==='page')){
      if(typeof measure!=='function')throw new Error('Font measurements are needed to export content page images.');
      pageLimit=Engine.run(doc,measure).pages.length;
      if(!Number.isInteger(pageLimit)||pageLimit<0)throw new Error('The current page count could not be determined.');
    }
    const images=content?nativeImages(doc,warnings,full,pageLimit):null;
    const fonts = [{name:'Times New Roman',charset:0}], tib = new Map(); let usesTcc = false;
    const encodings = nativeEncodings();
    const cp=encodings[0].map;
    for (let id=0;id<5;id++) for (const [byte,text] of Object.entries(table[id ? 'TibetanMachineSkt'+id : 'TibetanMachine'] || {})) {
      // PDF mapping keys can be Unicode aliases (e.g. U+20AC), not byte slots.
      // Never let Uint8Array silently truncate such keys into another glyph.
      if (!Number.isInteger(+byte) || +byte < 32 || +byte > 255 || !text || !/[\u0f00-\u0fff]/.test(text)) continue;
      const list = tib.get(text[0]) || []; list.push({text,id,byte:+byte}); tib.set(text[0],list);
    }
    for (const list of tib.values()) list.sort((a,b)=>b.text.length-a.text.length || a.id-b.id || a.byte-b.byte);
    const ansi = text => {
      const bytes = [];
      for (const c of text) { if (!cp.has(c)) throw new Error('A font name cannot be represented in Windows-1252.'); bytes.push(cp.get(c)); }
      return bytes;
    };
    const fontId = (name,charset=0) => {
      if (['Jomolhari','Noto Serif Tibetan'].includes(name) || Object.hasOwn(table,name)) {
        name = 'Times New Roman'; warnings.add('Tibetan text uses native TCC font slots; select a compatible TCC family in Windows. Latin text in a Tibetan web font uses Times New Roman. Exact glyph shapes are unverified.');
      }
      const nameBytes=ansi(name);
      if (!Engine.fontToken(name) || nameBytes.length > 31) throw new Error('A font name exceeds the native 31-byte font-name limit.');
      if (nameBytes.some((b,i)=>b!==name.charCodeAt(i))) throw new Error('A font name uses characters not yet supported by native export. Choose another font.');
      let index=fonts.findIndex(f=>f.name===name&&f.charset===charset);
      if(index<0){index=fonts.length;fonts.push({name,charset});}
      if (fonts.length > 250) throw new Error('Too many fonts for a native file.');
      return index+5;
    };
    const stream = (slot,label,context=doc,body=false) => {
      const bytes = [], state = new Map();
      const command = (op,a,b=127,c=127) => {const key=[a,b,c].join(',');if(state.get(op)!==key){bytes.push(17,op,a,b,c,17);state.set(op,key);}};
      const runs = slot.rich ? Engine.parseStream(slot.text,false) : [{k:'text',s:slot.text,style:{}}];
      for (const run of runs) {
        if (run.k === 'image') {if(body){const index=images.add(run.id,'inline');bytes.push(19,127,127,index&255,index>>>8,19);}continue;}
        if (run.k === 'page') {if(body)bytes.push(12);continue;}
        const text = body ? run.s.replace(/\r\n?|\u2028/g,'\n') : run.s.replace(/[\r\n\u2028\t]/g,' '), f = Engine.fontFor(context,run,slot.size), name = Engine.primaryFont(f.family);
        if (!text) continue;
        const latin = fontId(name), fontIds=new Map([[0,latin]]), characters=[...new Set(text)];
        let encoding=encodings.find(e=>characters.every(c=>e.map.has(c)||/[\u0f00-\u0fff\uE00D\n\t]/.test(c)))||encodings[0];
        const color = (run.style.color || '#14100e').slice(1);
        const rgb = (color.length===3 ? [...color].map(c=>c+c).join('') : color).match(/../g)?.map(c=>parseInt(c,16));
        if (rgb?.length!==3 || rgb.some(n=>!Number.isFinite(n))) throw new Error(label+': invalid text color.');
        if(body)command({l:0x32,r:0x33,c:0x34,j:0x35}[run.style.align] || 0x35,127);
        command(0x22,...rgb);command(0x23,f.weight>400?1:0);command(0x24,f.italic?1:0);command(0x25,f.underline?1:0);command(0x26,f.strike?1:0);
        for(let at=0;at<text.length;){
          const c=String.fromCodePoint(text.codePointAt(at));let id=latin,byte;
          const match=(tib.get(text[at]) || []).find(m=>text.startsWith(m.text,at));
          if(body && (c==='\n' || c==='\t')){bytes.push(c==='\n'?10:9);at++;continue;}
          if(c==='\uE00D'){id=0;byte=11;at++;}
          else if(match){id=match.id;byte=match.byte;at+=match.text.length;}
          else {
            const selected=encoding.map.has(c)?encoding:encodings.find(e=>e.map.has(c));
            if(!selected)throw new Error(label+': cannot encode U+'+c.codePointAt(0).toString(16).toUpperCase()+' in the supported native fonts.');
            encoding=selected;byte=encoding.map.get(c);id=fontIds.get(encoding.charset);
            if(id===undefined){id=fontId(name,encoding.charset);fontIds.set(encoding.charset,id);}
            at+=c.length;
            if(encoding.charset)warnings.add('Text outside Windows-1252 uses additional Windows font charsets. Verify font availability, shaping and mixed-script appearance in Windows.');
            if(multibyteLabels[encoding.charset])warnings.add('East Asian text uses multibyte Windows font charsets. Native opening, font substitution and line breaking still need verification.');
            if(c===' ' && state.has(0x20))id=+state.get(0x20).split(',')[0];
          }
          if(id<5){usesTcc=true;warnings.add('Tibetan text is converted to legacy TCC glyphs. Windows must have compatible TCC fonts; verify stacks and appearance against the original.');}
          command(0x20,id);
          if(body){
            const nativeSize=Math.round(f.size/(id<5?TIB_SCALE:1));
            if(nativeSize<1 || nativeSize>255)throw new Error(label+': a text size is outside the native 1–255 point range.');
            if(nativeSize!==f.size/(id<5?TIB_SCALE:1))warnings.add('Body text sizes are rounded to whole native points; Tibetan sizes use the import conversion ratio.');
            command(0x21,127,nativeSize,0);
          }
          if(Array.isArray(byte))bytes.push(...byte);else bytes.push(byte);
        }
      }
      if(body && bytes.length>8000000)throw new Error('Encoded body text exceeds the 8 MB export limit.');
      if(!body && bytes.length>256)throw new Error(label+': encoded text exceeds the native 256-byte limit, including formatting. Shorten it or reduce font/style changes.');
      return Uint8Array.from(bytes);
    };
    const yigoImage=content&&doc.yigo.image?images.add(doc.yigo.image,'yigo'):-1;
    const body=content?stream({text:doc.sections.length?doc.sections.map(s=>s.text).join('{page}'):doc.text,rich:true,size:doc.types.body.fontSize},'Body',doc,true):null;
    if(content && !body.length)throw new Error('Add body text before exporting Windows content.');
    if(content && doc.flow)warnings.add('Web flow-mode paragraph rewrapping is not stored; exported line breaks become native hard returns.');
    if(content && doc.sections.length)warnings.add('Volume sections become a single text stream with page breaks. Section labels, starts and front-page metadata are not preserved.');
    const chunks=[],text=s=>chunks.push(new TextEncoder().encode(s)),flag=v=>v?1:0,prefix=content?'iNiT ':'';
    const number=(v,integer=false)=>{if(!Number.isFinite(v))throw new Error('An annotation setting is not a finite number.');return integer?Math.round(v):v.toFixed(6);};
    const size=v=>{if(!Number.isInteger(v/TIB_SCALE))warnings.add('Annotation and Tibetan number sizes are rounded to whole native points using the import conversion ratio.');return number(v/TIB_SCALE,true);};
    const value=(k,v)=>text(prefix+k+'='+v+'\n');
    const raw=(key,bytes,lengthKey=key+'.slen',streamKey=key+'.s')=>{value(lengthKey,bytes.length);text(prefix+streamKey+'=\n');chunks.push(bytes);text('\n');};
    text('[START NON-BODY]\n');
    if(content){
      for(const [k,v] of Object.entries({AutoShadEn:flag(doc.shad.enabled),YangShadEn:flag(doc.shad.yang),IgnoreYigoShadEn:flag(doc.shad.ignoreYigo),TitleShadEn:flag(doc.shad.titlePages),DzogThikEn:flag(doc.dzog.enabled),DzogThik_HexactF:number(doc.dzog.rise),DzogThik_HpercentEn:flag(doc.dzog.percentEnabled),DzogThik_Hpercent:number(doc.dzog.percent,true),DzogThik_VLAdjF:number(doc.dzog.leftUp),DzogThik_VRAdjF:number(doc.dzog.rightUp),'Yigo.en':flag(doc.yigo.enabled),YigoStartFancy:flag(doc.yigo.fancyStart),YigoStart2ndTitle:flag(doc.yigo.title2),YigoImageEn:yigoImage>=0?1:0,YigoLineImageIndex:yigoImage}))value(k,v);
      raw('Yigo',stream({text:doc.yigo.text,rich:doc.yigo.rich,size:18},'Yi-go'));
    }
    const folioDoc=doc.folio.font?{...doc,font:JSON.stringify(doc.folio.font)}:doc;
    raw('FolioRhino',stream({text:doc.folio.rhino,rich:doc.folio.rhinoRich,size:doc.folio.size},'Fixed folio phrase',folioDoc),'FolioRhinoLen','FolioRhinoStream');
    for(const [k,v] of Object.entries({FolioRhinoEn:flag(doc.folio.rhinoEnabled),FolioStartNum:number(doc.folio.start,true),FolioNumTitleEn:flag(doc.folio.onTitle),FolioNumJyonEn:flag(doc.folio.jyon),PageStartNum:doc.pageNum.on?number(doc.pageNum.start,true):0,PageNumTitleEn:flag(doc.pageNum.onTitle),PageNumTitle1stEn:flag(doc.pageNum.firstTitle)}))value(k,v);
    const sides=['title.front','title.back','fancy.front','fancy.back','body.front','body.back'];
    const label=side=>side[0].toUpperCase()+side.slice(1).replace('.',' ');
    for(let i=0;i<3;i++){
      const set=doc.notes.sets[sides[i*2]],slot=set.inB;
      raw('AnnoInLL['+i+']',stream(slot,label(sides[i*2])+' lower-left note'));
      if(slot.text && (slot.size!==set.inL.size || slot.inset!==set.inL.inset || slot.on!==set.inL.on))warnings.add('Front lower-left notes share the upper-left note’s size, inset and enable setting in Windows. Independent web settings are not preserved.');
    }
    for(const [i,side] of sides.entries()){
      const set=doc.notes.sets[side];
      if(i%2 && set.inB.text)warnings.add('Lower-left notes on backs have no native annotation slot and are omitted.');
      for(const [position,native] of [['inL','AnnoInL'],['inR','AnnoInR'],['outL','AnnoOutL'],['outR','AnnoOutR']]){
        const slot=set[position],key=native+'['+i+']',location={inL:'inside left',inR:'inside right',outL:'outside left',outR:'outside right'}[position];value(key+'.ptSz',size(slot.size));value(key+'.insetF',number(slot.inset));value(key+'.en',flag(slot.on));raw(key,stream(slot,label(side)+' '+location+' note'));
      }
    }
    text('[END NON-BODY]\n');
    if(full){
      const name=Engine.primaryFont(Engine.fontFamily(Engine.fontToken(doc.pageNum.font)) || doc.font);
      const layout=writeTemplate(doc,Engine,measure,fontId(name));
      text('[START TEMPLATE]\n'+layout.text+'[END TEMPLATE]\n');
      for(const warning of layout.warnings)warnings.add(warning);
      if(doc.folio.angle!==-90)warnings.add('Tibetan folio numbers use the native rotation convention; the web rotation is not preserved.');
    }
    if(!content){
      text('[START TEMPLATE]\n\n[PechaAnnotation]\n');
      for(const [k,v] of Object.entries({AnnoOutLeftSpace:number(doc.notes.outLeft),AnnoOutRightSpace:number(doc.notes.outRight),FolioNumInset:number(doc.folio.inset),FolioNumPtSz:size(doc.folio.size),PageNumInset:number(doc.pageNum.inset),PageNumPtSz:number(doc.pageNum.size,true),PageNumCenter:flag(doc.pageNum.position==='center'),PageNumAngle:doc.pageNum.angle===0?0:90}))value(k,v);
      text('[END TEMPLATE]\n');
      if(doc.folio.angle!==-90 || ![0,-90].includes(doc.pageNum.angle))warnings.add('Number rotations use the native conventions; additional web rotation choices are not preserved.');
      if(!Number.isInteger(doc.pageNum.size))warnings.add('Arabic number size is rounded to whole native points.');
    }
    if(!doc.pageNum.on && doc.pageNum.start)warnings.add('Disabled Arabic numbering is stored as a zero start; its saved nonzero start is not preserved.');
    const nativeFonts=content?[...['TibetanMachine','TibetanMachineSkt1','TibetanMachineSkt2','TibetanMachineSkt3','TibetanMachineSkt4'].map(name=>({name,charset:0})),...fonts]:fonts;
    // Native checksum stores float32 after each addition and uses a signed int32
    // byte/weight product. The five bundled PXP headers corroborate this sequence.
    let checksum=0,weight=100;
    if(content)for(const byte of body){checksum=Math.fround(checksum+weight);checksum=Math.fround(checksum+byte);checksum=Math.fround(checksum+Math.imul(byte,++weight));weight++;}
    const heading=content?'.'+mode+' 0.6 0 u1 u2 u3 u4 '+body.length+' '+checksum.toFixed(0)+' '+nativeFonts.length+' ':'.pxa 0.1 u1 u2 u3 u4 '+flag(usesTcc)+' '+fonts.length+' ';
    const header=[...new TextEncoder().encode(heading)];
    nativeFonts.forEach((font,i)=>header.push(...new TextEncoder().encode(i+' '+font.charset+' '),...ansi(font.name),0));header.push(10);
    if(content){chunks.push(body);const block=images.finish();if(block)chunks.push(block);}
    chunks.unshift(Uint8Array.from(header));const bytes=new Uint8Array(chunks.reduce((n,c)=>n+c.length,0));let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
    return {bytes,warnings:[...warnings]};
  }

  const writeAnnotations=(doc,Engine,table)=>writeNative(doc,Engine,table);
  const writeContent=(doc,Engine,table,measure)=>writeNative(doc,Engine,table,'pxc',measure);
  const writeDocument=(doc,Engine,table,measure)=>writeNative(doc,Engine,table,'pxp',measure);
  return { parse, readImages, decodeStream, eventsToText, toDoc, load, writeTemplate, writeAnnotations, writeContent, writeDocument };
})();
if (typeof module !== 'undefined') module.exports = Pxp;
