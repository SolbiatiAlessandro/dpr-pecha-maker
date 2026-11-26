// Synthetic examples from separate public Classic/Chogyal tables; no original assets.
const {native,font}=require('./native-charset-fixture');
const cases=[
 ['TibetanClassic',201,'༄༅'],['TibetanClassicSkt1',109,'ངྐྵྱ'],
 ['TibetanClassicSkt2',84,'དྦྷྲ'],['TibetanClassicSkt3',52,'རྻ'],['TibetanClassicSkt4',80,'࿀'],
 ['TibetanChogyal',33,'ཀ'],['TibetanChogyalSkt1',128,'ཛྫྭ'],
 ['TibetanChogyalSkt2',84,'དྦྷྱ'],['TibetanChogyalSkt3',254,'ཧྣྱ'],['TibetanChogyalSkt4',101,'༷'],
 ['TibetanClassicSkt',33,'ཀྐ'],['TibetanChogyalSkt',33,'ཀྐ']
];
const expected=cases.map(c=>c[2]).join(' ');
const rtf=()=>'{\\rtf1\\ansi{\\fonttbl'+cases.map(([name],i)=>'{\\f'+i+' '+name+';}').join('')+'}{\\colortbl;\\red176\\green48\\blue32;}'+cases.map(([,byte],i)=>'{\\f'+i+'\\fs64\\b\\cf1 '+"\\'"+byte.toString(16)+'}').join(' ')+'}';
const sample=(extension='pxc')=>{
 const offset=extension==='pxa'?5:0;
 const body=cases.flatMap(([,byte],i)=>[...(i?[32]:[]),...font(i+offset),byte]);
 const mark=[...font(offset),201];
 return native({extension,fonts:cases.map(([name])=>({name,charset:0})),body:extension==='pxa'?[]:body,note:mark,noteIndex:4,yigo:mark,rhino:mark});
};
module.exports={cases,expected,rtf,sample};
