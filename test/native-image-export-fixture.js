const {sample:document}=require('./native-document-export-fixture'),{png}=require('./image-dpi-fixture');
function sample(E){
 const d=document(E);d.assets=[{id:'pixels',data:'data:image/png;base64,'+png().toString('base64'),width:96,height:48}];
 d.images=[
  PechaImages.placement({id:'line',asset:'pixels',dpi:96,dpiY:48,scale:50,above:.2,space:.04,addTibetan:true}),
  PechaImages.placement({id:'yigo',asset:'pixels',kind:'yigo',dpi:192,dpiY:96,scale:75,above:.15,space:.02}),
  PechaImages.placement({id:'ignored',asset:'pixels',dpi:300,dpiY:150,scale:25,above:.1,ignoreDpi:true})
 ];
 d.yigo.image='yigo';d.yigo.enabled=true;
 d.text='{font:jomolhari 18}ཀ་ {font:family:Arial 18 b #c02030}Café {image:line} {font:jomolhari /b}ཀི་ བོད།{page}{font:family:Georgia 15 i}Second {image:line} {image:ignored} end';
 return d;
}
module.exports={sample};
