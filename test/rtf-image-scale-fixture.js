const {png}=require('./image-dpi-fixture');
const picture=(controls='\\picwgoal1440\\pichgoal720\\picscalex50\\picscaley200')=>'{\\pict\\pngblip'+controls+' '+png(96,96).toString('hex')+'}';
const sample=()=>'{\\rtf1\\ansi{\\fonttbl{\\f0 Georgia;}}\\qc'+picture()+'\\par\\qr'+picture('\\picwgoal1440\\pichgoal720\\picscalex150')+'\\par\\ql'+picture('\\picwgoal1440\\pichgoal720\\picscaley50')+'\\par\\u3904?}';
module.exports={picture,sample};
