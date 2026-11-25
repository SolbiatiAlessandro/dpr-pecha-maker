// Explicit per-font code pages override contradictory charsets; nested metadata is isolated.
const fixture=String.raw`{\rtf1\ansi\ansicpg1252\deff0
{\fonttbl
{\f0\fmodern\fcharset0\cpg1251{\*\panose 02070309020205020404}{\*\fname Courier New}Courier New{\*\falt Courier};}
{\f1\fswiss\cpg1252\fcharset204{\*\fontemb\fttruetype{\*\fontfile\cpg1251 ignored.ttf}00ff}Arial{\*\unknown hidden;};}
{\f2\fnil\cpg932{\*\panose 020b0604020202020204}Arial{\*\falt \uc0\u20195\u26367};}
{\f3\fnil\fcharset2\cpg1251{\*\fname TibetanMachine}TibetanMachine{\*\falt Unused};}}
\f0\fs36\b \'cf\'f0\'e8\'e2\'e5\'f2 {\f1\b0\i Caf\'e9} \f2\b0\i0 \'93\'fa\'96\'7b\'8c\'ea \f3\fs32 k}`;
module.exports={fixture};
