// Synthetic native streams; no original application assets.
function native(extension = 'pxp') {
  const annotation = Buffer.from([33, 11]);
  return Buffer.concat([
    Buffer.from(`.${extension} 0.1 u1 u2 u3 u4 0 0 0 0 0 TibetanMachine\0\n[START NON-BODY]\niNiT AnnoInL[0].slen=2\niNiT AnnoInL[0].s=\n`), annotation,
    Buffer.from('\niNiT Yigo.slen=2\niNiT Yigo.s=\n'), annotation,
    Buffer.from('\n[END NON-BODY]\n[START TEMPLATE]\n[END TEMPLATE]\n'),
    // Hard shad at the beginning also exercises pending font-size application.
    Buffer.from([17,33,0,40,0,17,11,13,33,11,32,11,13,33,202,32,202,12,33,11])
  ]);
}
module.exports = {native};
