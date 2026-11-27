// Independently generated Targa headers/pixels/RLE; no external artwork.
function tga({width=17,height=9,type=2,bits=24,origin=0,paletteBits=24,first=5,attrs,alphaType,footer=false,pixels}={}){
 const base=type&7,mapped=base===1,gray=base===3,depth=mapped?paletteBits:bits,capacity=gray?(bits===16?8:0):depth===32?8:depth===16?1:0;
 attrs??=capacity;const colors=[[255,0,0,255],[0,255,0,0],[0,0,255,128],[255,255,0,255]],levels=[0,85,170,255];
 const color=(rgba,n)=>{let [r,g,b,a]=rgba;if(alphaType===4){r=Math.round(r*a/255);g=Math.round(g*a/255);b=Math.round(b*a/255);}if(n===15||n===16){const value=(Math.round(r/255*31)<<10)|(Math.round(g/255*31)<<5)|Math.round(b/255*31)|(n===16&&a>=128?32768:0);const out=Buffer.alloc(2);out.writeUInt16LE(value);return out;}return Buffer.from(n===32?[b,g,r,a]:[b,g,r]);};
 const header=Buffer.alloc(18);header[0]=3;header[1]=mapped?1:0;header[2]=type;if(mapped){header.writeUInt16LE(first,3);header.writeUInt16LE(4,5);header[7]=paletteBits;}header.writeUInt16LE(width,12);header.writeUInt16LE(height,14);header[16]=bits;header[17]=origin|attrs;
 const map=mapped?Buffer.concat(colors.map(c=>color(c,paletteBits))):Buffer.alloc(0),rows=[];
 for(let row=0;row<height;row++){
  const line=[];
  for(let col=0;col<width;col++){
   const x=origin&16?width-1-col:col,y=origin&32?row:height-1-row,q=(y<height/2?0:2)+(x<width/2?0:1),rgba=pixels?.[y*width+x]||colors[q];
   if(mapped){const b=Buffer.alloc(bits/8);bits===8?b[0]=first+q:b.writeUInt16LE(first+q);line.push(b);}
   else if(gray)line.push(Buffer.from(bits===16?[levels[q],rgba[3]]:[levels[q]]));else line.push(color(rgba,bits));
  }
  if(type<9)rows.push(...line);else for(let i=0;i<line.length;){let run=1;while(run<128&&i+run<line.length&&line[i].equals(line[i+run]))run++;if(run>1){rows.push(Buffer.from([128+run-1]),line[i]);i+=run;}else{const start=i++;while(i<line.length&&i-start<128&&!(i+1<line.length&&line[i].equals(line[i+1])))i++;rows.push(Buffer.from([i-start-1]),...line.slice(start,i));}}
 }
 let result=Buffer.concat([header,Buffer.from('ID!'),map,...rows]);
 if(footer||alphaType!==undefined){const end=Buffer.alloc(26);end.write('TRUEVISION-XFILE.\0',8,'latin1');if(alphaType!==undefined){end.writeUInt32LE(result.length,0);const extension=Buffer.alloc(495);extension.writeUInt16LE(495);extension[494]=alphaType;result=Buffer.concat([result,extension]);}result=Buffer.concat([result,end]);}
 return result;
}
module.exports={tga};
