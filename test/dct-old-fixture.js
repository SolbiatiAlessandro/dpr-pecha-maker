// Synthetic old-format bytes from independently specified compatibility behavior.
// No genuine TibetDoc version2/3 specimen is available yet.
const {fixture}=require('./dct-header-fixture');
const wrap=(body,version=2,encoding='TibetanAnsi')=>fixture({header:`1 2 TibetD ${version}`,settings:`1 2 3 4 5 ${encoding}`,body});
const sample=version=>wrap([45,220,32,127,32,18,45,32,19,45,32,20,142,32,16,65,16,45,21,97,32,23,45],version);
const expected='པི སྐྱ ྈྣ ཊྤྲ ཀྵ A-ā �';
module.exports={wrap,sample,expected};
