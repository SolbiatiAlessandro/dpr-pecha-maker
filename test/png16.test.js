const assert=require('node:assert/strict'),I=require('../src/images'),{inspect16}=require('./png16-fixture');
(async()=>{
 for(const kind of [2,3,5,6])for(const max of [256,1000,1023,4095,65535]){
  const channels=[3,6].includes(kind)?3:1,width=4,height=2,values=Array.from({length:width*height*channels},(_,i)=>[0,1,Math.floor(max/2),max-1,max,Math.min(257,max),Math.floor(max/3),Math.floor(max*2/3)][i%8]);
  const raw=Buffer.alloc(values.length*2);values.forEach((v,i)=>raw.writeUInt16BE(v,i*2));const b=Buffer.concat([Buffer.from(`P${kind}\n${width} ${height}\n${max}\n`),kind>3?raw:Buffer.from(values.join(' '))]),before=Buffer.from(b),bitmap=I.readPnm(b),png=await I.png16(bitmap);
  assert.deepEqual(inspect16(png),{width,height,channels,samples:values.map(v=>Number(BigInt(v)*65535n/BigInt(max)))});assert.deepEqual(b,before);
  assert.deepEqual(inspect16(I.pngWithResolution(png,{x:144,y:72})),inspect16(png));
 }
 const low=I.readPnm(Buffer.from('P2\n3 1\n10\n1 5 7'));assert.deepEqual([...low.data].filter((_,i)=>i%4===0),[25,127,178]);assert.equal(low.samples16,null);
 for(const over of [{width:0},{height:20001},{channels:4},{samples16:new Uint16Array(2)}])await assert.rejects(()=>I.png16({width:1,height:1,channels:1,samples16:new Uint16Array([1]),...over}),/Invalid/);
 const original=global.CompressionStream;try{global.CompressionStream=undefined;await assert.rejects(()=>I.png16({width:1,height:1,channels:1,samples16:new Uint16Array([1])}),/cannot preserve/);}finally{global.CompressionStream=original;}
 console.log('PASS: 16-bit grayscale/RGB PNG CRCs, inflated sample bytes, low-bit retention, native truncation at arbitrary maxima, density preservation and invalid/unsupported encoding');
})().catch(e=>{console.error(e);process.exitCode=1;});
