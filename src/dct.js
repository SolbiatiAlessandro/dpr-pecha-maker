// Bounded, independent reader for PKTC5 and numeric TibetD2–5 single-body files.
// Uses existing legacy-font maps; source layout and styling are not reproduced.
const Dct = (() => {
  // Older TibetDoc bytes move to the current font slots before Unicode lookup.
  // Apply once: several base-font entries form a cycle, not a chained rewrite.
  const oldBase = {205:45,45:253,127:254,158:154,159:155,142:157,166:226,253:205};
  const oldSubfont = {45:252,127:253,142:249,158:250,160:254,166:251};
  // Encoding facts: core CSX+ positions from GRETIL's encoding concordance.
  // DCT diacritic-kind letters represent these sounds when CSX+ remapping is on.
  // https://gretil.sub.uni-goettingen.de/gretil/gretdiac.pdf (pp. 2, 4–5)
  const coreCsx = {164:'ñ',165:'Ñ',224:'ā',225:'ß',226:'Ā',227:'ī',228:'Ī',229:'ū',230:'Ū',
    231:'ṛ',232:'Ṛ',233:'ṝ',234:'Ṝ',235:'ḷ',236:'Ḷ',237:'ḹ',238:'Ḹ',239:'ṅ',240:'Ṅ',
    241:'ṭ',242:'Ṭ',243:'ḍ',244:'Ḍ',245:'ṇ',246:'Ṇ',247:'ś',248:'Ś',249:'ṣ',250:'Ṣ',251:'”',252:'ṃ',253:'Ṃ',254:'ḥ',255:'Ḥ'};
  // Additional unambiguous CSX+ encoding facts from the same concordance (pp. 1–4).
  // Preserve rings below and candrabindu, rather than GRETIL's optional dot substitutions.
  // Bytes 160/202 are unspecified; the underlined digraphs at 200/204 remain unresolved.
  const extendedCsx = Object.fromEntries(Object.entries({
    128:'Ç',129:'ü',130:'é',131:'â',132:'ä',133:'à',134:'å',135:'ç',136:'ê',137:'ë',138:'è',139:'ï',140:'î',141:'ì',142:'Ä',143:'Å',
    144:'É',145:'æ',146:'Æ',147:'ô',148:'ö',149:'ò',150:'û',151:'ù',152:'ǣ',153:'Ö',154:'Ü',155:'ŭ',156:'ē\u0303',157:'r\u0325',158:'á',159:'ṟ',
    161:'í',162:'ó',163:'ú',166:'l\u0303',167:'ṁ',168:'ā\u0306',169:'ī\u0306',170:'ū\u0306',171:'ā\u0303',172:'ī\u0303',173:'ṉ',
    174:'r\u0325\u0304',175:'l\u0325',176:'l\u0325\u0304',177:'r\u0325\u0301',178:'r\u0325\u0300',179:'r\u0325\u0304\u0301',
    180:'m\u0306',181:'ā\u0301',182:'ā\u0300',183:'ī\u0301',184:'ī\u0300',185:'ē',186:'ō',187:'R\u0325',188:'ẏ',189:'ū\u0301',190:'ū\u0300',
    191:'r\u0306',192:'ō\u0303',193:'m\u0310',194:'ṯ',195:'Ē',196:'Ō',197:'n\u0306',198:'ṛ\u0301',199:'ṛ\u0300',201:'ḵ',203:'Ǣ',205:'ġ',206:'ĉ',
    207:'ṝ\u0301',208:'ã',209:'ĩ',210:'ũ',211:'ẽ',212:'õ',213:'ĕ',214:'ŏ',215:'ḻ',216:'ū\u0303',217:'Ġ',218:'Ĉ',219:'ẖ',220:'ḫ',221:'–',222:'—',223:'“'
  }).map(([byte,text])=>[byte,text.normalize('NFC')]));
  const diacriticLetters = Object.fromEntries(Array.from('aAiIuUpPqQkKlLoOtTdDnNsSrRmMhHÑ',
    (letter,index)=>[letter,Array.from('āĀīĪūŪṛṚṝṜḷḶḹḸṅṄṭṬḍḌṇṆśŚṣṢṃṂḥḤÑ')[index]]));
  function diacriticGlyph(byte, remap) {
    const letter = String.fromCharCode(byte);
    if (remap && diacriticLetters[letter]) return diacriticLetters[letter];
    return coreCsx[byte] || extendedCsx[byte] || (byte >= 32 && byte < 127 ? letter : null);
  }
  function importSettings(input = {}, Engine) {
    const result = {tibetanSize:28,latinSize:18,latinFont:'family:Times%20New%20Roman',diacriticSize:18,diacriticFont:'serif',remapDiacritics:true,...input};
    for (const key of ['tibetanSize','latinSize','diacriticSize']) if (!Number.isInteger(result[key]) || result[key]<(key==='tibetanSize'?7:5) || result[key]>200) throw new Error('DCT sizes must be whole points: Tibetan 7–200 and Latin/diacritical 5–200.');
    for (const key of ['latinFont','diacriticFont']) if (!Engine.fontFamily(result[key])) throw new Error('Unsupported DCT font.');
    if (typeof result.remapDiacritics !== 'boolean') throw new Error('Invalid DCT diacritic remapping choice.');
    return {tibetanSize:result.tibetanSize,latinSize:result.latinSize,latinFont:result.latinFont,diacriticSize:result.diacriticSize,diacriticFont:result.diacriticFont,remapDiacritics:result.remapDiacritics};
  }
  function read(input, Engine, table, base = null, options = {}) {
    const typography = importSettings(options, Engine), tibetanSize = typography.tibetanSize * .75;
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
    if (!bytes.length || bytes.length > 4000000) throw new Error('DCT import requires a file smaller than 4 MB.');
    let pos = bytes[0] === 0 ? 1 : 0;
    const line = () => {
      const end = bytes.indexOf(10,pos);
      if (end < 0 || end-pos > 65536) throw new Error('Incomplete or oversized DCT header.');
      const text = Array.from(bytes.subarray(pos,end),b=>String.fromCharCode(b)).join('').replace(/\r$/,'');
      pos = end+1; return text;
    };
    // These numeric metadata fields are ignored, not coerced to JS integers:
    // the public fixture includes a timestamp larger than a signed DWORD.
    const header = line(), integer = value => /^[+-]?\d+$/.test(value);
    let source = 'modern PKTC version 5', version = 5;
    if (header !== 'PKTC\x01\x1a\x05TibetDoc') {
      const fields = header.trim().split(/[ \t]+/);
      if (fields.length !== 4 || fields[2] !== 'TibetD' || ![fields[0],fields[1],fields[3]].every(integer)) throw new Error('Unsupported DCT file header.');
      version = Number(fields[3]);
      if (version < 2 || version > 5) throw new Error('Only numeric TibetDoc versions 2 through 5 are supported experimentally.');
      source = `numeric TibetDoc version ${version}`;
    }
    // Native headers use five or six signed decimal fields before the mode.
    // Keep metadata after a tab separate, as in the existing PKTC reader.
    const settings = line().match(/^[ \t]*((?:[+-]?\d+[ \t]+){5,6})(Ansi|TibetanAnsi)(?:[ \t]*|\t.*)$/);
    if (!settings || !settings[1].trim().split(/[ \t]+/).every(integer)) throw new Error('Unsupported DCT encoding header.');
    const encoding = settings[2];
    let found = false;
    while (pos < bytes.length) {
      if (bytes[pos] === 49 && bytes[pos+1] === 9 && bytes[pos+2] === 33 && bytes[pos+3] === 9) {pos += 4; found = true; break;}
      if (!line().startsWith('hdr\t')) throw new Error('Unsupported DCT record before the body.');
    }
    if (!found) throw new Error('No supported DCT body record was found.');
    const bodyStart = pos;
    let centered = false;
    const warnings = new Set([
      `Experimental DCT import: ${source}, one body record. Supported headers are PKTC5 and numeric TibetDoc 2–5; verify against the source.`,
      `DCT source layout and most formatting are not reproduced; center/left toggles are retained. Tibetan ${typography.tibetanSize} legacy points are converted to ${tibetanSize} web points; exact font metrics remain unverified. Latin text uses ${typography.latinSize} points.`,
      'Legacy fonts are substituted. Opening-ornament shapes differ between available converters and remain unverified against Windows PechaMaker.'
    ]);
    if(version<=3)warnings.add('Older TibetDoc glyph slots are normalized before Unicode conversion. Genuine version 2/3 documents and original font shapes remain unverified; unresolved corrected slots appear as �.');
    const doc = JSON.parse(JSON.stringify(base || Engine.defaultDoc()));
    doc.text = ''; doc.sections = []; doc.flow = false; doc.textSize = null;
    for (const type of Object.values(doc.types)) type.fontSize = tibetanSize;
    const tibetanFont = doc.fontName === 'Noto Serif Tibetan' ? 'noto' : 'jomolhari';
    let font = null, output = '', unknown = 0;
    const ansi = new TextDecoder('windows-1252');
    const emit = (text, kind) => {
      if (font !== kind) {
        output += kind === true ? `{font:${tibetanFont} ${tibetanSize}}` : kind === 'diacritic' ? `{font:${typography.diacriticFont} ${typography.diacriticSize}}` : `{font:${typography.latinFont} ${typography.latinSize}}`;
        font = kind;
      }
      output += text.replace(/[{}]/g,c=>c==='{'?'{lc}':'{rc}');
    };
    const glyph = (kind,b) => {
      if (kind === 16) {
        let text = ansi.decode(Uint8Array.of(b));
        if (/[\u0000-\u001f\u007f-\u009f]/.test(text)) {unknown++;text = '�';}
        emit(text,false);return;
      }
      const slot = kind === 23 ? 4 : kind-17;
      const name = slot ? 'TibetanMachineSkt'+slot : 'TibetanMachine';
      const original = b;
      if(version<=3)b=(slot?oldSubfont:oldBase)[b] ?? b;
      const mapped = b === 32 ? ' ' : table[name]?.[b];
      const unresolvedCorrection = b!==original && (typeof mapped!=='string' || !/^[\u0f00-\u0fff]+$/.test(mapped));
      if (mapped === undefined || mapped === '' || unresolvedCorrection) {unknown++;emit('�',true);} else emit(mapped,true);
    };
    const following = () => {if(pos>=bytes.length)throw new Error('Truncated DCT control or glyph.');return bytes[pos++];};
    while (pos < bytes.length) {
      if (output.length > 8000000) throw new Error('Converted DCT text is too large.');
      const c = bytes[pos++];
      if (c === 13) continue;
      if (c === 10 || c === 11) {
        // Additional native records cannot safely be treated as prose.
        if (c === 10 && /^(?:\d+|hdr)\t/.test(Array.from(bytes.subarray(pos,pos+24),b=>String.fromCharCode(b)).join(''))) throw new Error('Multiple DCT body records or trailing metadata are not supported yet.');
        output += '\n';continue;
      }
      if (c === 9) {output += '\t';continue;}
      if (c === 12) {output += '{page}';continue;}
      if (c >= 16 && c <= 23) {
        const b = following();
        if (c === 21) {
          const text = diacriticGlyph(b,typography.remapDiacritics);
          if (text === null) unknown++;
          emit(text === null ? '�' : text,'diacritic');
          warnings.add('Diacritics use supported CSX+ Unicode equivalents with a substitute web font. Unspecified slots and unresolved underlined digraphs appear as �; compare combined accents and glyph shapes with the source.');
        } else if (c === 22) {unknown++;emit('�',false);warnings.add('Symbol-font glyphs were replaced with visible replacement characters.');}
        else glyph(c,b);
        continue;
      }
      if (c === 25 || c === 27) {
        const control = following();
        if (c === 25 && control === 101) {
          // Native import begins a new line except when entering at body byte 0.
          // The matching close returns to left alignment, not the prior style.
          if (centered || pos-2 !== bodyStart) output += '\n';
          centered = !centered;
          output += centered ? '{c}' : '{l}';
        } else warnings.add('Unsupported DCT formatting control records were ignored. Check alignment, styling and spacing.');
        continue;
      }
      if (c < 32) throw new Error('Unsupported DCT control 0x'+c.toString(16).padStart(2,'0')+'.');
      glyph(encoding === 'TibetanAnsi' ? 17 : 16,c);
    }
    if(unknown)warnings.add(`${unknown} DCT glyphs could not be converted and were replaced with �.`);
    doc.text = output;
    return {doc,warnings:[...warnings],unknown};
  }
  return {read,importSettings};
})();
if(typeof module !== 'undefined')module.exports=Dct;
