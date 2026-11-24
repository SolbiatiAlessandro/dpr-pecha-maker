const assert=require('node:assert/strict');
global.PechaImages=require('../src/images');global.Folio=require('../src/folio');
const Engine=require('../src/engine'),Pxp=require('../src/pxp'),TABLE=require('../src/legacy-table'),Documents=require('../src/documents'),{native,font,western,sample}=require('./native-charset-fixture');
const plain=doc=>Engine.parseStream(doc.text,false).filter(r=>r.k==='text').map(r=>r.s).join('').replace(/\u2028/g,'\n');
const cases=[[0,[147,128,148,151,133],'“€”—…'],[238,[163,243,100,159],'Łódź'],[204,[207,240,232,226,229,242],'Привет'],[161,[193,232,222,237,225],'Αθήνα'],[162,[221,253,254],'İış'],[177,[249,236,229,237],'שלום'],[178,[211,225,199,227],'سلام'],[186,[82,238,103,97],'Rīga'],[163,[97,236],'a\u0301'],[222,[228,183,194],'ไทย']];
for(const [charset,bytes,expected] of cases) {
 const file=native({fonts:[{name:'Arial',charset}],body:bytes}),parsed=Pxp.parse(file);
 assert.equal(parsed.fontCharsets[0],charset);assert.equal(parsed.fonts[0],'Arial');
 const result=Pxp.load(file,'pxp',TABLE,Engine.defaultDoc(),Engine);
 assert.equal(plain(result.doc),expected);assert.equal(result.unknown,0);assert.equal(result.warnings.length,1);assert(result.warnings[0].includes('font families'));
}
assert.equal(plain(Pxp.load(sample(),'pxp',TABLE,Engine.defaultDoc(),Engine).doc),'“€”—…\nПривет');
// Same family, distinct font charset records and framed glyph font overrides.
const switched=native({fonts:[{name:'Arial',charset:0},{name:'Arial',charset:204}],body:[192,...font(1),192,20,0,0,192,0,20,192]});
assert.equal(plain(Pxp.load(switched,'pxp',TABLE,Engine.defaultDoc(),Engine).doc),'ÀАÀА');
for(const extension of ['pxp','pxc','pxa']) {
 const id=extension==='pxa'?5:0,bytes=[...font(id),...western];
 const file=native({extension,body:extension==='pxa'?[]:bytes,note:bytes,yigo:bytes,rhino:bytes});
 const base=Engine.defaultDoc();base.text='Keep body';
 const result=Pxp.load(file,extension,TABLE,base,Engine);
 assert(result.doc.notes.sets['title.front'].inL.text.includes('“€”—…'));assert.equal(plain({text:result.doc.folio.rhino}),'“€”—…');assert(result.doc.folio.rhinoRich);assert(result.doc.folio.rhinoEnabled);
 if(extension==='pxa'){assert.equal(result.doc.text,'Keep body');assert.equal(Pxp.parse(file).fontCharsets[5],0);}
 else {assert.equal(plain(result.doc),'“€”—…');assert.equal(plain({text:result.doc.yigo.text}),'“€”—…');assert(result.doc.yigo.rich);}
 assert.equal(Documents.normalize(Documents.artifact(result.doc,'document'),Engine).text,result.doc.text);
}
for(const [charset,bytes,expected] of [[2,[65,32,66],'� �'],[128,[65,130,160],'A��'],[255,[65,255],'A�'],[77,[65,128],'A�'],[999,[65,255],'A�'],[0,[129],'�']]) {
 const result=Pxp.load(native({fonts:[{name:'Unmapped',charset}],body:bytes,note:bytes}),'pxp',TABLE,Engine.defaultDoc(),Engine);
 assert.equal(plain(result.doc),expected);assert(result.unknown>0);assert(result.warnings.some(w=>w.includes('�')));
 assert(result.warnings.some(w=>w.includes('annotation')));assert.equal(new Set(result.warnings).size,result.warnings.length);
}
const fallback=Pxp.load(native({fonts:[{name:'Arial',charset:1}],body:western}),'pxp',TABLE,Engine.defaultDoc(),Engine);
assert.equal(plain(fallback.doc),'“€”—…');assert(fallback.warnings.some(w=>w.includes('source Windows locale')));
const tib=Pxp.decodeStream(Uint8Array.from([33]),{0:'TibetanMachine'},TABLE,0,{0:2});assert.equal(tib.ev[0].s,'ཀ');assert.deepEqual(tib.warnings,[]);
console.log('PASS: native charset metadata, 10 code pages, font switches/framed glyphs, PXP/PXC/PXA body/notes/yi-go/rhino, unsupported replacement warnings, locale fallback, TCC priority and Save');
