const {native,font}=require('./native-charset-fixture');
const cases=[
 {charset:128,hex:'93fa967b8cea835c',text:'日本語ソ'},
 {charset:134,hex:'d6d0cec4',text:'中文'},
 {charset:129,hex:'c7d1b1b9beee',text:'한국어'},
 {charset:136,hex:'c163c5e9a4a4a4e5',text:'繁體中文'}
];
const fonts=cases.map(c=>({name:'Arial',charset:c.charset}));
const code=(op,a,b=0,c=0)=>[17,op,a,b,c,17];
const stream=(offset=0)=>cases.flatMap((c,i)=>[...font(i+offset),...code(33,18),...code(35,i===1?1:0),...code(36,i===2?1:0),...Buffer.from(c.hex,'hex'),...(i<3?[32]:[])]);
const sample=(extension='pxp')=>native({extension,fonts,body:extension==='pxa'?[]:stream(),noteIndex:4,note:stream(extension==='pxa'?5:0),rhino:stream(extension==='pxa'?5:0)});
module.exports={cases,fonts,code,stream,sample,expected:cases.map(c=>c.text).join(' ')};
