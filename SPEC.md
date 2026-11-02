# DPR Pecha Maker: functional spec

A browser tool that turns a PDF of a Tibetan text into traditional pecha pages ready to print. The feature set
follows the public documentation of PechaMaker (Windows, 2004-2018, by Frederick W. Johnson): its
website, FAQ, release notes and User's Guide. The code here is new. PechaMaker's executable was never
run or disassembled, and none of its code is reused.

## Starting from a PDF

The opening screen is one drop target. Dropping a PDF reads its text and opens the page with the
settings on the left. Everything runs in the browser and nothing is uploaded.

- Healthy text is used as it stands. Rotated text, running heads, page numbers and bracketed viewer
  marks are left out, and non-Tibetan lines are left out unless the option is set.
- Text in old fonts (TibetanMachine, Ededris and others) converts through the font tables.
- Many Tibetan PDFs have a flawed hidden text layer. Spelling is checked against the stacks Tibetan
  allows, and holes (glyphs with no character code) are detected.
- A few holes or bad stacks: every page is also read with Tibetan OCR, and only the damaged syllables
  take the OCR's reading, where the two line up and the reading fits the gap. A hole is always a
  stacked letter or a vowel sign. Gaps left after a second pass take a word from the same document
  when one word clearly fits. Anything still unknown shows as □.
- A text layer wrong throughout, or a scan: the OCR alone, with a note to check every line.
- Measured on a 3,554-syllable text printed to PDF from Chrome in the Kokonor font, against its exact
  text: OCR alone 89.5% of syllables correct, the combined reading 99.55%, with 7 gaps marked.

## What a pecha is here

- **Sheet**: one side of the paper. **Page**: one pecha side. **Folio**: one cut leaf, front and back.
- A document runs through up to three page types in a fixed order: Title, Fancy, Body. Body is the
  last type and takes all remaining pages. Each type has its own lines, line height, boxes and colour.
- Page width is the sheet width minus the side margins. Page height is one setting for all types.
- N pages per sheet are spaced evenly, so each sits centred in a strip of sheet height / N.

## Page design

For each page type: lines per page, text size, fixed line height, distance from the box to the first
line (blank = centred), distance from the box to the text, double, single or no box lines, line colour,
outer and inner side boxes, an optional inside box, and an optional squeeze of the outside box.

## Text

- Text is Unicode Tibetan mixed with any other script. PechaMaker has no Unicode support; here it is
  the only input encoding, and old files are converted on opening.
- Format codes sit in the text and apply until changed: `{c}` `{j}` `{l}` `{r}`, `{30}` size, `{size}`
  default size, `{#b03020}` colour, `{color}` black, `{b}` `{i}`, `{page}`, `{hs}` fixed shad.
- With "Run lines together", a single line break disappears and a blank line is a hard return. A verse
  ending in a shad or tsheg joins the next verse with no added space.
- Lines break after a tsheg, after a shad, or at a space. A shad never starts a line through a break
  between it and the syllable before it.
- Full justification puts extra space into the gaps between shads first, up to about three em, then
  spreads the rest across tshegs. Lines ending in a hard return and the last line are not justified.
- All lines of a page share one fixed line height. Glyphs hang from the head line, so mixed sizes
  align at the top.

## Automatic marks

- **Rinchen pung shad**: a shad straight after the tsheg-bar that opens a line displays as U+0F11. With
  the second-shad option, the following shad in a shad-space-shad pair does too. A yi-go containing a
  shad blocks this unless that option is set. The first line of a Title page is never converted. The
  stored text keeps the plain shad.
- **Yi-go**: on the front of each folio after the Title pages, plus the first Fancy page, only when the
  page starts with Tibetan.
- **Dzog thik**: a line under the last line of text, rising after the last character to run on under
  the line above. It stays flat past 98% of the width.
- **Folio numbers**: spelled in Tibetan on the left of each front. 21-99 stand alone in the long form
  (བརྒྱད་ཅུ་གྱ་གཉིས), the short form follows hundreds, and exact hundreds take ཐམ་པ. Also an option for
  one fixed phrase on every folio, and བྱོན། added to the last folio.
- **Page numbers**: Arabic, rotated, on the right.
- **Margin notes**: rotated text at inside left top and bottom, inside right, outside left and outside
  right, set separately for the front and back of each page type.

## Printing

- Both sides for a two-sided printer, fronts only, backs only, or pages in order.
- Backs run in reverse row order, because a flip along the top edge puts the bottom row behind the top
  row. Each folio then reads by flipping it up.
- Optional cut marks, and optional ordering so a whole stack can be cut at once and stay in sequence.
- Output is the browser's print dialog at the exact sheet size, which also gives a PDF with embedded
  fonts and selectable Unicode text.

## Files

- Opens PDF, `.txt`, and `.pxp`, `.pxc` and `.pxt`: layout, notes, numbering and text. Text in the TibetanMachine family
  converts to Unicode through published tables. Other legacy fonts convert where a table exists.
- `.pxp` structure as read from sample files: a header with a font table; `iNiT key=value` lines, with
  byte strings after a length key; an INI template; then the body. In the body `0x11 op a b c 0x11` is
  a format code (0x20 font, 0x21 size, 0x22 colour, 0x23 bold, 0x24 italic, 0x25 underline, 0x32-35
  alignment, 0x48 tab) and `0x14 x font ch y 0x14` is a stack from another font of the set.
- Saves its own `.pecha` file (JSON). A draft is kept in the browser.

## Not built yet

Pictures in side boxes and inline images, RTF and TibetDoc import, OCR for woodblock-print scans, separate save of text and template,
TCC and Sambhota keyboard maps (Wylie entry and the system Tibetan keyboard stand in), multi-column
tabs beyond a simple tab stop, editing directly on the page, undo beyond the browser's own.
