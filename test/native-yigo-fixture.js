const {native,font}=require('./native-charset-fixture');
const code=(op,a=0,b=0,c=0)=>[17,op,a,b,c,17];
const fonts=[{name:'TibetanMachine',charset:0},{name:'Arial',charset:0},{name:'Courier New',charset:0}];
const yigo=[...font(1),...code(0x21,0,5),...code(0x23,1),...Buffer.from('Dflt '),...code(0x22,176,48,32),...Buffer.from('Red '),...font(2),...code(0x22),...Buffer.from('Black ')];
function sample(extension='pxp',ornament=yigo) {
 return native({extension,fonts,body:[...font(0),...code(0x21,0,40),...code(0x22,18,52,86),33,45,12,33,45,12,33,45],yigo:ornament});
}
module.exports={sample,yigo,fonts,code};
