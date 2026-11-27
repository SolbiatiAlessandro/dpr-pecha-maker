const assert=require('node:assert/strict'),{inflateSync,crc32}=require('node:zlib');
// Independent PNG inspection: validate every chunk and inflate actual saved samples.
function inspect16(input){
 const b=Buffer.from(input),idat=[];let header,ended=false;
 assert.equal(b.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
 for(let at=8;at<b.length;){const n=b.readUInt32BE(at),end=at+n+12;assert(end<=b.length);const name=b.toString('ascii',at+4,at+8),data=b.subarray(at+8,end-4);assert.equal(b.readUInt32BE(end-4),crc32(b.subarray(at+4,end-4)));
  if(name==='IHDR'){assert.equal(at,8);header=data;}if(name==='IDAT')idat.push(data);if(name==='IEND'){assert.equal(end,b.length);ended=true;}at=end;
 }
 assert(ended&&header);assert.equal(header.length,13);assert.equal(header[8],16);assert([0,2].includes(header[9]));assert.deepEqual([...header.subarray(10)],[0,0,0]);
 const width=header.readUInt32BE(0),height=header.readUInt32BE(4),channels=header[9]===0?1:3,row=width*channels*2,data=inflateSync(Buffer.concat(idat)),samples=[];assert.equal(data.length,(row+1)*height);
 for(let y=0;y<height;y++){assert.equal(data[y*(row+1)],0);for(let x=0;x<width*channels;x++)samples.push(data.readUInt16BE(y*(row+1)+1+x*2));}
 return {width,height,channels,samples};
}
module.exports={inspect16};
