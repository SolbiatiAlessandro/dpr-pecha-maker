// Bounded, independent reader for PKTC5 and numeric TibetD4/5 single-body files.
// Uses existing legacy-font maps; source layout and styling are not reproduced.
const Dct = (() => {
  // Encoding facts: core CSX+ positions from GRETIL's encoding concordance.
  // DCT diacritic-kind letters represent these sounds when CSX+ remapping is on.
  // https://gretil.sub.uni-goettingen.de/gretil/gretdiac.pdf (pp. 2, 4–5)
  const coreCsx = {164:'ñ',165:'Ñ',224:'ā',225:'ß',226:'Ā',227:'ī',228:'Ī',229:'ū',230:'Ū',
    231:'ṛ',232:'Ṛ',233:'ṝ',234:'Ṝ',235:'ḷ',236:'Ḷ',237:'ḹ',238:'Ḹ',239:'ṅ',240:'Ṅ',
    241:'ṭ',242:'Ṭ',243:'ḍ',244:'Ḍ',245:'ṇ',246:'Ṇ',247:'ś',248:'Ś',249:'ṣ',250:'Ṣ',251:'”',252:'ṃ',253:'Ṃ',254:'ḥ',255:'Ḥ'};
  const diacriticLetters = Object.fromEntries(Array.from('aAiIuUpPqQkKlLoOtTdDnNsSrRmMhHÑ',
    (letter,index)=>[letter,Array.from('āĀīĪūŪṛṚṝṜḷḶḹḸṅṄṭṬḍḌṇṆśŚṣṢṃṂḥḤÑ')[index]]));
  function diacriticGlyph(byte, remap) {
    const letter = String.fromCharCode(byte);
    if (remap && diacriticLetters[letter]) return diacriticLetters[letter];
    return coreCsx[byte] || (byte >= 32 && byte < 127 ? letter : null);
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
    let source = 'modern PKTC version 5';
    if (header !== 'PKTC\x01\x1a\x05TibetDoc') {
      const fields = header.trim().split(/[ \t]+/);
      if (fields.length !== 4 || fields[2] !== 'TibetD' || ![fields[0],fields[1],fields[3]].every(integer)) throw new Error('Unsupported DCT file header.');
      const version = Number(fields[3]);
      if (version !== 4 && version !== 5) throw new Error('Only numeric TibetDoc versions 4 and 5 are supported; older glyph encodings remain unverified.');
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
      `Experimental DCT import: ${source}, one body record. Supported headers are PKTC5 and numeric TibetDoc 4/5; verify against the source.`,
      `DCT source layout and most formatting are not reproduced; center/left toggles are retained. Tibetan ${typography.tibetanSize} legacy points are converted to ${tibetanSize} web points; exact font metrics remain unverified. Latin text uses ${typography.latinSize} points.`,
      'Legacy fonts are substituted. Opening-ornament shapes differ between available converters and remain unverified against Windows PechaMaker.'
    ]);
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
      const mapped = b === 32 ? ' ' : table[name]?.[b];
      if (mapped === undefined || mapped === '') {unknown++;emit('�',true);} else emit(mapped,true);
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
          warnings.add('Diacritics use Unicode equivalents of the CSX+ core character set with a substitute web font. Extended CSX+ characters remain unsupported and appear as �; compare with the source.');
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
