const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
global.PechaImages=require('../src/images');global.Folio=require('../src/folio');
const Engine=require('../src/engine'),Pxp=require('../src/pxp'),TABLE=require('../src/legacy-table');
const measure=()=>0;measure.head=()=>({ascent:15,descent:5,height:20});
const doc=Engine.defaultDoc();
doc.text='PRIVATE TEXT MUST NOT BE EXPORTED';doc.notes.sets['body.front'].inL.text='PRIVATE NOTE';
doc.paper={name:'Custom',w:14,h:8.5};doc.margins={left:.6,right:.8,top:.1,bottom:.2};
doc.pecha.perSheet=2;doc.pecha.dlt=.04;doc.counts={title:2,fancy:4};doc.folio.size=15.75;
doc.notes.outLeft=.2;doc.notes.outRight=.4;doc.pageNum.angle=0;doc.pageNum.size=12;
for(const [i,t] of Object.values(doc.types).entries()){t.baseline=.25+i*.1;t.color='#1256ab';t.lines=3+i;}
const exported=Pxp.writeTemplate(doc,Engine,measure),parsed=Pxp.parse(Buffer.from(exported.text));
assert(exported.text.startsWith('; PechaMaker Template file.'));
assert(!/(?<!\r)\n/.test(exported.text));assert(!/[^\x00-\x7f]/.test(exported.text));
assert(!exported.text.includes('PRIVATE'));assert(!exported.text.includes('PageNumFIndex'));
assert.equal(parsed.template.Type_0.BoxColor,'0xAB5612');
assert.deepEqual([0,1,2].map(i=>parsed.template['Type_'+i].EndPage),['2','6','65535']);
assert.equal(parsed.template.PageSetup['PaperSize.x'],'14000');
const base=Engine.defaultDoc();base.text='retained ཀ་{hs}';base.notes.sets['body.front'].inL.text='retained annotation';base.folio.start=7;base.pageNum.start=90;
const loaded=Pxp.load(Buffer.from(exported.text),'pxt',TABLE,base,Engine).doc;
for(const key of ['margins','pecha','counts','normal','tabWidth','tibetanRaise'])assert.deepEqual(loaded[key],doc[key]);
assert.equal(loaded.text,base.text);assert.equal(loaded.notes.sets['body.front'].inL.text,'retained annotation');
assert.equal(loaded.folio.start,7);assert.equal(loaded.pageNum.start,90);assert.equal(loaded.folio.size,15.75);
assert.equal(loaded.notes.outLeft,.2);assert.equal(loaded.notes.outRight,.4);assert.equal(loaded.pageNum.angle,0);
for(const kind of ['title','fancy','body'])for(const key of ['lines','lineHeight','baseline','side','style','color','sideIn','sideOut','insideOn','inside','squeezeOn','squeeze'])assert.equal(key==='color'?loaded.types[kind][key].toLowerCase():loaded.types[kind][key],doc.types[kind][key]);
const auto=Engine.defaultDoc(),out=Pxp.writeTemplate(auto,Engine,measure),settings=Pxp.parse(Buffer.from(out.text)).template;
assert(out.warnings.some(w=>w.includes('fixed baseline')));
const box=Engine.boxes(auto,auto.types.title).T;
const expected=((box.y1-box.y0)-((auto.types.title.lines-1)*auto.types.title.lineHeight*72+20))/144+15/72;
assert(Math.abs(+settings.Type_0.BaseLineAdj-expected)<.000001);
auto.types.title.top=.2;assert(Math.abs(+Pxp.parse(Buffer.from(Pxp.writeTemplate(auto,Engine,measure).text)).template.Type_0.BaseLineAdj-(.2+15/72))<.000001);
auto.paper.w=8.5;auto.paper.h=11;auto.pecha.mode=false;auto.pageNum.angle=90;
const portrait=Pxp.writeTemplate(auto,Engine,measure);assert(portrait.text.includes('PageOrientation=1'));assert(portrait.text.includes('PechaMode=0'));assert(portrait.warnings.some(w=>w.includes('rotation')));
auto.paper.w=NaN;assert.throws(()=>Pxp.writeTemplate(auto,Engine,measure),/finite/);
// Real bundled input specimens validate numeric field preservation, not native export acceptance.
if(process.argv[2])for(const name of fs.readdirSync(process.argv[2]).filter(n=>n.endsWith('.pxp'))){
 const bytes=fs.readFileSync(path.join(process.argv[2],name)),original=Pxp.parse(bytes).template;
 const imported=Pxp.toDoc(bytes,TABLE,Engine.defaultDoc(),Engine).doc;
 const written=Pxp.parse(Buffer.from(Pxp.writeTemplate(imported,Engine,measure).text)).template;
 for(const [section,fields]of Object.entries(written))for(const[key,value]of Object.entries(fields)){
  if(original[section]?.[key]===undefined)continue;
  if(key==='PageType')assert.equal(value,original[section][key]);
  else assert(Math.abs(Number(value)-Number(original[section][key]))<.000001,`${name} ${section}.${key}: ${value} != ${original[section][key]}`);
 }
 console.log('PASS sample template fields:',name);
}
console.log('PASS: native template framing, geometry, colors, scope, fixed/automatic baselines, normal/portrait mode and invalid values');
