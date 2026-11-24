const {native,font}=require('./native-charset-fixture');
const code=(op,a=0,b=0,c=0)=>[17,op,a,b,c,17];
function sample(extension='pxp',enabled=true,empty=false) {
 const offset=extension==='pxa'?5:0;
 const phrase=empty?[]:[...font(offset),...code(0x21,0,50),...code(0x22,176,48,32),...code(0x23,1),...Buffer.from('Fixed '),
  ...font(offset+1),...code(0x22),...code(0x23),...code(0x24,1),...code(0x25,1),...code(0x26,1),...Buffer.from('Phrase')];
 const file=native({extension,fonts:[{name:'Arial',charset:0},{name:'Courier New',charset:0}],
  body:extension==='pxa'?[]:[...font(0),...Buffer.from('First'),12,...Buffer.from('Second'),12,...Buffer.from('Third')],rhino:phrase});
 return Buffer.from(file.toString('latin1').replace('FolioRhinoEn=1',`FolioRhinoEn=${+enabled}\nFolioStartNum=0\nFolioNumTitleEn=0\nFolioNumJyonEn=1`),'latin1');
}
module.exports={sample};
