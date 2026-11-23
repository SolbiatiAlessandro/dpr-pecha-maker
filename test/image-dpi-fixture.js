// Generated red/blue PNG and synthetic native records; no original application assets.
const {deflateSync} = require('node:zlib');
function png(x = 96, y = 48) {
  const chunk = (name, data) => {
    const body = Buffer.concat([Buffer.from(name), data]), result = Buffer.alloc(body.length + 8);
    result.writeUInt32BE(data.length); body.copy(result, 4);
    let crc = 0xffffffff;
    for (const byte of body) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
    result.writeUInt32BE((crc ^ 0xffffffff) >>> 0, result.length - 4); return result;
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(96); ihdr.writeUInt32BE(48, 4); ihdr[8] = 8; ihdr[9] = 2;
  const phys = Buffer.alloc(9); phys.writeUInt32BE(Math.round(x / .0254)); phys.writeUInt32BE(Math.round(y / .0254), 4); phys[8] = 1;
  const pixels = Buffer.alloc(48 * 289);
  for (let row = 0; row < 48; row++) for (let col = 0; col < 96; col++) pixels[row * 289 + 1 + col * 3 + (col < 48 ? 0 : 2)] = 255;
  return Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',ihdr),chunk('pHYs',phys),chunk('IDAT',deflateSync(pixels)),chunk('IEND',Buffer.alloc(0))]);
}
function native(x = 96, y = 48, old = false) {
  const image = png(), head = Buffer.from('.pxp\n[START NON-BODY]\niNiT YigoImageEn=1\niNiT YigoLineImageIndex=0\n[END NON-BODY]\n[START TEMPLATE]\n[END TEMPLATE]\nBefore ');
  let metadata;
  if (old) {
    const asset = Buffer.alloc(28), line = Buffer.alloc(40);
    asset.writeUInt32LE(image.length,8); asset.writeUInt16LE(x,24); asset.writeUInt16LE(y,26);
    line.writeInt32LE(100,8); line.writeDoubleLE(.03,20); line.writeDoubleLE(.3,28);
    metadata = Buffer.concat([Buffer.from(' after\n[START IMAGES] 1.0\nImageInfo_SizeOf=28\nImageInfoCount=1\n'),asset,
      Buffer.from('\nLineImageInfo_SizeOf=40\nLineImageInfoCount=1\n'),line,Buffer.from('\n')]);
  } else metadata = Buffer.from(` after\n[START IMAGES] 1.1\nImageInfoCount=1\nimageOffset=0\ncompSize=${image.length}\ndibXDPI=${x}\ndibYDPI=${y}\n[END IINFO 0]\nLineImageInfoCount=1\niInfoIndex=0\nscale=100\nyAdj_float=0.3\nsideSp_float=0.03\n[END LIINFO 0]\nPageImageInfoCount=1\niInfoIndex=0\nscale=100\npageNbr=1\nslot=2\n[END PIINFO 0]\n`);
  return Buffer.concat([head,Buffer.from([0x13,0,0,0,0,0x13]),metadata,Buffer.from(`Images_totalBytes=${image.length}\n`),image]);
}
module.exports = {png,native};
