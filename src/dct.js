// Bounded, independent reader for the modern PKTC TibetDoc single-body format.
// Uses existing legacy-font maps; source layout and styling are not reproduced.
const Dct = (() => {
  function read(input, Engine, table, base = null) {
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
    if (!bytes.length || bytes.length > 4000000) throw new Error('DCT import requires a file smaller than 4 MB.');
    let pos = bytes[0] === 0 ? 1 : 0;
    const line = () => {
      const end = bytes.indexOf(10,pos);
      if (end < 0 || end-pos > 65536) throw new Error('Incomplete or oversized DCT header.');
      const text = Array.from(bytes.subarray(pos,end),b=>String.fromCharCode(b)).join('').replace(/\r$/,'');
      pos = end+1; return text;
    };
    if (line() !== 'PKTC\x01\x1a\x05TibetDoc') throw new Error('Only modern PKTC TibetDoc version 5 is supported experimentally.');
    const settings = line().split('\t');
    if (settings.length < 7 || !settings.slice(0,6).every(v=>/^\d+$/.test(v)) || !['Ansi','TibetanAnsi'].includes(settings[6])) throw new Error('Unsupported DCT encoding header.');
    let found = false;
    while (pos < bytes.length) {
      if (bytes[pos] === 49 && bytes[pos+1] === 9 && bytes[pos+2] === 33 && bytes[pos+3] === 9) {pos += 4; found = true; break;}
      if (!line().startsWith('hdr\t')) throw new Error('Unsupported DCT record before the body.');
    }
    if (!found) throw new Error('No supported DCT body record was found.');
    const warnings = new Set([
      'Experimental DCT import: only modern PKTC version 5 with one body record is supported; verify against the source.',
      'DCT layout and formatting are not reproduced. Tibetan uses the web body size and Latin text uses 18 points.',
      'Legacy fonts are substituted. Opening-ornament shapes differ between available converters and remain unverified against Windows PechaMaker.'
    ]);
    const doc = JSON.parse(JSON.stringify(base || Engine.defaultDoc()));
    doc.text = ''; doc.sections = []; doc.flow = false; doc.textSize = null;
    let font = null, output = '', unknown = 0;
    const ansi = new TextDecoder('windows-1252');
    const emit = (text, tibetan) => {
      if (font !== tibetan) {output += tibetan ? `{font:jomolhari ${doc.types.body.fontSize}}` : '{font:serif 18}';font = tibetan;}
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
        if (c === 21 || c === 22) {unknown++;emit('�',false);warnings.add('Diacritical or symbol-font glyphs were replaced with visible replacement characters.');}
        else glyph(c,b);
        continue;
      }
      if (c === 25 || c === 27) {following();warnings.add('DCT formatting control records were ignored. Check alignment, styling and spacing.');continue;}
      if (c < 32) throw new Error('Unsupported DCT control 0x'+c.toString(16).padStart(2,'0')+'.');
      glyph(settings[6] === 'TibetanAnsi' ? 17 : 16,c);
    }
    if(unknown)warnings.add(`${unknown} DCT glyphs could not be converted and were replaced with �.`);
    doc.text = output;
    return {doc,warnings:[...warnings],unknown};
  }
  return {read};
})();
if(typeof module !== 'undefined')module.exports=Dct;
