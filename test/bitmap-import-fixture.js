// Independent generated Windows DIBs, with row padding and a red/green/blue/yellow grid.
function bmp({width=17,height=9,topDown=false,bits=24,header=40,x=6000,y=3000}={}) {
 const colors=[[255,0,0],[0,255,0],[0,0,255],[255,255,0]],stride=Math.ceil(width*bits/32)*4,palette=bits===8?16:0,offset=14+header+palette;
 const b=Buffer.alloc(offset+stride*height);b.write('BM');b.writeUInt32LE(b.length,2);b.writeUInt32LE(offset,10);b.writeUInt32LE(header,14);
 b.writeInt32LE(width,18);b.writeInt32LE(topDown?-height:height,22);b.writeUInt16LE(1,26);b.writeUInt16LE(bits,28);b.writeUInt32LE(stride*height,34);b.writeInt32LE(x,38);b.writeInt32LE(y,42);
 if(bits===8){b.writeUInt32LE(4,46);colors.forEach(([r,g,blue],i)=>{b.set([blue,g,r,0],14+header+i*4);});}
 for(let row=0;row<height;row++)for(let col=0;col<width;col++){
  const visualY=topDown?row:height-1-row,index=(visualY<height/2?0:2)+(col<width/2?0:1),[r,g,blue]=colors[index],at=offset+row*stride+col*bits/8;
  if(bits===8)b[at]=index;else b.set(bits===32?[blue,g,r,0]:[blue,g,r],at);
 }
 return b;
}
// Indexed GIF with frequent clear codes: a simple independent LZW encoder.
// First frame is red/transparent, second green/blue. No external artwork.
function gif(animated=false){
 const width=48,height=24,b=Buffer.from('47494638396130001800810000ff000000ff000000ff000000','hex');
 const frame=(left,right,transparent)=>{
  const codes=[];for(let y=0;y<height;y++)for(let x=0;x<width;x++)codes.push(4,x<width/2?left:right);codes.push(5);
  const packed=Buffer.alloc(Math.ceil(codes.length*3/8));codes.forEach((code,i)=>{const bit=i*3;packed[bit>>3]|=code<<(bit%8);if(bit%8>5)packed[(bit>>3)+1]|=code>>(8-bit%8);});
  const blocks=[];for(let i=0;i<packed.length;i+=255){const part=packed.subarray(i,i+255);blocks.push(Buffer.from([part.length]),part);}
  return Buffer.concat([Buffer.from([0x21,0xf9,4,transparent?1:0,1,0,3,0,0x2c,0,0,0,0,width,0,height,0,0,2]),...blocks,Buffer.from([0])]);
 };
 return Buffer.concat([b,frame(0,3,true),...(animated?[frame(1,2,false)]:[]),Buffer.from([0x3b])]);
}
module.exports={bmp,gif};
