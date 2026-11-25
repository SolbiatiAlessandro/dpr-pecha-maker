// Independent synthetic framing data; no original text or assets.
const markerText='[END NON-BODY]\n[START TEMPLATE]\n[END TEMPLATE]';
function sample({extension='pxa',nl='\n',template=true,body='Imported body'}={}) {
 const raw=Buffer.concat([Buffer.from([17,32,extension==='pxa'?5:0,0,0,17]),Buffer.from(markerText)]);
 const header=extension==='pxa'?'.pxa 0.1 u1 u2 u3 u4 0 1 0 0 Arial\0':`.${extension} 0.6 0 u1 u2 u3 u4 ${Buffer.byteLength(body)} 0 1 0 0 Arial\0`;
 const chunks=[Buffer.from(header+nl+'[START NON-BODY]'+nl+'FolioStartNum=23'+nl+'PageStartNum=401'+nl)];
 const stream=(key,value)=>{chunks.push(Buffer.from(key+'.slen='+value.length+nl+key+'.s='+nl),value,Buffer.from(nl));};
 stream('AnnoInL[0]',raw);chunks.push(Buffer.from('AnnoInL[0].en=1'+nl+'AnnoInL[0].ptSz=16'+nl));
 for(const [side,text] of [['L','Outside left'],['R','Outside right']]){const key='AnnoOut'+side+'[4]';chunks.push(Buffer.from(key+'.en=1'+nl+key+'.ptSz=16'+nl+key+'.insetF=0.05'+nl));stream(key,Buffer.concat([Buffer.from([17,32,extension==='pxa'?5:0,0,0,17]),Buffer.from(text)]));}
 chunks.push(Buffer.from('[END NON-BODY]'+nl));
 if(template)chunks.push(Buffer.from(['[START TEMPLATE]','[PechaAnnotation]','AnnoOutLeftSpace=0.300000','AnnoOutRightSpace=0.450000','FolioNumPtSz=20','FolioNumInset=0.1','PageNumPtSz=12','PageNumInset=0.05','PageNumCenter=0','PageNumAngle=90','Marker=[END TEMPLATE]','[END TEMPLATE]',''].join(nl)));
 if(extension!=='pxa')chunks.push(Buffer.from(body));
 return Buffer.concat(chunks);
}
module.exports={sample,markerText};
