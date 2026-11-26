// Font IDs intentionally differ from declaration order; no original document text.
const fixture=String.raw`{\rtf1\ansi\deff0{\fonttbl{\f7\fcharset0 TibetanMachine;}{\f2\fcharset0 Times New Roman;}}\fs64\b ! \f2\b0\fs48 Caf\'e9 \plain\fs64\b \'22}`;
const expected='ཀ Café ཁ';
module.exports={fixture,expected};
