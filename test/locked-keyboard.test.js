const assert=require('node:assert/strict');
global.PechaImages=require('../src/images');global.Folio=require('../src/folio');
const E=require('../src/engine'),F=require('../src/text-format'),D=require('../src/documents'),R=require('../src/rtf'),T=require('../src/legacy-table');
const pref={font:'Arial',size:19,color:'#b03020',bold:true,italic:true,underline:false,strike:false};
const runs=s=>E.parseStream(s,false).filter(r=>r.k==='text'),plain=s=>runs(s).map(r=>r.s).join('');
const source='{font:family:Georgia 14 /b /i #0044aa l}AB{font:family:Courier%20New 27 b c}CD';
let at=source.indexOf('AB')+1,result=F.insertLocked(source,at,at,'xy',pref,E);
assert.equal(plain(result.text),'AxyBCD');
const inserted=runs(result.text).find(r=>r.s==='xy');assert(inserted);for(const k of ['size','color','bold','italic','underline','strike'])assert.equal(inserted.style[k],pref[k]);assert.equal(inserted.style.font,E.fontToken('Arial'));assert.equal(inserted.style.align,'l');
assert.equal(runs(result.text).find(r=>r.s==='B').style.size,14);assert.equal(runs(result.text).find(r=>r.s==='CD').style.size,27);
const second=F.insertLocked(result.text,result.cursor,result.cursor,'z',pref,E);assert.equal(plain(second.text),'AxyzBCD');assert.equal(second.replacement,'z');
const end=source.indexOf('CD')+1,replaced=F.insertLocked(source,at,end,'Z',pref,E);assert.equal(plain(replaced.text),'AZD');const tail=runs(replaced.text).at(-1);assert.equal(tail.s,'D');assert.equal(tail.style.size,27);assert.equal(tail.style.align,'c');
assert.equal(plain(F.insertLocked(source,5,5,'Q',pref,E).text),'QABCD');
assert.equal(plain(F.insertLocked('',0,0,'{page}😀',pref,E).text),'{page}😀');
// Combining vowels and variation sequences remain one visible cluster with the locked attributes.
for(const [base,mark] of [['ཀ','ི'],['a','\u0301'],['❤','\ufe0f']]){
 const first=F.insertLocked('',0,0,base,pref,E),next=F.insertLocked(first.text,first.cursor,first.cursor,mark,pref,E);assert.equal(plain(next.text),base+mark);assert(runs(next.text).some(r=>r.s===base+mark));
}
const d=E.defaultDoc();d.text=result.text;assert.equal(D.normalize(D.artifact(d,'document'),E).text,result.text);assert.equal(plain(R.read(R.write(d,E),E,T).doc.text),plain(result.text));
assert.equal(F.lockedSettings({font:'Bad;font',size:Infinity,color:'red'},E).font,'Jomolhari');assert.equal(F.lockedSettings({size:999},E).size,200);assert.equal(F.lockedSettings({bold:'true'},E).bold,false);
assert.equal(source,'{font:family:Georgia 14 /b /i #0044aa l}AB{font:family:Courier%20New 27 b c}CD');
console.log('PASS: locked font attributes, repeated typing, selection/style restoration, token boundaries, literal braces, Tibetan/Unicode clusters, settings validation and Save/RTF preservation');
