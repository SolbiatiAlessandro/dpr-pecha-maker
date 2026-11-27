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

  function sourceFormat(bytes, name='') {
    const prefix=String.fromCharCode(...bytes.subarray(0,12));
    if(prefix.startsWith('\x89PNG\r\n\x1a\n'))return 'png';
    if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'jpeg';
    if(prefix.startsWith('GIF87a')||prefix.startsWith('GIF89a'))return 'gif';
    if(prefix.startsWith('BM'))return 'bmp';
    if(prefix.startsWith('RIFF')&&prefix.slice(8,12)==='WEBP')return 'webp';
    if(/^P[1-6][\t\n\v\f\r ]/.test(prefix))return 'pnm';
    // Original TGA has no magic number. Require its filename extension unless
    // the version2 footer positively identifies the format.
    if((bytes.length>=26&&String.fromCharCode(...bytes.subarray(-18))==='TRUEVISION-XFILE.\0')||/\.(tga|targa)$/i.test(name))return 'tga';
    return null;
  }
  function readTga(bytes) {
    const bad=()=>{throw new Error('Invalid, incomplete or unsupported Targa image.');};
    if(bytes.length<18||bytes.length>8000000)bad();
    const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),type=bytes[2],base=type&7,rle=type>=9;
    if(![1,2,3,9,10,11].includes(type)||bytes[1]>1||(bytes[17]&192))bad();
    const width=v.getUint16(12,true),height=v.getUint16(14,true),bits=bytes[16],attrs=bytes[17]&15;
    if(!width||!height||width>20000||height>20000||width*height>16000000)throw new Error('Choose an image with at most 20000 pixels per side and 16 million pixels.');
    const mapped=base===1,gray=base===3,paletteBits=bytes[7],first=v.getUint16(3,true),count=v.getUint16(5,true);
    if(mapped ? bytes[1]!==1||![8,16].includes(bits) : gray ? ![8,16].includes(bits) : ![15,16,24,32].includes(bits))bad();
    if(bytes[1]&&(!count||first+count>65536||![15,16,24,32].includes(paletteBits)))bad();
    const colorBits=mapped?paletteBits:bits,alphaBits=gray?(bits===16?8:0):colorBits===32?8:colorBits===16?1:0;
    if(attrs!==0&&attrs!==alphaBits)bad();
    let at=18+bytes[0],limit=bytes.length,alphaType=null;
    if(bytes.length>=26&&String.fromCharCode(...bytes.subarray(-18))==='TRUEVISION-XFILE.\0'){
      const footer=bytes.length-26,extension=v.getUint32(footer,true),developer=v.getUint32(footer+4,true);limit=footer;
      for(const offset of [extension,developer])if(offset){if(offset<18||offset>=footer)bad();limit=Math.min(limit,offset);}
      if(extension){
        if(extension+495>footer)bad();const size=v.getUint16(extension,true);if(size<495||extension+size>footer)bad();
        alphaType=bytes[extension+494];if(alphaType>4)bad();
        for(const field of [482,486,490]){const offset=v.getUint32(extension+field,true);if(offset){if(offset<18||offset>=footer)bad();limit=Math.min(limit,offset);}}
      }
    }
    const alpha=alphaBits>0&&(alphaType===null?(attrs>0||(mapped&&paletteBits===32)):alphaType>=2);
    const color=(pos,depth,isGray=false)=>{
      let r,g,b,a=255;
      if(isGray){r=g=b=bytes[pos];if(alpha)a=bytes[pos+1];}
      else if(depth===15||depth===16){const n=v.getUint16(pos,true),expand=x=>(x<<3)|(x>>2);r=expand((n>>10)&31);g=expand((n>>5)&31);b=expand(n&31);if(alpha)a=n&32768?255:0;}
      else {b=bytes[pos];g=bytes[pos+1];r=bytes[pos+2];if(alpha)a=bytes[pos+3];}
      if(alpha&&alphaType===4){if(a){r=Math.min(255,Math.round(r*255/a));g=Math.min(255,Math.round(g*255/a));b=Math.min(255,Math.round(b*255/a));}else r=g=b=0;}
      return [r,g,b,a];
    };
    const palette=[];
    if(bytes[1]){const size=Math.ceil(paletteBits/8);if(at+count*size>limit)bad();if(mapped)for(let i=0;i<count;i++)palette.push(color(at+i*size,paletteBits));at+=count*size;}
    const size=Math.ceil(bits/8),total=width*height;
    if(at>limit||(!rle&&at+total*size>limit))bad();
    const data=new Uint8ClampedArray(total*4);
    const pixel=()=>{
      if(at+size>limit)bad();let value;
      if(mapped){const index=(bits===8?bytes[at]:v.getUint16(at,true))-first;if(index<0||index>=count)bad();value=palette[index];}
      else value=color(at,bits,gray);at+=size;return value;
    };
    let written=0;
    const put=value=>{const col=written%width,row=Math.floor(written/width),x=bytes[17]&16?width-1-col:col,y=bytes[17]&32?row:height-1-row;data.set(value,(y*width+x)*4);written++;};
    while(written<total){
      if(!rle){put(pixel());continue;}
      if(at>=limit)bad();const packet=bytes[at++],length=(packet&127)+1;if(written+length>total)bad();
      if(packet&128){const value=pixel();for(let i=0;i<length;i++)put(value);}else for(let i=0;i<length;i++)put(pixel());
    }
    return {width,height,data};
  }
  function readPnm(bytes) {
    const bad=()=>{throw new Error('Invalid or incomplete PBM, PGM or PPM image.');};
    if(sourceFormat(bytes)!=='pnm'||bytes.length>8000000)bad();
    const kind=bytes[1]-48,mono=kind===1||kind===4,rgb=kind===3||kind===6,raw=kind>=4;
    const white=b=>b===32||(b>=9&&b<=13);
    let at=2;
    const comment=()=>{while(at<bytes.length&&bytes[at]!==10&&bytes[at]!==13)at++;};
    const skip=()=>{while(at<bytes.length){if(white(bytes[at]))at++;else if(bytes[at]===35)comment();else break;}};
    const number=()=>{
      skip();const start=at;let value=0;
      while(bytes[at]>=48&&bytes[at]<=57){value=value*10+bytes[at++]-48;if(value>0x7fffffff)bad();}
      if(at===start||(at<bytes.length&&!white(bytes[at])&&bytes[at]!==35))bad();
      return value;
    };
    const width=number(),height=number(),max=mono?1:number();
    if(!width||!height||width>20000||height>20000||width*height>16000000)throw new Error('Choose an image with at most 20000 pixels per side and 16 million pixels.');
    if(!max||max>65535)bad();
    const channels=rgb?3:1,sampleBytes=max>255?2:1,stride=Math.ceil(width/8);
    if(raw){
      // Consume exactly the raster delimiter. Whitespace and # after it are
      // pixel bytes, not more header text. A comment may precede the delimiter.
      if(bytes[at]===35)comment();
      if(!white(bytes[at]))bad();at++;
      const needed=mono?stride*height:width*height*channels*sampleBytes;
      if(at+needed>bytes.length)bad();
    }
    // Every plain non-monochrome sample needs a digit and a separator (except
    // the last). Reject impossible rasters before allocating decoded buffers.
    if(!raw&&!mono&&bytes.length-at<width*height*channels*2-1)bad();
    const start=at,data=new Uint8ClampedArray(width*height*4);
    const samples16=max>255?new Uint16Array(width*height*channels):null;let nextSample=0;
    const sample=()=>{
      let value;
      if(raw){value=bytes[at++];if(sampleBytes===2)value=value*256+bytes[at++];}
      else if(mono){skip();value=bytes[at++]-48;}else value=number();
      if(!Number.isInteger(value)||value<0||value>max)bad();
      // The bundled decoder scales to the full channel range and truncates.
      if(samples16)samples16[nextSample++]=Math.floor(value*65535/max);
      return mono?(1-value)*255:Math.floor(value*255/max);
    };
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const p=(y*width+x)*4;
      const first=raw&&mono ? ((bytes[start+y*stride+(x>>3)]>>(7-(x&7)))&1?0:255) : sample();
      data[p]=first;data[p+1]=rgb?sample():first;data[p+2]=rgb?sample():first;data[p+3]=255;
    }
    // Netpbm permits concatenated raw images. Insertion uses the first image.
    return {width,height,data,samples16,channels};
  }
  // Canvas PNG serialization is 8-bit. Encode high-depth Netpbm samples
  // directly so Save, Download PNG and native/RTF exports retain low bits.
  async function png16({width,height,samples16,channels}) {
    if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>20000||height>20000||width*height>16000000||
        ![1,3].includes(channels)||!(samples16 instanceof Uint16Array)||samples16.length!==width*height*channels)throw new Error('Invalid 16-bit image.');
    if(typeof CompressionStream==='undefined')throw new Error('This browser cannot preserve 16-bit images. Use a browser with CompressionStream support.');
    const row=width*channels*2,scanlines=new Uint8Array((row+1)*height);
    for(let y=0;y<height;y++)for(let x=0;x<width*channels;x++){
      const value=samples16[y*width*channels+x],at=y*(row+1)+1+x*2;
      scanlines[at]=value>>>8;scanlines[at+1]=value&255;
    }
    const compressed=new Uint8Array(await new Response(new Blob([scanlines]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer());
    const chunk=(name,data)=>{
      const result=new Uint8Array(data.length+12),view=new DataView(result.buffer);view.setUint32(0,data.length);
      result.set([...name].map(c=>c.charCodeAt(0)),4);result.set(data,8);
      let crc=0xffffffff;
      for(const b of result.subarray(4,-4)){crc^=b;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
      view.setUint32(result.length-4,(crc^0xffffffff)>>>0);return result;
    };
    const header=new Uint8Array(13),view=new DataView(header.buffer);view.setUint32(0,width);view.setUint32(4,height);header[8]=16;header[9]=channels===1?0:2;
    const parts=[new Uint8Array([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',compressed),chunk('IEND',new Uint8Array())];
    const bytes=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let at=0;for(const part of parts){bytes.set(part,at);at+=part.length;}return bytes;
  }
  function bmpResolution(bytes) {
    if(bytes.length<54||bytes[0]!==66||bytes[1]!==77)return null;
    const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),header=v.getUint32(14,true),pixels=v.getUint32(10,true);
    // Windows INFO/V2/V3/V4/V5 headers share these signed pixels/metre fields.
    // OS/2 CORE and other header variants have no supported absolute density here.
    if(![40,52,56,108,124].includes(header)||14+header>bytes.length||pixels<14+header||pixels>bytes.length)return null;
    const x=v.getInt32(38,true),y=v.getInt32(42,true);
    return x>0&&y>0?{x:x*.0254,y:y*.0254}:null;
  }

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
  return {anchors, placement, crop, normalize, dimensions, pageRect, pngDpi, pngDensity, pngResolution, sourceFormat, readPnm, readTga, png16, bmpResolution, jpegResolution, pngWithResolution, transferInline};
})();
if (typeof module !== 'undefined') module.exports = PechaImages;
