const assert=require('node:assert/strict'),I=require('../src/images'),F=require('./pnm-fixture');
const corners=r=>[[1,1],[r.width-2,1],[1,r.height-2],[r.width-2,r.height-2]].map(([x,y])=>[...r.data.subarray((y*r.width+x)*4,(y*r.width+x)*4+4)]);
for(let kind=1;kind<=6;kind++)for(const max of [3,15,255,1023,65535]){
 const b=F.pnm(kind,{max}),r=I.readPnm(b);assert.equal(I.sourceFormat(b),'pnm');assert.deepEqual([r.width,r.height],[17,9]);
 const expected=[1,4].includes(kind)?[[0,0,0,255],[255,255,255,255],[255,255,255,255],[0,0,0,255]]:[2,5].includes(kind)?[[0,0,0,255],[85,85,85,255],[170,170,170,255],[255,255,255,255]]:[[255,0,0,255],[0,255,0,255],[0,0,255,255],[255,255,0,255]];
 assert.deepEqual(corners(r),expected);assert.deepEqual(I.readPnm(Buffer.concat([Buffer.alloc(3),b]).subarray(3)),r);
 if(kind>=4){assert.deepEqual(I.readPnm(Buffer.concat([b,b])),r,'first raw image only');for(let n=0;n<b.length;n++)assert.throws(()=>I.readPnm(b.subarray(0,n)));}
}
const decode=s=>I.readPnm(Buffer.from(s,'latin1'));
assert.deepEqual([...decode('P1\n4 1\n0101').data],[255,255,255,255,0,0,0,255,255,255,255,255,0,0,0,255]);
assert.deepEqual([...decode('P5\n4 1\n255\n#\n\r ').data].filter((_,i)=>i%4===0),[35,10,13,32],'binary bytes cannot be skipped as comments/space');
assert.equal(decode('P5\n1 1\n255# final header comment\n\x80').data[0],128);
assert.equal(decode('P5\r\n1\r\n1\r\n255\r\n').data[0],10,'exactly one delimiter; LF after CR can be a pixel');
assert.equal(decode('P2\n# comment\r1 1\n15\n# raster comment\n7').data[0],119);
for(const s of ['P7\n1 1\n','P5\n0 1\n255\n','P6\n20001 1\n255\n','P6\n4001 4000\n255\n','P2\n1 1\n0\n0','P2\n1 1\n65536\n0','P2\n1 1\n15\n16','P1\n1 1\n2','P5\n1 1\n15\n\xff','P6\n1 1\n255\n\0\0','P2\n-1 1\n255\n0','P2\n1x 1\n255\n0'])assert.throws(()=>decode(s));
console.log('PASS: all six Netpbm variants, 1–16bit sample ranges, PBM polarity/row padding/compact ASCII, comments/binary boundaries, first image, endian scaling and bounded malformed input');
