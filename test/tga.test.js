const assert=require('node:assert/strict'),I=require('../src/images'),{tga}=require('./tga-fixture');
const corners=r=>[[1,1],[r.width-2,1],[1,r.height-2],[r.width-2,r.height-2]].map(([x,y])=>[...r.data.subarray((y*r.width+x)*4,(y*r.width+x)*4+4)]);
for(const type of [1,2,3,9,10,11])for(const origin of [0,16,32,48]){
 const base=type&7;
 for(const bits of base===1?[8,16]:base===3?[8,16]:[15,16,24,32])for(const paletteBits of base===1?[15,16,24,32]:[24]){
  const b=tga({type,origin,bits,paletteBits}),before=Buffer.from(b),r=I.readTga(b),depth=base===1?paletteBits:bits,alpha=base===3?bits===16:depth===16||depth===32;
  const expected=base===3?[[0,0,0,255],[85,85,85,alpha?0:255],[170,170,170,alpha?128:255],[255,255,255,255]]:[[255,0,0,255],[0,255,0,alpha?0:255],[0,0,255,alpha?(depth===16?255:128):255],[255,255,0,255]];
  assert.deepEqual(corners(r),expected,JSON.stringify({type,origin,bits,paletteBits}));assert.deepEqual(I.readTga(Buffer.concat([Buffer.alloc(5),b]).subarray(5)),r);assert.deepEqual(b,before);
  if(origin===0&&paletteBits===24)for(let n=0;n<b.length;n++)assert.throws(()=>I.readTga(b.subarray(0,n)),`truncated ${type}/${bits}/${n}`);
 }
}
for(const alphaType of [0,1,2,3,4]){const r=I.readTga(tga({bits:32,alphaType}));assert.deepEqual(corners(r).map(c=>c[3]),alphaType<2?[255,255,255,255]:[255,0,128,255]);if(alphaType===4)assert.deepEqual(corners(r)[2],[0,0,255,128]);}
assert.deepEqual(corners(I.readTga(tga({bits:32,attrs:0}))).map(c=>c[3]),[255,255,255,255]);
assert.equal(I.sourceFormat(tga()),null);assert.equal(I.sourceFormat(tga(),'art.TARGA'),'tga');assert.equal(I.sourceFormat(tga({footer:true})),'tga');
const strip=tga({width:260,height:1,type:10,bits:24,pixels:Array.from({length:260},(_,i)=>i<128?[255,0,0,255]:[i%2*255,0,255,255])});assert.equal(I.readTga(strip).data.length,1040);assert.deepEqual([...I.readTga(strip).data.subarray(128*4,128*4+4)],[0,0,255,255]);
const extraMap=tga({type:1});extraMap[2]=2;extraMap[16]=24;assert.deepEqual(corners(I.readTga(Buffer.concat([extraMap.subarray(0,33),tga().subarray(21)]))),corners(I.readTga(tga())),'unused true-color palette is skipped');
const grayPremult=tga({width:1,height:1,type:3,bits:16,alphaType:4});grayPremult[21]=64;grayPremult[22]=128;assert.deepEqual([...I.readTga(grayPremult).data],[128,128,128,128]);
const rgb555=tga({width:1,height:1,bits:15,pixels:[[123,82,41,255]]});assert.deepEqual([...I.readTga(rgb555).data],[123,82,41,255]);
for(let i=0;i<260;i++)assert.deepEqual([...I.readTga(strip).data.subarray(i*4,i*4+4)],i<128?[255,0,0,255]:[i%2*255,0,255,255]);
for(const mutate of [b=>b[2]=0,b=>b[17]=64,b=>b[16]=12,b=>b.writeUInt16LE(0,12),b=>b.writeUInt16LE(20001,12),b=>b[0]=255,b=>b[17]=4]){const b=tga();mutate(b);assert.throws(()=>I.readTga(b));}
const over=tga({width:1,height:1,type:10});over[21]=255;assert.throws(()=>I.readTga(over));
const badIndex=tga({type:1,bits:8});badIndex[33]=4;assert.throws(()=>I.readTga(badIndex));
for(const mutate of [b=>b.writeUInt32LE(b.length-25,b.length-26),b=>b.writeUInt32LE(1,b.length-26),b=>b[b.length-27]=5,b=>b.writeUInt16LE(494,b.readUInt32LE(b.length-26))]){const b=tga({alphaType:3,bits:32});mutate(b);assert.throws(()=>I.readTga(b));}
// Metadata cannot supply missing image bytes.
const missing=tga({width:1,height:1,alphaType:3,bits:32});missing.writeUInt16LE(2,12);assert.throws(()=>I.readTga(missing));
console.log('PASS: Targa six types, raw/RLE packets, palettes/index origins, gray/15/16/24/32bit pixels, all four orientations, alpha types/premultiplication, footer detection, bounds and every truncated raster prefix');
