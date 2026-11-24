// Generated native-format test data; no original text or font assets.
const font=id=>[17,32,id,0,0,17];
function native({extension='pxp',fonts=[{name:'Georgia',charset:0}],body=[],note=null,noteIndex=0,yigo=null,rhino=null}={}) {
 const records=fonts.map((f,i)=>`${i} ${f.charset} ${f.name}\0`).join('');
 const header=extension==='pxa'?`.pxa 0.1 u1 u2 u3 u4 0 ${fonts.length} ${records}`:`.${extension} 0.6 0 u1 u2 u3 u4 ${body.length} 0 ${fonts.length} ${records}`;
 const chunks=[Buffer.from(header+'\n[START NON-BODY]\n','latin1')];
 const stream=(key,lengthKey,bytes)=>{chunks.push(Buffer.from(`${lengthKey}=${bytes.length}\n${key}=\n`),Buffer.from(bytes),Buffer.from('\n'));};
 if(note){chunks.push(Buffer.from(`AnnoInL[${noteIndex}].en=1\nAnnoInL[${noteIndex}].ptSz=18\n`));stream(`AnnoInL[${noteIndex}].s`,`AnnoInL[${noteIndex}].slen`,note);}
 if(yigo)stream('Yigo.s','Yigo.slen',yigo);
 if(rhino){chunks.push(Buffer.from('FolioRhinoEn=1\n'));stream('FolioRhinoStream','FolioRhinoLen',rhino);}
 chunks.push(Buffer.from('[END NON-BODY]\n'),Buffer.from(body));return Buffer.concat(chunks);
}
const western=[147,128,148,151,133],cyrillic=[207,240,232,226,229,242];
const sample=()=>native({fonts:[{name:'Georgia',charset:0},{name:'Arial',charset:204}],body:[...font(0),...western,10,...font(1),...cyrillic],note:[...font(0),147,128,148]});
module.exports={native,font,western,cyrillic,sample};
