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
    const fonts = {};
    const annotationHeader = /^\.pxa 0\.1 u1 u2 u3 u4 (\d+) (\d+) /.exec(head);
    const list = annotationHeader ? head.slice(annotationHeader[0].length) : head.replace(/^.*?u4 \d+ \d+ \d+ /s, '');
    const re = /(\d+) \d+ ([^\0]+)\0/g;
    let m;
    while ((m = re.exec(list))) fonts[+m[1] + (annotationHeader ? 5 : 0)] = m[2];
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
      const m = /^(?:iNiT )?([^=]+)=(.*)$/.exec(line.replace(/\r$/, ''));
      if (!m) continue;
      const [, k, v] = m;
      if (/(\.s|Stream)$/.test(k)) {
        if (!Number.isInteger(lastLen) || lastLen < 0 || lastLen > end - i) throw new Error('Invalid native text-stream length');
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
      } else if (c === 0x13 && i + 5 < bytes.length) {
        flush(); ev.push({t:'image',index:bytes[i+3]+256*bytes[i+4]}); i+=5;
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
    // Standalone template files use the INI layout without the document's font/body wrapper.
    // The original executable exposes this template heading and File Version section.
    if (sNB < 0 && sT < 0 && indexOf(b, '[PageSetup]') >= 0 && indexOf(b, '[PechaControl]') >= 0) {
      return {version: '', fonts: {}, nonBody: {values: {}, raw: {}}, template: parseIni(LAT(b, 0, b.length)), body: b.subarray(b.length)};
    }
    if (!/^\.px[pcta]$/.test(LAT(b, 0, 4)) && sNB < 0) throw new Error('Not a PechaMaker file');
    const fonts = parseFonts(LAT(b, 0, sNB < 0 ? 200 : sNB));
    const nb = sNB >= 0 ? parseNonBody(b, sNB + 17, eNB) : { values: {}, raw: {} };
    const tpl = sT >= 0 ? parseIni(LAT(b, sT + 16, eT)) : {};
    let bodyStart = eT >= 0 ? eT + 15 : (eNB >= 0 ? eNB + 15 : 0);
    const imageStart = indexOf(b, '\n[START IMAGES] ', bodyStart);
    const hasImageBlock = imageStart >= 0 && /^\n\[START IMAGES\] [^\r\n]+\r?\n(?:ImageInfoCount|ImageInfo_SizeOf)=\d+/.test(LAT(b,imageStart,Math.min(b.length,imageStart+160)));
    return { version: LAT(b, 0, 12), fonts, nonBody: nb, template: tpl,
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
    const assetIds=new Map();
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
    });
    groups.LIINFO.forEach((info,index)=>{
      if(!info||!assetIds.has(info.iInfoIndex))return;
      const source=groups.IINFO[info.iInfoIndex];
      if(source.dibXDPI!==source.dibYDPI)warnings.push('Unequal native horizontal/vertical image DPI is not reproduced.');
      images.push(PechaImages.placement({id:'native-inline-'+index,asset:assetIds.get(info.iInfoIndex),
        dpi:source.dibXDPI>0?source.dibXDPI:96,ignoreDpi:!!info.ignoreImgDPI,scale:info.scale||100,
        above:info.yAdj_float||0,space:info.sideSp_float||0,addTibetan:!!info.addTFA}));
    });
    const nativeAnchors={0:'outer-left',1:'inner-left',2:'text-left',4:'text-right',5:'inner-right',6:'outer-right'};
    groups.PIINFO.forEach((info,index)=>{
      if(!info || !assetIds.has(info.iInfoIndex))return;
      if(!nativeAnchors[info.slot] || !Number.isInteger(info.pageNbr) || info.pageNbr<1 || info.pageNbr>3000) {
        warnings.push('A native page-image anchor or page number is unsupported and was skipped.');return;
      }
      const source=groups.IINFO[info.iInfoIndex];
      if(source.dibXDPI!==source.dibYDPI)warnings.push('Unequal native horizontal/vertical image DPI is not reproduced.');
      images.push(PechaImages.placement({id:'native-page-'+index,asset:assetIds.get(info.iInfoIndex),kind:'page',
        page:info.pageNbr,anchor:nativeAnchors[info.slot],dpi:source.dibXDPI>0?source.dibXDPI:96,
        ignoreDpi:!!info.ignoreImgDPI,scale:info.scale||100,down:info.yAdj_float||0,
        inward:info.xAdj_float||0,margin:info.xMar_float||0}));
    });
    return {assets,images,warnings:[...new Set(warnings)]};
  }

  const ALIGN = { 0x32: 'l', 0x33: 'r', 0x34: 'c', 0x35: 'j' };
  const TIB_SCALE = 0.75;   // TibetanMachine is drawn smaller on its em than Jomolhari

  // Events to the {code} text the engine reads. Colours and sizes carry over as the file has them.
  function eventsToText(ev, isTibetanFont, fontMarks = false) {
    let out = fontMarks ? (isTibetanFont(0) ? '{font:jomolhari}' : '{font:serif}') : '', written = null, raw = null, font = 0;
    for (const e of ev) {
      if (e.t === 'text') {
        const v = raw === null ? null : Math.round(raw * (isTibetanFont(font) ? TIB_SCALE : 1));
        if (v && v !== written) { out += `{${v}}`; written = v; }
        out += e.s.replace(/[{}]/g, c => c === '{' ? '{lc}' : '{rc}');
      }
      else if (e.t === 'image') out += `{image:native-inline-${e.index}}`;
      else if (e.t === 'hr') out += '\n';
      else if (e.t === 'page') out += '{page}';
      else if (e.op === 0x20) { font = e.a; if (fontMarks) out += isTibetanFont(font) ? '{font:jomolhari}' : '{font:serif}'; }
      else if (e.op === 0x21) raw = e.b;
      else if (e.op === 0x22) {
        const hex = [e.a, e.b, e.d].map(c => c.toString(16).padStart(2, '0')).join('');
        out += hex === '000000' ? '{color}' : `{#${hex}}`;
      }
      else if (e.op === 0x23) out += e.a ? '{b}' : '{/b}';
      else if (e.op === 0x24) out += e.a ? '{i}' : '{/i}';
      else if (e.op === 0x25) out += e.a ? '{u}' : '{/u}';
      else if (ALIGN[e.op]) out += `{${ALIGN[e.op]}}`;
      else if (e.op === 0x48) out += '\t';
    }
    return out;
  }

  function plainText(bytes, fonts, table) {
    if (!bytes || !bytes.length) return '';
    return decodeStream(bytes, fonts, table).ev.filter(e => e.t === 'text').map(e => e.s).join('').trim();
  }

  function richText(bytes, fonts, table) {
    if (!bytes || !bytes.length) return '';
    return eventsToText(decodeStream(bytes, fonts, table).ev, id => !!table[fonts[id]], true).replace(/[\r\n]/g, ' ');
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
    if (p.version.startsWith('.pxa 0.1')) {
      nativeImages.warnings.push('Native annotation-file import is experimental; exact legacy rendering still needs original-app verification.');
      const head=LAT(u8 instanceof Uint8Array ? u8 : new Uint8Array(u8),0,100);
      if (/^\.pxa 0\.1 u1 u2 u3 u4 [1-9]/.test(head)) nativeImages.warnings.push('Implicit TCC font references are not yet resolved. Check all Tibetan annotations against the original.');
    }
    d.assets=nativeImages.assets; d.images=nativeImages.images; d.yigo.image='';
    if(on(v.YigoImageEn,false)) {
      const source=d.images.find(im=>im.id==='native-inline-'+num(v.YigoLineImageIndex,-1));
      if(source){const yi={...source,id:'native-yigo',kind:'yigo'};d.images.push(yi);d.yigo.image=yi.id;}
    }
    const { ev, unknown } = decodeStream(p.body, p.fonts, table);
    if(ev.some(e=>e.t==='image'&&!d.images.some(p=>p.id==='native-inline-'+e.index))) nativeImages.warnings.push('Some inline image references could not be recovered.');
    d.text = eventsToText(ev, id => !!table[p.fonts[id]]).replace(/\s+$/, '');
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
    const yig = plainText(raw['Yigo.s'], p.fonts, table);
    if (yig) d.yigo.text = yig;
    d.yigo.fancyStart = on(v.YigoStartFancy, true);
    d.yigo.title2 = on(v.YigoStart2ndTitle, false);
    d.folio.start = num(v.FolioStartNum, 1);
    d.folio.onTitle = on(v.FolioNumTitleEn, false);
    d.folio.jyon = on(v.FolioNumJyonEn, false);
    d.folio.rhino = on(v.FolioRhinoEn, false) ? plainText(raw.FolioRhinoStream, p.fonts, table) : '';
    d.pageNum.start = num(v.PageStartNum, 1);
    d.pageNum.on = d.pageNum.start > 0;
    d.pageNum.onTitle = on(v.PageNumTitleEn, false);
    d.pageNum.firstTitle = on(v.PageNumTitle1stEn, true);
    ['title.front', 'title.back', 'fancy.front', 'fancy.back', 'body.front', 'body.back'].forEach((key, i) => {
      const slot = (name, inset) => {
        const text = richText(raw[`${name}[${i}].s`], p.fonts, table);
        return { rich: true, on: on(v[`${name}[${i}].en`], !!text) && !!text, text, size: num(v[`${name}[${i}].ptSz`], 14) * fontScale, inset: num(v[`${name}[${i}].insetF`], inset) };
      };
      const set = Engine.noteSet({ inL: slot('AnnoInL', 0.1), inR: slot('AnnoInR', 0.1), outL: slot('AnnoOutL', 0.1), outR: slot('AnnoOutR', 0.1) });
      if (i % 2 === 0) {
        const below = richText(raw[`AnnoInLL[${i / 2}].s`], p.fonts, table);
        set.inB = { rich: true, on: !!below && set.inL.on, text: below, size: set.inL.size, inset: set.inL.inset };
      }
      d.notes.sets[key] = set;
    });
    return { doc: d, unknown: Object.keys(unknown).length, warnings: nativeImages.warnings };
  }

  // Native partial files have different scopes (guide section 3). A template must not erase text.
  function load(u8, extension, table, current, Engine) {
    const base = current ? JSON.parse(JSON.stringify(current)) : Engine.defaultDoc();
    const parsed = parse(u8, table);
    const result = toDoc(u8, table, JSON.parse(JSON.stringify(base)), Engine), imported = result.doc;
    if (extension === 'pxp') { imported.sections = []; return result; }
    if (extension === 'pxt') {
      for (const key of ['paper', 'margins', 'pecha', 'normal', 'counts', 'types', 'tabWidth', 'tibetanRaise']) base[key] = imported[key];
      if (parsed.template.PechaAnnotation) {
        for (const key of ['size', 'inset']) base.folio[key] = imported.folio[key];
        for (const key of ['size', 'inset', 'position', 'angle']) base.pageNum[key] = imported.pageNum[key];
        base.notes.outLeft = imported.notes.outLeft; base.notes.outRight = imported.notes.outRight;
      }
    } else if (extension === 'pxc' || extension === 'pxa') {
      base.notes.sets = imported.notes.sets;
      for (const key of ['start', 'onTitle', 'jyon', 'rhino']) base.folio[key] = imported.folio[key];
      for (const key of ['start', 'on', 'onTitle', 'firstTitle']) base.pageNum[key] = imported.pageNum[key];
      if (parsed.template.PechaAnnotation) {
        for (const key of ['size', 'inset']) base.folio[key] = imported.folio[key];
        for (const key of ['size', 'inset', 'position', 'angle']) base.pageNum[key] = imported.pageNum[key];
      }
      if (extension === 'pxc') {
        base.text = imported.text; base.sections = []; base.flow = false; base.assets = imported.assets; base.images = imported.images;
        for (const key of ['yigo', 'shad', 'dzog']) base[key] = imported[key];
      }
    } else throw new Error('Unknown PechaMaker file type');
    return {doc: base, unknown: result.unknown, warnings: result.warnings};
  }

  return { parse, readImages, decodeStream, eventsToText, toDoc, load };
})();
if (typeof module !== 'undefined') module.exports = Pxp;
