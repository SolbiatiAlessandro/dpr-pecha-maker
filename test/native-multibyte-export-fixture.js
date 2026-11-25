const {sample:content}=require('./native-content-export-fixture');
// Expected bytes independently checked with Python cp932/gbk/cp949/cp950.
// The final Big5 punctuation distinguishes this run from the other repertoires.
const cases=[
 {charset:128,text:'日本語ソｶ',hex:'93fa967b8cea835cb6'},
 {charset:134,text:'简体中文',hex:'bcf2cce5d6d0cec4'},
 {charset:129,text:'한국어',hex:'c7d1b1b9beee'},
 {charset:136,text:'繁體中文‧',hex:'c163c5e9a4a4a4e5a145'}
];
function sample(E){
 const d=content(E);d.paper={name:'Custom',w:14,h:8.5};d.counts={title:0,fancy:0};
 for(const t of Object.values(d.types))t.baseline=.3;
 d.text='{font:jomolhari 18 l}ཀི་ {font:family:Arial #c02030}'+cases[0].text+'{#14100e} '+cases[1].text+'{page}{font:family:Arial 18 b #0044aa l}'+cases[2].text+'{/b i} '+cases[3].text;
 d.yigo.text='{font:family:Arial}日本語ソｶ';d.yigo.rich=true;
 d.folio.rhino='{font:family:Arial}简体中文';d.folio.rhinoRich=true;
 d.notes.sets['body.front'].inL={...d.notes.sets['body.front'].inL,text:'한국어',rich:false,on:true};
 d.notes.sets['body.back'].inL={...d.notes.sets['body.back'].inL,text:'繁體中文‧',rich:false,on:true};
 d.font='"Arial"';d.fontName='Arial';return d;
}
module.exports={cases,sample};
