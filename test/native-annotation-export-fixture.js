function sample(E){
 const d=E.defaultDoc();d.text='Keep body ཀ་';d.counts={title:0,fancy:0};d.yigo.enabled=false;d.dzog.enabled=false;d.font='"Arial",serif';
 d.folio={...d.folio,start:23,size:15,rhino:'ཀི་ བོད།',rhinoEnabled:true,inset:.45};d.pageNum={...d.pageNum,start:401,size:12,font:'Courier New'};d.notes.outLeft=.3;d.notes.outRight=.45;
 const sides=['title.front','title.back','fancy.front','fancy.back','body.front','body.back'];
 for(const [i,side] of sides.entries())for(const [j,position] of ['inL','inR','outL','outR'].entries())d.notes.sets[side][position]={text:`{font:family:Arial b #a02010}Café${i}${j} {font:family:Courier%20New /b i u s #2040a0}བཀྲ་ཤིས།`,rich:true,on:true,size:12,inset:.1};
 for(const side of ['title.front','fancy.front','body.front'])d.notes.sets[side].inB={text:'Lower ཀི་',rich:false,on:true,size:12,inset:.1};
 return d;
}
module.exports={sample};
