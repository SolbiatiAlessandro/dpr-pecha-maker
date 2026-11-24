const {native,font}=require('./native-charset-fixture');
const code=(op,a=0,b=0,c=0)=>[17,op,a,b,c,17];
const stream=(id=0)=>[...font(id),...code(0x21,0,20),...code(0x22,176,48,32),...code(0x23,1),...code(0x24,1),...code(0x25,1),...code(0x26,1),...Buffer.from('Marked'),10,...code(0x26,0),...code(0x22,0,0,0),...Buffer.from('Black'),10,...code(0x23,0),...code(0x24,0),...code(0x25,0),...Buffer.from('Plain')];
const sample=(extension='pxp')=>native({extension,body:extension==='pxa'?[]:stream(),noteIndex:4,note:stream(extension==='pxa'?5:0)});
module.exports={code,stream,sample};
