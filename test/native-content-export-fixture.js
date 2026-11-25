const {sample:annotations}=require('./native-annotation-export-fixture');
function sample(E){
 const d=annotations(E);
 d.text='{font:family:Arial 18 b #c02030 l}Café €{font:jomolhari /b #0044aa} ཀི་ བོད།\n{font:family:Georgia 15 i u s #000000 c}Second\tline{page}{/i /u /s 18 r}Third{hs}';
 d.yigo.text='{font:jomolhari #0044aa}ཀི་';d.yigo.rich=true;d.yigo.enabled=true;d.yigo.fancyStart=false;d.yigo.title2=true;
 d.shad={enabled:false,yang:false,ignoreYigo:true,titlePages:true};
 d.dzog={enabled:true,rise:.08,percentEnabled:true,percent:25,leftUp:.03,rightUp:.04};
 return d;
}
module.exports={sample};
