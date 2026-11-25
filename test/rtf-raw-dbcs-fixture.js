const raw=hex=>String.fromCharCode(...hex.match(/../g).map(h=>parseInt(h,16)));
// Expected characters independently checked with Python cp932, gbk and cp950.
const cases=[{page:932,charset:128,hex:'967b835c817d',text:'本ソ±'},
 {page:936,charset:134,hex:'815c817b817d',text:'乗亄亇'},
 {page:950,charset:136,hex:'a15ca17ba17d',text:'﹏﹃﹙'}];
const fixture='{\\rtf1\\ansi\\ansicpg1252\\deff0{\\fonttbl'+cases.map((c,i)=>'{\\f'+i+'\\fcharset'+c.charset+' Arial;}').join('')+'}\\fs36 '+cases.map((c,i)=>'\\f'+i+(i===1?'\\b ':i===2?'\\b0\\i ':' ')+raw(c.hex)).join(' ')+'\\i0\\line\\uc0\\u3904\\u3954\\u3851}';
module.exports={raw,cases,fixture,expected:cases.map(c=>c.text).join(' ')+'\u2028ཀི་'};
