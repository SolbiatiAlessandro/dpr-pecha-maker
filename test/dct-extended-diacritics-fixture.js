const {wrap}=require('./dct-alignment-fixture');
// Independently specified examples using Unicode base/combining sequences.
const cases=[
 [128,'C\u0327'],[152,'æ\u0304'],[156,'e\u0304\u0303'],[157,'r\u0325'],[159,'r\u0331'],[166,'l\u0303'],[167,'m\u0307'],[168,'a\u0304\u0306'],
 [174,'r\u0325\u0304'],[175,'l\u0325'],[176,'l\u0325\u0304'],[179,'r\u0325\u0304\u0301'],[180,'m\u0306'],[181,'a\u0304\u0301'],[185,'e\u0304'],[187,'R\u0325'],
 [193,'m\u0310'],[198,'r\u0323\u0301'],[201,'k\u0331'],[203,'Æ\u0304'],[207,'r\u0323\u0304\u0301'],[209,'i\u0303'],[213,'e\u0306'],[215,'l\u0331'],
 [219,'h\u0331'],[220,'h\u032e'],[221,'–'],[222,'—'],[223,'“']
];
const expected=cases.map(([,s],i)=>s.normalize('NFC')+(i===cases.length-1?'':i%8===7?'\n':' ')).join('');
const body=cases.flatMap(([byte],i)=>[21,byte,...(i===cases.length-1?[]:i%8===7?[10]:[16,32])]);
const sample=()=>wrap(body,'Ansi');
module.exports={cases,expected,body,sample,wrap};
