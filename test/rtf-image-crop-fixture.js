const {picture}=require('./rtf-image-scale-fixture');
const controls=[
 '\\picwgoal1440\\pichgoal720\\piccropl720\\picscalex50\\picscaley200',
 '\\picwgoal1440\\pichgoal720\\piccropl-360\\piccropr-360\\piccropt180\\piccropb180\\picscalex150\\picscaley50',
 '\\picwgoal1440\\pichgoal720\\piccropl360\\piccropr360\\piccropt180\\piccropb180'
];
const expected=[[18,72],[162,9],[36,18]];
const sample=()=>'{\\rtf1\\qc'+picture(controls[0])+'\\par\\qr'+picture(controls[1])+'\\par\\ql'+picture(controls[2])+'\\par\\u3904?}';
module.exports={controls,expected,sample,picture};
