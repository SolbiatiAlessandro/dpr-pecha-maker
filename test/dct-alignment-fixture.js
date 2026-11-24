// Synthetic public-domain text; the control framing is documented in SPEC.md.
const wrap=(body,encoding='Ansi')=>Buffer.concat([Buffer.from(`\0PKTC\x01\x1a\x05TibetDoc\r\n1\t5\t123\t9\t0\t0\t${encoding}\r\nhdr\t0\r\n1\t!\t`,'latin1'),Buffer.from(body)]);
const toggle=[25,101];
const sample=()=>wrap([...Buffer.from('Before'),...toggle,...Buffer.from('Center'),...toggle,...Buffer.from('After')]);
module.exports={wrap,toggle,sample};
