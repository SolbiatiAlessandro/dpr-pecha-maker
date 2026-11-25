const hex=s=>s.match(/../g).map(b=>"\\'"+b).join('');
const cases=[
 {charset:128,page:932,hex:'93fa967b8cea835c',text:'日本語ソ'},
 {charset:134,page:936,hex:'d6d0cec4',text:'中文'},
 {charset:129,page:949,hex:'c7d1b1b9beee',text:'한국어'},
 {charset:136,page:950,hex:'c163c5e9a4a4a4e5',text:'繁體中文'}
];
const fixture='{\\rtf1\\ansi\\ansicpg1252\\deff0{\\fonttbl'+cases.map((c,i)=>'{\\f'+i+'\\fcharset'+c.charset+' Arial;}').join('')+'}\\fs36 '+cases.map((c,i)=>'\\f'+i+(i===1?'\\b ':i===2?'\\b0\\i ':'\\i0 ')+hex(c.hex)).join(' ')+'}';
module.exports={hex,cases,fixture,expected:cases.map(c=>c.text).join(' ')};
