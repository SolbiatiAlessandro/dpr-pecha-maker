// Embedded PNG assets and independent placements. No image URLs are fetched by the renderer.
const PechaImages = (() => {
  const anchors = ['outer-left', 'inner-left', 'text-left', 'text-right', 'inner-right', 'outer-right'];
  const clamp = (v, lo, hi, fallback) => Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : fallback;
  function placement(over = {}) {
    return {id: '', asset: '', kind: 'inline', page: 1, anchor: 'text-left', scale: 100,
      dpi: 96, dpiY: null, ignoreDpi: false, above: .3, addTibetan: false, space: .03, down: 0, inward: 0, margin: .05, ...over};
  }
  // Fractions of the full image: positive edges crop; negative edges add blank space.
  function crop(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const result=Object.fromEntries(['left','right','top','bottom'].map(k=>[k,value[k]??0]));
    if (Object.values(result).some(n=>!Number.isFinite(n)||Math.abs(n)>20) ||
        result.left+result.right>=1-1e-8 || result.top+result.bottom>=1-1e-8) return null;
    return Object.values(result).some(n=>n!==0)?result:null;
  }
  function normalize(input) {
    const assets = [], images = [], seen = new Set();
    for (const a of (Array.isArray(input.assets) ? input.assets : []).slice(0, 200)) {
      if (!a || typeof a.id !== 'string' || !/^[\w-]+$/.test(a.id) || seen.has(a.id)) continue;
      if (typeof a.data !== 'string' || a.data.length > 12000000 || !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(a.data)) continue;
      assets.push({id: a.id, data: a.data, width: clamp(a.width, 1, 20000, 1), height: clamp(a.height, 1, 20000, 1)}); seen.add(a.id);
    }
    seen.clear();
    for (const x of (Array.isArray(input.images) ? input.images : []).slice(0, 1000)) {
      if (!x || typeof x.id !== 'string' || !/^[\w-]+$/.test(x.id) || seen.has(x.id) || !assets.some(a => a.id === x.asset)) continue;
      const p = placement({id: x.id, asset: x.asset, kind: ['inline','page','yigo'].includes(x.kind) ? x.kind : 'inline'});
      p.anchor = anchors.includes(x.anchor) ? x.anchor : 'text-left';
      p.page = Math.round(clamp(x.page, 1, 3000, 1)); p.scale = clamp(x.scale, p.kind === 'page' ? 20 : 10, 200, 100);
      p.dpi = clamp(x.dpi, 10, 2400, 96); p.ignoreDpi = x.ignoreDpi === true; p.addTibetan = x.addTibetan === true;
      p.dpiY = x.dpiY == null ? null : clamp(x.dpiY, 10, 2400, p.dpi);
      for (const k of ['above','down','inward']) p[k] = clamp(x[k], -30, 30, p[k]);
      for (const k of ['space','margin']) p[k] = clamp(x[k], 0, 20, p[k]);
      const cropping=crop(x.crop); if(cropping)p.crop=cropping;
      images.push(p); seen.add(p.id);
    }
    return {assets, images};
  }
  // Copy/move inline placement, sharing embedded pixels and resetting layout controls.
  function transferInline(doc, id, newId, section, cursor, move = false) {
    const original = doc.images.find(p => p.id === id && p.kind === 'inline');
    if (!original || doc.images.some(p => p.id === newId) || doc.images.length >= 1000) return null;
    const target = doc.sections.length ? doc.sections[section] : doc;
    if (!target) return null;
    const token = `{image:${id}}`;
    cursor = Math.max(0, Math.min(target.text.length, cursor));
    for (const m of target.text.matchAll(/\{[^}]*\}/g)) {
      if (cursor > m.index && cursor < m.index + m[0].length) { cursor = m.index + m[0].length; break; }
    }
    if (move) {
      const before = target.text.slice(0, cursor);
      cursor -= before.length - before.split(token).join('').length;
      doc.text = doc.text.split(token).join('');
      for (const s of doc.sections) s.text = s.text.split(token).join('');
      doc.images = doc.images.filter(p => p.id !== id);
    }
    const added = placement({id:newId, asset:original.asset, dpi:original.dpi, dpiY:original.dpiY ?? null});
    const cropping=crop(original.crop);if(cropping)added.crop=cropping;
    doc.images.push(added);
    const inserted = `{image:${newId}}`;
    target.text = target.text.slice(0,cursor) + inserted + target.text.slice(cursor);
    return {placement:added, cursor:cursor+inserted.length};
  }
  function dimensions(doc, p) {
    const asset = doc.assets.find(a => a.id === p.asset);
    if (!asset) return null;
    const dpiX = p.ignoreDpi ? 96 : p.dpi;
    const dpiY = p.ignoreDpi ? 96 : (p.dpiY ?? p.dpi);
    const fullW=asset.width*72/dpiX*p.scale/100, fullH=asset.height*72/dpiY*p.scale/100;
    const c=crop(p.crop), left=(c?.left||0)*fullW, right=(c?.right||0)*fullW,
      top=(c?.top||0)*fullH, bottom=(c?.bottom||0)*fullH;
    return {asset,w:fullW-left-right,h:fullH-top-bottom,fullW,fullH,left,right,top,bottom,crop:c};
  }
  function pageRect(doc, placement, boxes, type) {
    if (placement.kind !== 'page') return null;
    const size = dimensions(doc, placement); if (!size) return null;
    const {I, T, d, lx1, rx1} = boxes, anchor = placement.anchor, right = anchor.endsWith('right');
    if (anchor.startsWith('outer') && !type.sideOut) return null;
    if (anchor.startsWith('inner') && !type.sideIn) return null;
    const edge = anchor.startsWith('text') ? (right ? T.x1 : T.x0)
      : anchor.startsWith('outer') ? (right ? I.x1 - d : I.x0 + d)
      : (right ? rx1 - d : lx1 + d);
    return {...size, x: right ? edge - placement.inward * 72 - size.w : edge + placement.inward * 72,
      y: (anchor.startsWith('text') ? T.y0 : I.y0 + d) + placement.down * 72, placement};
  }
  // Keep raw density separate: native files distinguish an absent/relative
  // density from an explicitly zero axis, unlike direct web image insertion.
  function pngDensity(bytes) {
    if (bytes.length < 8 || bytes[0] !== 137 || bytes[1] !== 80) return null;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (let i = 8; i + 12 <= bytes.length;) {
      const len = view.getUint32(i); if (i + 12 + len > bytes.length) break;
      if (String.fromCharCode(...bytes.slice(i + 4, i + 8)) === 'pHYs' && len === 9) {
        return {x:view.getUint32(i + 8),y:view.getUint32(i + 12),unit:bytes[i + 16]};
      }
      i += len + 12;
    }
    return null;
  }
  function pngResolution(bytes) {
    const density=pngDensity(bytes);
    return density?.unit===1 && density.x>0 && density.y>0 ? {x:density.x*.0254,y:density.y*.0254} : null;
  }
  const pngDpi = bytes => pngResolution(bytes)?.x ?? null;

  // JPEG APP0/JFIF and APP1/Exif density. Decode pixels in the browser; read
  // only bounded metadata here. Thumbnail IFDs must not set the main image DPI.
  function jpegResolution(bytes) {
    if (bytes.length < 4 || bytes[0]!==255 || bytes[1]!==216) return null;
    const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
    let jfif=null, exif=null, orientation=1;
    const density=(x,y,scale)=>scale && x>0 && y>0 && Number.isFinite(x+y) ? {x:x*scale,y:y*scale} : null;
    const readExif = data => {
      if(data.length<8)return;
      const v=new DataView(data.buffer,data.byteOffset,data.byteLength);
      const order=v.getUint16(0), little=order===0x4949;
      if(![0x4949,0x4d4d].includes(order)||v.getUint16(2,little)!==42)return;
      const at=v.getUint32(4,little);
      if(at<8||at+2>data.length)return;
      const count=v.getUint16(at,little);
      if(at+2+count*12+4>data.length)return;
      let x=null,y=null,unit=2;
      for(let i=0;i<count;i++) {
        const p=at+2+i*12,tag=v.getUint16(p,little),type=v.getUint16(p+2,little);
        if(v.getUint32(p+4,little)!==1)continue;
        if(type===3) {
          const value=v.getUint16(p+8,little);
          if(tag===0x112 && value>=1 && value<=8)orientation=value;
          if(tag===0x128)unit=value;
        } else if(type===5 && (tag===0x11a||tag===0x11b)) {
          const offset=v.getUint32(p+8,little);
          if(offset<8||offset+8>data.length)continue;
          const denominator=v.getUint32(offset+4,little);
          const value=denominator ? v.getUint32(offset,little)/denominator : null;
          if(tag===0x11a)x=value;else y=value;
        }
      }
      exif ||= density(x,y,unit===2?1:unit===3?2.54:0);
    };
    for(let i=2;i<bytes.length;) {
      if(bytes[i++]!==255)break;
      while(bytes[i]===255)i++;
      const marker=bytes[i++];
      if(marker===0xda||marker===0xd9||marker===undefined)break;
      if(marker===0x01||(marker>=0xd0&&marker<=0xd7))continue;
      if(i+2>bytes.length)break;
      const length=view.getUint16(i),end=i+length;
      if(length<2||end>bytes.length)break;
      const data=bytes.subarray(i+2,end);
      if(marker===0xe0 && data.length>=14 && String.fromCharCode(...data.subarray(0,5))==='JFIF\0') {
        const v=new DataView(data.buffer,data.byteOffset,data.byteLength);
        jfif ||= density(v.getUint16(8),v.getUint16(10),data[7]===1?1:data[7]===2?2.54:0);
      }
      if(marker===0xe1 && data.length>=6 && String.fromCharCode(...data.subarray(0,6))==='Exif\0\0')readExif(data.subarray(6));
      i=end;
    }
    const result=exif||jfif;
    // Image.decode/drawImage apply Exif orientation, so density must follow it.
    return result && (orientation>=5 ? {x:result.y,y:result.x} : result);
  }

  // Stamp converted PNG pixels with their source density; Download PNG then
  // retains the same physical dimensions. Existing PNG uploads stay byte-exact.
  function pngWithResolution(bytes, resolution) {
    if(!resolution || ![resolution.x,resolution.y].every(n=>Number.isFinite(n)&&n>0&&n/.0254<=0xffffffff))return bytes;
    if(bytes.length<33||String.fromCharCode(...bytes.subarray(0,8))!=='\x89PNG\r\n\x1a\n')throw new Error('Invalid converted PNG.');
    const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),chunks=[];
    let ended=false;
    for(let i=8;i+12<=bytes.length;) {
      const length=view.getUint32(i),end=i+12+length;
      if(end>bytes.length)throw new Error('Incomplete converted PNG.');
      const name=String.fromCharCode(...bytes.subarray(i+4,i+8));
      if(i===8 && (name!=='IHDR'||length!==13))throw new Error('Invalid converted PNG header.');
      if(name!=='pHYs')chunks.push(bytes.subarray(i,end));
      i=end;
      if(name==='IEND'){ended=i===bytes.length;break;}
    }
    if(!ended)throw new Error('Incomplete converted PNG.');
    const phys=new Uint8Array(21),v=new DataView(phys.buffer);v.setUint32(0,9);phys.set([112,72,89,115],4);
    v.setUint32(8,Math.max(1,Math.round(resolution.x/.0254)));v.setUint32(12,Math.max(1,Math.round(resolution.y/.0254)));phys[16]=1;
    let crc=0xffffffff;
    for(const b of phys.subarray(4,17)){crc^=b;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
    v.setUint32(17,(crc^0xffffffff)>>>0);
    chunks.splice(1,0,phys);
    const result=new Uint8Array(8+chunks.reduce((n,c)=>n+c.length,0));result.set(bytes.subarray(0,8));let offset=8;
    for(const chunk of chunks){result.set(chunk,offset);offset+=chunk.length;}
    return result;
  }
  return {anchors, placement, crop, normalize, dimensions, pageRect, pngDpi, pngDensity, pngResolution, jpegResolution, pngWithResolution, transferInline};
})();
if (typeof module !== 'undefined') module.exports = PechaImages;
