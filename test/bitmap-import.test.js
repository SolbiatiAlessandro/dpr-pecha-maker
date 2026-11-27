const assert=require('node:assert/strict'),I=require('../src/images'),F=require('./bitmap-import-fixture');
for(const header of [40,52,56,108,124])for(const topDown of [false,true]){
 const bytes=F.bmp({header,topDown});assert.equal(I.sourceFormat(bytes),'bmp');assert.deepEqual(I.bmpResolution(bytes),{x:152.4,y:76.2});
 assert.deepEqual(I.bmpResolution(Buffer.concat([Buffer.alloc(3),bytes]).subarray(3)),{x:152.4,y:76.2});
 for(let n=0;n<14+header;n++)assert.equal(I.bmpResolution(bytes.subarray(0,n)),null);
}
for(const [x,y] of [[0,3000],[6000,0],[-1,3000],[6000,-1]])assert.equal(I.bmpResolution(F.bmp({x,y})),null);
for(const header of [12,64,2000]){const b=F.bmp();b.writeUInt32LE(header,14);assert.equal(I.bmpResolution(b),null);}
for(const offset of [0,53,0xffffffff]){const b=F.bmp();b.writeUInt32LE(offset,10);assert.equal(I.bmpResolution(b),null);}
assert.equal(I.sourceFormat(F.gif()),'gif');assert.equal(I.sourceFormat(F.gif(true)),'gif');
for(const [signature,type] of [['89504e470d0a1a0a','png'],['ffd8ff','jpeg'],['474946383761','gif'],['524946460000000057454250','webp']])assert.equal(I.sourceFormat(Buffer.from(signature,'hex')),type);
for(const invalid of ['', 'GIF90a','<svg></svg>','RIFF0000WAVE','\x89PNGxxxx'])assert.equal(I.sourceFormat(Buffer.from(invalid)),null);
assert.equal(I.bmpResolution(F.gif()),null);
console.log('PASS: BMP INFO/V2/V3/V4/V5 DPI, byte offsets, signed/absent axes, bounded invalid headers, GIF/PNG/JPEG/WebP byte identification');
