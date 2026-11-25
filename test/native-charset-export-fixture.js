const {sample:content}=require('./native-content-export-fixture');
// Independent expected bytes corroborated with Python Windows codec encoders.
const cases=[{page:1250,charset:238,text:'Łódź',hex:'a3f3649f'},{page:1251,charset:204,text:'Привет',hex:'cff0e8e2e5f2'},
 {page:1253,charset:161,text:'Αθήνα',hex:'c1e8deede1'},{page:1254,charset:162,text:'İış',hex:'ddfdfe'},
 {page:1255,charset:177,text:'שלום',hex:'f9ece5ed'},{page:1256,charset:178,text:'سلام',hex:'d3e1c7e3'},
 {page:1257,charset:186,text:'Rīga',hex:'52ee6761'},{page:1258,charset:163,text:'a\u0301',hex:'61ec'},
 {page:874,charset:222,text:'ไทย',hex:'e4b7c2'}];
function sample(E){
 const d=content(E);d.paper={name:'Custom',w:14,h:8.5};d.counts={title:0,fancy:0};
 for(const t of Object.values(d.types))t.baseline=.3;
 d.text='{font:jomolhari 18 l}ཀི་ {font:family:Arial #c02030}'+cases.slice(0,4).map(c=>c.text).join(' ')+'{page}{font:family:Arial 18 b #0044aa l}'+cases.slice(4).map(c=>c.text).join(' ');
 d.yigo.text='{font:family:Arial}Привет';d.yigo.rich=true;
 d.folio.rhino='{font:family:Arial}Αθήνα';d.folio.rhinoRich=true;
 d.notes.sets['body.front'].inL={...d.notes.sets['body.front'].inL,text:'שלום',rich:false,on:true};
 d.font='"Arial"';d.fontName='Arial';
 return d;
}
module.exports={cases,sample};
