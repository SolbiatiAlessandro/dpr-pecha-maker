// Character-chart view of the independently maintained import mappings.
// This does not implement an interactive TCC/Sambhota keyboard map.
const LegacyCharacters = (() => {
  const fonts = ['TibetanMachine', 'TibetanMachineSkt1', 'TibetanMachineSkt2', 'TibetanMachineSkt3', 'TibetanMachineSkt4'];
  function fontNames(table) {
    return [...new Set([...fonts,...Object.keys(table).filter(name=>table[name] && typeof table[name]==='object' && !Array.isArray(table[name]))])];
  }
  function chart(font, table) {
    if (!fontNames(table).includes(font)) throw new Error('Unsupported legacy character chart.');
    const map = table[font] || {};
    return Array.from({length:224},(_,index)=>{
      const byte=index+32, mapped=map[byte];
      // Never offer Latin fallback entries or the converter's ambiguous four-zero
      // sequences as Tibetan glyphs. Missing byte slots remain visibly unavailable.
      const text=byte===32?' ':typeof mapped==='string' && /^[\u0f00-\u0fff]+$/.test(mapped) && mapped!=='༠༠༠༠' ? mapped : null;
      const code=`${byte} / 0x${byte.toString(16).toUpperCase().padStart(2,'0')}`;
      const combining=text!==null && /^\p{M}/u.test(text);
      const unicode=text===null?'':Array.from(text,c=>'U+'+c.codePointAt(0).toString(16).toUpperCase().padStart(4,'0')).join(' ');
      return {byte,text,combining,code,name:`${font} slot ${code}: ${text===null?'unavailable':byte===32?'space':unicode}`};
    });
  }
  return {fonts,fontNames,chart};
})();
if(typeof module!=='undefined')module.exports=LegacyCharacters;
