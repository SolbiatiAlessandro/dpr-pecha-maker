const {sample:images}=require('./native-image-export-fixture');
function sample(E){
 const d=images(E);d.text+='{page}{font:jomolhari 18 /i}ཀི་ བོད། {font:family:Arial}Third';
 for(const t of Object.values(d.types)){t.sideIn=.5;t.sideOut=.5;}
 PechaImages.anchors.forEach((anchor,i)=>d.images.push(PechaImages.placement({id:'page-'+i,asset:'pixels',kind:'page',page:[1,2,3,3,2,1][i],anchor,scale:25,dpi:96,dpiY:48,down:.12,inward:.06,margin:.04})));
 return d;
}
module.exports={sample};
