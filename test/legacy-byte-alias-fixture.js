// Expected values from the public UTFC table, using the CP1252 byte positions.
const cases=[
 {slot:1,byte:128,text:'ཛྫྭ'}, {slot:1,byte:130,text:'ཛྷྫྷ'},
 {slot:2,byte:128,text:'ནྦྷྱ'}, {slot:3,byte:128,text:'ཧྤ'},
 {slot:4,byte:130,text:'༖'}, {slot:0,byte:159,text:'ྭ'}
];
const name=slot=>slot?'TibetanMachineSkt'+slot:'TibetanMachine';
const expected=cases.map(c=>c.text).join(' ');
const dct=()=>require('./dct-alignment-fixture').wrap(cases.flatMap((c,i)=>[...(i?[32]:[]),c.slot===4?23:17+c.slot,c.byte]),'Ansi');
const rtf=()=>Buffer.from('{\\rtf1\\ansi\\ansicpg1252{\\fonttbl'+Array.from({length:5},(_,i)=>'{\\f'+i+' '+name(i)+';}').join('')+'}'+cases.map(c=>'{\\f'+c.slot+" \\'"+c.byte.toString(16)+'}').join(' ')+'}','ascii');
function sample(E){const d=E.defaultDoc();d.text='{font:noto 21 b #aa0000}'+expected;d.counts={title:0,fancy:0};d.yigo.enabled=false;d.dzog.enabled=false;d.folio.start=23;d.pageNum.start=401;d.folio.rhino=cases[0].text;d.folio.rhinoRich=false;d.folio.rhinoEnabled=false;d.notes.sets['body.front'].inL.text=cases[2].text;return d;}
module.exports={cases,name,expected,dct,rtf,sample};
