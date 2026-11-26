// Synthetic Ededris bytes; expected known glyphs use the existing public UTFC map.
// Slot 34 is unresolved: references disagree, and its old mapping was CSV debris.
const {native,font}=require('./native-charset-fixture');
const cases=[
 ['Ededris-a','ཀ','ཁ'],['Ededris-a2','ཀཱ','ཁཱ'],
 ['Ededris-b','སྟ','སྡ'],['Ededris-b2','སྟཱ','སྡཱ'],
 ['Ededris-c','གྦྱ','གྦྷ'],['Ededris-c2','གྦྱཱ','གྦྷཱ'],
 ['Ededris-d','ཊྥ','ཊྦྷ'],['Ededris-d2','ཊྥཱ','ཊྦྷཱ'],
 ['Ededris-e','ཎྔྟ','ཎྟ'],['Ededris-e2','ཎྔྟཱ','ཎྟཱ'],
 ['Ededris-f','ཛྱ','ཛྲ'],['Ededris-f2','ཛྱཱ','ཛྲཱ'],
 ['Ededris-g','ཪྭ','ཪྱ'],['Ededris-g2','ཪྭཱ','ཪྱཱ']
];
const rtf=()=>'{\\rtf1\\ansi{\\fonttbl'+cases.map(([name],i)=>'{\\f'+i+' '+name+';}').join('')+'}'+cases.map((_,i)=>'{\\f'+i+'\\b\\fs32 '+['21','22','23'].map(h=>"\\'"+h).join('')+'}').join('\\par ')+'}';
const sample=(extension='pxc',marks=false)=>{
 const offset=extension==='pxa'?5:0;
 const body=cases.flatMap((_,i)=>[...(i?[10]:[]),...font(i+offset),33,34,35]);
 return native({extension,fonts:cases.map(([name])=>({name,charset:0})),body:extension==='pxa'?[]:body,...(marks?{note:[...font(offset),33,34,35],noteIndex:4,yigo:[...font(offset),33,34,35],rhino:[...font(offset),33,34,35]}:{})});
};
module.exports={cases,rtf,sample};
