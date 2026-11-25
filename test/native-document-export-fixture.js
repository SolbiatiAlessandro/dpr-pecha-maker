const {sample:content}=require('./native-content-export-fixture');
function sample(E){
 const d=content(E);d.flow=false;d.paper={name:'Custom',w:14,h:8.5};d.pecha.perSheet=2;
 d.margins={left:.6,right:.8,top:.1,bottom:.2};d.pecha.dlt=.04;d.tabWidth=.4;d.tibetanRaise=.03;
 d.pageNum.font='Verdana';d.pageNum.size=11;d.pageNum.position='center';d.pageNum.angle=0;
 for(const [i,t] of Object.values(d.types).entries()){t.baseline=[.35,.4,.45][i];t.color='#1256ab';t.lines=4+i;}
 return d;
}
module.exports={sample};
