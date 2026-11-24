// Generated format fixtures with public font names; no original text or assets.
const {native,font}=require('./native-charset-fixture');
const glyph=(id,c)=>[20,0,id,c,0,20];
function sample(extension='pxp') {
 const offset=extension==='pxa'?5:0,f=id=>font(id+offset),g=(id,c)=>glyph(id+offset,c);
 const text=s=>[...Buffer.from(s,'ascii')];
 const stream=[...f(0),17,33,0,28,0,17,...text('Arial'),10,...f(1),...text('Mono'),10,
  ...f(0),65,...g(1,87),66,10,...f(2),33,...g(3,33),33,10,
  ...f(0),67,...g(2,33),68];
 return native({extension,fonts:[{name:'Arial',charset:0},{name:'Courier New',charset:0},
  {name:'TibetanMachine',charset:0},{name:'TibetanMachineSkt1',charset:0}],
  body:extension==='pxa'?[]:stream,note:stream,noteIndex:4});
}
module.exports={sample,glyph};
