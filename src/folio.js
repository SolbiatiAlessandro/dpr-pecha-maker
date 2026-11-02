// Folio numbers spelled out in Tibetan, the way they appear in a pecha margin.
const Folio = (() => {
  const T = '་';
  const UNITS = ['', 'གཅིག', 'གཉིས', 'གསུམ', 'བཞི', 'ལྔ', 'དྲུག', 'བདུན', 'བརྒྱད', 'དགུ'];
  const TENS = ['', 'བཅུ', 'ཉི་ཤུ', 'སུམ་ཅུ', 'བཞི་བཅུ', 'ལྔ་བཅུ', 'དྲུག་ཅུ', 'བདུན་ཅུ', 'བརྒྱད་ཅུ', 'དགུ་བཅུ'];
  const LINK = ['', 'བཅུ', 'ཉེར', 'སོ', 'ཞེ', 'ང', 'རེ', 'དོན', 'གྱ', 'གོ'];
  const HUNDREDS = ['', 'བརྒྱ', 'ཉིས་བརྒྱ', 'སུམ་བརྒྱ', 'བཞི་བརྒྱ', 'ལྔ་བརྒྱ', 'དྲུག་བརྒྱ', 'བདུན་བརྒྱ', 'བརྒྱད་བརྒྱ', 'དགུ་བརྒྱ'];

  // 21-99 standing alone use the full form (བརྒྱད་ཅུ་གྱ་གཉིས); after hundreds, the short one (གྱ་གཉིས).
  function below100(n, afterHundreds) {
    if (n < 10) return UNITS[n];
    if (n === 15) return 'བཅོ་ལྔ';
    if (n === 18) return 'བཅོ་བརྒྱད';
    const t = Math.floor(n / 10), u = n % 10;
    if (u === 0) return TENS[t];
    if (t === 1) return LINK[1] + T + UNITS[u];
    if (afterHundreds) return LINK[t] + T + UNITS[u];
    return TENS[t] + T + (t === 2 ? 'རྩ' : LINK[t]) + T + UNITS[u];
  }

  function words(n) {
    if (n >= 1000) return 'སྟོང་ཕྲག་གཅིག' + T + (n > 1000 ? ' ' + words(n - 1000) : '');
    const h = Math.floor(n / 100), rest = n % 100;
    if (h && !rest) return HUNDREDS[h] + T + 'ཐམ་པ' + T;
    const parts = [];
    if (h) parts.push(HUNDREDS[h] + T);
    if (rest) parts.push(below100(rest, h > 0) + T);
    return parts.join(' ');
  }

  return { words, JYON: 'གཡོན' };
})();
if (typeof module !== 'undefined') module.exports = Folio;
