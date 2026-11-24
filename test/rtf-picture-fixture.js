// Generated image paragraphs; no original application assets.
const fixture=require('./image-dpi-fixture');
const picture=()=>`{\\pict\\pngblip\\picwgoal1440\\pichgoal720 ${fixture.png(96,96).toString('hex')}}`;
const sample=()=>`{\\rtf1\\ansi{\\fonttbl{\\f0 Georgia;}}\\qc${picture()}\\par\\qr${picture()}\\par\\ql${picture()}\\par\\qj${picture()}}`;
module.exports={picture,sample};
