const assert=require('node:assert/strict');
global.PechaImages=require('../src/images');global.Folio=require('../src/folio');
const E=require('../src/engine'),P=require('../src/pxp'),T=require('../src/legacy-table'),D=require('../src/documents'),{sample,markerText}=require('./native-framing-fixture');
const visible=s=>E.parseStream(s,false).filter(r=>r.k==='text').map(r=>r.s).join('');
const base=E.defaultDoc();base.text='Retained ཀ་';base.notes.outLeft=.06;base.notes.outRight=.08;base.paper.w=14;base.yigo.text='Keep';base.sections=[{name:'Keep',text:'Section'}];const original=JSON.stringify(base);
for(const nl of ['\n','\r\n'])for(const extension of ['pxa','pxp','pxc']){
 const data=sample({extension,nl}),parsed=P.parse(data);assert.equal(parsed.nonBody.values.FolioStartNum,'23');assert.equal(Buffer.from(parsed.nonBody.raw['AnnoInL[0].s']).subarray(6).toString(),markerText);assert.equal(parsed.template.PechaAnnotation.AnnoOutRightSpace,'0.450000');assert.equal(parsed.template.PechaAnnotation.Marker,'[END TEMPLATE]');assert.equal(Buffer.from(parsed.body).toString(),extension==='pxa'?'':'Imported body');
 const loaded=P.load(data,extension,T,base,E).doc;assert.equal(loaded.notes.outLeft,.3);assert.equal(loaded.notes.outRight,.45);assert.equal(loaded.folio.start,23);assert.equal(loaded.pageNum.start,401);assert.equal(visible(loaded.notes.sets['title.front'].inL.text),markerText.replace(/\n/g,' '));assert.equal(visible(loaded.notes.sets['body.front'].outL.text),'Outside left');assert.equal(visible(loaded.notes.sets['body.front'].outR.text),'Outside right');assert.equal(loaded.notes.sets['body.front'].outL.size,12);
 assert.equal(loaded.paper.w,14);assert.deepEqual(loaded.types,base.types);if(extension==='pxa'){assert.equal(loaded.text,base.text);assert.deepEqual(loaded.sections,base.sections);assert.deepEqual(loaded.yigo,base.yigo);}else assert.equal(visible(loaded.text),'Imported body');assert.equal(JSON.stringify(base),original);assert.equal(D.normalize(loaded,E).notes.outRight,.45);
 const a=E.boxes(base,base.types.body).O,b=E.boxes(loaded,loaded.types.body).O;assert(Math.abs(b.x0-a.x0-(.3-.06)*72)<1e-9);assert(Math.abs(a.x1-b.x1-(.45-.08)*72)<1e-9);
 const omitted=P.load(sample({extension,nl,template:false}),extension,T,base,E).doc;if(extension!=='pxp'){assert.equal(omitted.notes.outLeft,.06);assert.equal(omitted.notes.outRight,.08);}
}
// Declared body lengths disambiguate literal template/image markers in content-only files.
const body='[START TEMPLATE]\n[END TEMPLATE]\n[START IMAGES] 1.1\nImageInfoCount=1\nLiteral body';
for(const extension of ['pxc','pxp']){const parsed=P.parse(sample({extension,body,template:extension==='pxp'}));assert.equal(Buffer.from(parsed.body).toString(),body);assert.equal(parsed.imageBlock,null);}
// A literal image header inside the body must not hide the actual appended block.
const image=Buffer.from('\n[START IMAGES] 1.1\nImageInfoCount=0\nImages_totalBytes=0\n');
for(const extension of ['pxc','pxp']){const parsed=P.parse(Buffer.concat([sample({extension,body,template:extension==='pxp'}),image]));assert.equal(Buffer.from(parsed.body).toString(),body);assert.deepEqual(Buffer.from(parsed.imageBlock),image);}
const bytes=sample(),terminator=bytes.lastIndexOf('[END NON-BODY]');
assert.throws(()=>P.parse(Buffer.concat([bytes.subarray(0,terminator),bytes.subarray(terminator+'[END NON-BODY]'.length)])),/NON-BODY terminator/);
assert.throws(()=>P.parse(bytes.subarray(0,bytes.length-'[END TEMPLATE]\n'.length)),/TEMPLATE terminator/);
assert.throws(()=>P.parse(Buffer.from(bytes.toString('latin1').replace('.slen=','.slen=999999'),'latin1')),/text-stream length/);
const parsed=P.parse(bytes),raw=Buffer.from(parsed.nonBody.raw['AnnoInL[0].s']),at=bytes.indexOf(raw)+raw.length,bad=Buffer.from(bytes);bad[at]=65;assert.throws(()=>P.parse(bad),/text-stream separator/);
console.log('PASS: native length-prefixed marker text, NUL format bytes, LF/CRLF, whole-line template boundaries, declared content/image scope, partial annotation spacing/geometry, state isolation and malformed framing rejection');
