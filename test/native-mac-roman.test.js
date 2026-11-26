const assert=require('node:assert/strict');
global.PechaImages=require('../src/images');global.Folio=require('../src/folio');
const E=require('../src/engine'),P=require('../src/pxp'),T=require('../src/legacy-table'),D=require('../src/documents'),R=require('../src/rtf'),{bytes,text,sample,native,font}=require('./native-mac-roman-fixture');
const visible=s=>E.parseStream(s,false).filter(r=>r.k==='text').map(r=>r.s).join('');
// All high bytes independently decoded by Python's standard mac_roman codec.
const high='ÄÅÇÉÑÖÜáàâäãåçéèêëíìîïñóòôöõúùûü†°¢£§•¶ß®©™´¨≠ÆØ∞±≤≥¥µ∂∑∏π∫ªºΩæø¿¡¬√ƒ≈∆«»… ÀÃÕŒœ–—“”‘’÷◊ÿŸ⁄€‹›ﬁﬂ‡·‚„‰ÂÊÁËÈÍÎÏÌÓÔ\uf8ffÒÚÛÙıˆ˜¯˘˙˚¸˝˛ˇ';
const all=P.decodeStream(Uint8Array.from({length:128},(_,i)=>128+i),{0:'Times New Roman'},T,0,{0:77});
assert.equal(all.ev.map(e=>e.s||'').join(''),high);assert.deepEqual(all.unknown,{});assert.deepEqual(all.warnings,[]);
for(const extension of ['pxp','pxc','pxa']){
 const file=sample(extension),copy=Buffer.from(file),base=E.defaultDoc();base.text='KEEP';base.textSize=40;const before=JSON.stringify(base);
 const out=P.load(file,extension,T,base,E);assert.equal(JSON.stringify(base),before);assert.deepEqual(file,copy);assert.equal(out.unknown,0);assert(!out.warnings.some(w=>w.includes('unsupported')));
 assert.equal(visible(out.doc.notes.sets['body.front'].inL.text),text);assert.equal(visible(out.doc.folio.rhino),text);
 if(extension==='pxa'){assert.equal(out.doc.text,'KEEP');assert.equal(out.doc.textSize,40);assert.equal(P.parse(file).fontCharsets[5],77);}
 else{
  assert.equal(visible(out.doc.text),text);assert.equal(visible(out.doc.yigo.text),text);
  const run=E.parseStream(out.doc.text,false).find(r=>r.k==='text');assert.equal(run.style.size,24);assert.equal(run.style.bold,true);assert.equal(run.style.font,'family:Times%20New%20Roman');
  assert.equal(visible(R.read(R.write(out.doc,E),E,T).doc.text),text);
 }
 assert.equal(visible(D.normalize(D.artifact(out.doc,'document'),E).folio.rhino),text);
}
// Byte128 is Ä in Mac Roman and € in Windows1252; a framed override does not change the active font.
const switched=native({fonts:[{name:'Arial',charset:77},{name:'Arial',charset:0}],body:[128,20,0,1,128,0,20,128,...font(1),128]});
assert.equal(visible(P.load(switched,'pxp',T,E.defaultDoc(),E).doc.text),'Ä€Ä€');
const tib=P.decodeStream(Uint8Array.of(33),{0:'TibetanMachine'},T,0,{0:77});assert.equal(tib.ev[0].s,'ཀ');
const privateGlyph=E.defaultDoc();privateGlyph.text='\uf8ff';const before=JSON.stringify(privateGlyph);assert.throws(()=>P.writeContent(privateGlyph,E,T),/cannot encode U\+F8FF/);assert.equal(JSON.stringify(privateGlyph),before);
console.log('PASS: all128 Mac Roman high bytes, PXP/PXC/PXA scopes, body/notes/yi-go/phrase, typography/source isolation, font switching/framed glyphs, Tibetan priority, Save/RTF and private-use native export rejection');
