function pnm(kind,{width=17,height=9,max=255}={}) {
 const mono=kind===1||kind===4,rgb=kind===3||kind===6;
 const header=Buffer.from(`P${kind}\n# generated independent fixture\n${width}\t${height}\n${mono?'':max+'\n'}`),samples=[];
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const quadrant=(y<height/2?0:2)+(x<width/2?0:1);
  if(mono)samples.push([1,0,0,1][quadrant]);
  else if(rgb)samples.push(...[[max,0,0],[0,max,0],[0,0,max],[max,max,0]][quadrant]);
  else samples.push([0,Math.round(max/3),Math.round(max*2/3),max][quadrant]);
 }
 let body;
 if(kind<=3)body=Buffer.from(samples.join(' ')+'\n');
 else if(kind===4){const stride=Math.ceil(width/8);body=Buffer.alloc(stride*height,255);samples.forEach((v,i)=>{const x=i%width,y=Math.floor(i/width),mask=1<<(7-(x&7));if(!v)body[y*stride+(x>>3)]&=~mask;});}
 else if(max<256)body=Buffer.from(samples);
 else{body=Buffer.alloc(samples.length*2);samples.forEach((v,i)=>body.writeUInt16BE(v,i*2));}
 return Buffer.concat([header,body]);
}
module.exports={pnm};
