const fixture=String.raw`{\rtf1\ansi\deff0{\fonttbl{\f0 Arial;}{\f1 Courier New;}}\f0\fs36
\u3904\tab X {\u3905\b Y} \u3906{\*\comment ignored}Z {\upr{ANSI}{\*\ud\u3907}}W \u3908\bin3 {\}Q}`;
module.exports={fixture,expected:'ཀX ཁY གZ གྷW ངQ'};
