// Synthetic header variants; these are not genuine older TibetDoc specimens.
const fs=require('node:fs');
const modern=fs.readFileSync(__dirname+'/fixtures/dct/modern-public.dct');
function fixture({header='1 2 TibetD 4',settings='1 5 2501751258070 9 0 TibetanAnsi',nul=true,eol='\r\n',body}={}) {
 const rest=body===undefined ? modern.subarray(modern.indexOf(10,modern.indexOf(10)+1)+1) : Buffer.concat([Buffer.from('hdr\t0'+eol+'1\t!\t'),Buffer.from(body)]);
 return Buffer.concat([Buffer.from((nul?'\0':'')+header+eol+settings+eol,'latin1'),rest]);
}
module.exports={fixture,modern};
