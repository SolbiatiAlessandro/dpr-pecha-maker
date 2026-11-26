const {native,font}=require('./native-charset-fixture');
// Mac Roman encoding facts, independently checked with Python's mac_roman codec.
const bytes=[0x80,0x8e,0xa0,0xad,0xb0,0xc6,0xce,0xd1,0xd2,0xd3,0xdb,0xde,0xdf];
const text='Äé†≠∞∆Œ—“”€ﬁﬂ';
function sample(extension='pxp'){
 const id=extension==='pxa'?5:0;
 const stream=[...font(id),17,33,0,24,0,17,17,35,1,0,0,17,...bytes];
 return native({extension,fonts:[{name:'Times New Roman',charset:77}],body:extension==='pxa'?[]:stream,noteIndex:4,note:stream,yigo:stream,rhino:stream});
}
module.exports={bytes,text,sample,native,font};
