// Synthetic data using documented public font-name aliases, not original assets.
const {native,font}=require('./native-charset-fixture');
const cases=[
 ['Dedris-a',33,'ཀ'],['Dedris-a1',33,'ཀུ'],['Dedris-a2',33,'ཀཱ'],['Dedris-a3',33,'ཀཱུ'],
 ['Dedris-b',33,'སྟ'],['Dedris-g2',33,'ཪྭཱ'],['Dedris-vowa',65,'ི'],
 ['Dedris-sym',40,'༼'],['Dedris-syma',40,'༼'],['Ededris-syma',41,'༽'],
 ['Sama',65,'ཀ'],['Samb',33,'ཀྐ'],['Samc',33,'མྤ']
];
const expected=cases.map(c=>c[2]).join(' ');
const rtf=()=>'{\\rtf1\\ansi{\\fonttbl'+cases.map(([name],i)=>'{\\f'+i+' '+name+';}').join('')+'}{\\colortbl;\\red176\\green48\\blue32;}'+cases.map(([,byte],i)=>'{\\f'+i+'\\fs64\\b\\cf1 '+"\\'"+byte.toString(16)+'}').join(' ')+'}';
const sample=(extension='pxc')=>{
 const offset=extension==='pxa'?5:0;
 const body=cases.flatMap(([,byte],i)=>[...(i?[32]:[]),...font(i+offset),byte]);
 const mark=[...font(offset),33];
 return native({extension,fonts:cases.map(([name])=>({name,charset:0})),body:extension==='pxa'?[]:body,note:mark,noteIndex:4,yigo:mark,rhino:mark});
};
module.exports={cases,expected,rtf,sample};
