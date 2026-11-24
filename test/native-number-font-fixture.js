// Synthetic file fixtures; no original text or font assets.
const {native,font}=require('./native-charset-fixture');
function sample({extension='pxp',name='Courier New',index=1,withTemplate=true}={}) {
 const b=native({extension,fonts:[{name:'Arial',charset:0},{name,charset:0}],body:extension==='pxa'?[]:[...font(0),...Buffer.from('First\fSecond\fThird')]});
 const marker=Buffer.from('[END NON-BODY]\n'),end=b.indexOf(marker)+marker.length;
 const template=withTemplate?`[START TEMPLATE]\n\n[PechaAnnotation]\nPageNumFIndex=${index}\nPageNumPtSz=16\nPageNumInset=0.1\nPageNumCenter=1\nPageNumAngle=90\n[END TEMPLATE]\n`:'';
 return Buffer.concat([b.subarray(0,end),Buffer.from(template),b.subarray(end)]);
}
module.exports={sample};
