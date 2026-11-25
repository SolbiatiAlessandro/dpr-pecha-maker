const {picture}=require('./rtf-picture-fixture');
// The hidden image uses different bytes from the visible one, so asset omission is testable.
const {png}=require('./image-dpi-fixture');
const hiddenPicture=()=>`{\\pict\\pngblip ${png(120,120).toString('hex')}}`;
const fixture=()=>'{\\rtf1\\ansi{\\fonttbl{\\f0 Arial;}{\\f1 TibetanMachine;}}{\\colortbl;\\red176\\green48\\blue32;}\\fs36 Before '+
 '{\\v HIDDEN_A\\page\\par\\tab\\emdash\\u3904?'+hiddenPicture()+'}'+
 '{\\b\\cf1 Visible}{\\v HIDDEN_B{\\v0\\i Shown}HIDDEN_C} '+
 '{\\f1\\fs24 '+String.fromCharCode(33)+'}'+picture()+' After}';
const expected='Before VisibleShown ཀ After';
module.exports={fixture,expected,hiddenPicture};
