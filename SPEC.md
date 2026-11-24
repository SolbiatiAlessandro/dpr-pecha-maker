# Nalandabodhi Pecha Maker: functional spec

A browser tool that turns a PDF of a Tibetan text into traditional pecha pages ready to print. The feature set
follows the public documentation of PechaMaker (Windows, 2004-2018, by Frederick W. Johnson): its
website, FAQ, release notes and User's Guide. The code here is independently written. Public documentation, example files and read-only UI-resource
inspection inform compatibility work; no proprietary implementation or assets are reused. Original
Windows runtime equivalence has not yet been verified.

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
- N pages per sheet are spaced evenly between top and bottom margins. A single pecha can instead
  sit at the top margin. Back sheets mirror the vertical margins for top-edge turning.

## Page design

For each page type: lines per page, text size, fixed line height, distance from the box to the first
line (blank = centred), distance from the box to the text, double, single or no box lines, line colour,
outer and inner side boxes, an optional inside box, and an optional squeeze of the outside box.

## Text

- Text is Unicode Tibetan mixed with any other script. PechaMaker has no Unicode support; here it is
  the only input encoding, and old files are converted on opening.
- Format codes sit in the text and apply until changed: `{c}` `{j}` `{l}` `{r}`, `{30}` size, `{size}`
  default size, `{#b03020}` colour, `{color}` black, `{b}` `{i}` `{u}` `{s}` with slash closing marks,
  `{page}`, `{hs}` fixed shad. Formatting marks apply until changed; buttons insert marks at the cursor.
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
- **Page numbers**: Arabic on the right; bottom/center, rotation, inset and separate first-title visibility.
  Folio rotation is separately configurable; its exact original facing direction remains unverified.
- **Margin notes**: rotated text at inside left top and bottom, inside right, outside left and outside
  right, set separately for the front and back of each page type.

## Printing

- A pecha leaf is read by turning it over its top edge, away from the reader, so each back must be the
  right way up after that turn.
- Three ways to print. A two-sided printer gets fronts and backs alternating, with flip on long edge for
  landscape sheets. A one-sided printer runs the paper twice: fronts, then the stack turned over its top
  edge and fed again, then backs. This follows PechaMaker's odd and even passes. A proof prints pages in
  reading order and is not for cutting.
- Backs run in reverse row order, because the turn puts the bottom row behind the top row.
- Printers feed and turn paper differently, so there is a one-sheet test, an option to turn the backs
  upside down, and, for two runs, an option to print the backs in reverse sheet order.
- Optional cut marks with the sheet number and side in the trimmed margin, and optional ordering so a
  whole stack can be cut at once and stay in sequence.
- Output is the browser's print dialog at the exact sheet size, which also gives a PDF with embedded
  fonts and selectable Unicode text.

## Files

- Opens PDF, `.txt`, and `.pxp`, `.pxc` and `.pxt`: layout, notes, numbering and text. Text in the TibetanMachine family
  converts to Unicode through published tables. Other legacy fonts convert where a table exists.
- `.pxp` structure as read from sample files: a header with a font table; `iNiT key=value` lines, with
  byte strings after a length key; an INI template; then the body. In the body `0x11 op a b c 0x11` is
  a format code (0x20 font, 0x21 size, 0x22 colour, 0x23 bold, 0x24 italic, 0x25 underline, 0x32-35
  alignment, 0x48 tab) and `0x14 x font ch y 0x14` is a stack from another font of the set.
- Saves its own `.pecha` file (JSON). A draft is kept in the browser. Separate web layout, content and
  annotation/numbering files can be applied to the current document without replacing unrelated parts.
  They are not Windows PXT/PXC/PXA files. Older web documents receive default values for new fields.

## Not built yet

Complete native image import/export, full RTF fidelity and TibetDoc import, OCR for woodblock-print scans, TCC and Sambhota keyboard maps (Wylie entry and the system Tibetan keyboard stand in), multi-column
tabs beyond a simple tab stop, editing directly on the page, undo beyond the browser's own.


## Whole-text styling and volumes (web additions)

- A nullable global main-text size overrides inline, page-type and role sizes while preserving font,
  bold, italic and colour. Clearing it restores those individual sizes. Numbering and notes keep their
  own sizes. This is a reversible size override, not an exact simulation of Windows selection editing.
- `{root}`, `{commentary}`, `{heading}` and `{/role}` mark semantic roles. Each role has its own font,
  size and bold choice. All marked passages respond to role changes. No root/commentary bold mapping
  is assumed. An explicit bold or size mark after a role overrides that attribute until the next role.
- Optional volumes contain ordered text sections, with a name, Tibetan starting folio and explicit
  choice to restart the shared Title/Fancy sequence. Unticked means all Body pages for that text.
- Every section begins on the front of a new folio. If needed, a blank back is inserted. Arabic page
  counting continues across every page, including blank backs and hidden title labels. Tibetan folio
  counts restart per text. This is a declared web workflow, not claimed original Windows behavior.
- Section names can replace the left and/or right inside annotations, retaining their size/inset.
  Reordering whole texts recalculates pagination and volume counters. Single-text files are unchanged
  until the user enables the volume controls. Content-only saves retain sections and role marks.

## Compatibility limits and verification

The interface includes an explicit unfinished-features checklist. The original has additional image,
legacy-input, normal editing-mode, selected-text formatting and annotation features that are not fully
recreated. Rich text in annotations, exact shad/yi-go/dzog edge behavior, original font metrics and
original label facing still need direct comparison. PDF/OCR is an existing web addition, not an original
Windows feature. Legacy sample imports are smoke-tested for all five public examples; that does not
prove visual fidelity. Native Windows keyboard maps and binary-format export remain absent.

Validation includes engine regression tests for typography preservation, tab stops, numbering/title
visibility, margin placement, reusable files, section resets/reordering and duplex imposition, plus
existing PDF repair tests. Browser QA uses local synthetic/public sample text only. Safari requires
matching paper size/orientation and disabling headers/footers in its print dialog; browser print settings
can otherwise add pages despite the app's CSS page size.

### Original partial-file loading

PXT loads page layout while preserving current content, sections and annotation text/number starts.
PXC loads content, annotations, numbering and text-processing options while retaining page layout.
PXA loads annotations and numbering while retaining content and page layout. PXP replaces the document.
These scopes follow the original guide section 3; the native partial-file framing is experimental
until actual Windows exports are tested. Synthetic scope regressions are not a fidelity claim.

### Selected text attributes

The selection panel changes only explicitly chosen font/size/colour/bold/italic/underline/strike
attributes. Unspecified attributes, role identity and alignment survive mixed selections.
Selected attributes override matching marks within the selection, including size/bold resets
at role changes; the original attribute state resumes after the selection. Partial visible
format-code selections expand to whole tokens. No selection inserts a continuing formatting mark.
This follows the original guide section 4.3.1 attribute-preservation semantics; it is not a
claim of identical native editing interaction. The whole-text size override still takes precedence.

Folio labels and Arabic page numbers have independent font selections. Folios default to
the document font; Arabic numbers default to Western serif. Number font choices persist
in full documents and annotation presets. Available web typefaces are substitutes; native
legacy font identities and exact metrics remain a compatibility limitation.

### Embedded images

Inline images use `{image:id}` tokens and reflow as atomic items with explicit space on
each side. PNG/JPEG/WebP input is converted to embedded PNG; repeated identical PNG
data shares one asset. Independent placements store scale, resolution, distance of the
top above the baseline, optional Tibetan baseline adjustment, and side spacing.
Image yi-go uses the same eligibility rules as text yi-go. PNG pHYs density is read;
missing density and Ignore DPI use 96 DPI, an explicit web convention still awaiting
Windows comparison. Full and content saves retain assets and placements; templates
contain no image bytes. Browser-storage failures prompt the user to Save.
Native image interoperability and exact clipboard reset semantics remain open. Uploaded image data stays in the browser/local saved document.

Page images use fixed volume page numbers with six left/right box/text anchors, inward
and downward shifts, 20–200% scaling and a margin to text for text-side anchors.
Text lines whose vertical extents overlap an image reserve space from that side.
Images are painted after box lines. Absent box anchors are disabled; missing-page
placements remain stored and show a warning. Right-clicking an image opens its controls;
the image picker also selects overlapping images. Exact rounding, overlap conventions,
and native page identity after restructuring remain Windows-comparison work.

### Mixed margin annotations

Each annotation slot has an explicit formatting-marks option. Older plain annotations
retain literal braces. Enabled notes render multiple font/style/colour/size runs on one
rotated baseline, with anchoring measured across the combined runs. Main-text global
size does not affect them. Supported native annotation codes are retained on import,
with Tibetan and Western fonts mapped to available web substitutes. Unknown native
formatting and exact legacy font metrics remain verification work.

### RTF body export

The RTF download serializes source body text, effective font/size/style/colour, explicit
hard returns/pages/tabs and inline PNGs with physical dimensions. Hard shad exports as
ordinary shad. It excludes pecha layout, page-attached images, annotations, numbering
and automatic marks. Inline baseline adjustments and side spacing are not currently
translated. Unicode uses signed UTF-16 escapes; supporting fonts must be available to
the receiving editor. macOS textutil independently reads generated Tibetan, styles and
colours. Full native RTF export equivalence remains open.


### RTF body import

Opening RTF replaces body content while retaining the current page layout and margin
annotations. It reads Unicode escapes, common single-byte code pages, grouped font,
size, emphasis, colour and alignment, explicit page breaks, known legacy Tibetan font
maps, and inline PNG pictures. Literal braces survive import and export. Embedded
objects are never executed; external images are not fetched. Unsupported drawings
and picture formats are skipped with warnings, and tables become tabs and lines.
Multibyte legacy code pages, exact source font metrics, paragraph geometry, and
nonuniform image scaling are not faithfully reproduced. This is partial RTF
interchange, not verified equivalence to Windows PechaMaker's importer.

### Rich yi-go controls

Custom yi-go formatting marks preserve their own font, emphasis and colour. The
font size always follows the first body character on that page. A colour-match
checkbox follows that character's colour instead. Existing plain yi-go documents
retain their previous inherited styling. This implements installed guide 2.0 §7.3
semantics; native rich-text clipboard equivalence is still unverified.

### Dzog-thik controls

The end mark uses the deepest rendered font extent on each of the final two lines,
with separate upward adjustments for its left and right segments. Its rise can be
placed an inch distance beyond the final text advance or a percentage of remaining
whitespace. Trailing spaces count toward that advance. Native HpercentEn/Hpercent,
HexactF, VLAdjF and VRAdjF fields are imported. Figure18 of installed guide2.0
explicitly labels the percentage as whitespace; interpreting its endpoint as the
right text boundary follows Figure17 and still needs numerical Windows comparison.
The 98% straight-line rule and blank-only first-line suppression follow section7.2.

### Inline image copy/move

Explicit image-panel commands insert at the active text cursor, share the embedded
PNG asset, and reset scale to100% and spacing/baseline controls to web defaults. A
move removes prior references, including in other volume sections. The source DPI
is retained. Cursor positions inside formatting tokens advance to the token end.
This follows guide2.0 section9.1's reset rule; native clipboard operation and exact
Windows default spacing remain unverified. Copying raw text tokens still shares
the existing placement rather than creating a new placement.

Annotation size correction: installed guide2.0 p36 specifies one size per position,
applied across mixed-font text. Annotation rendering now overrides inline size
marks with the slot's size while preserving fonts/emphasis/colour. Main-text size
continues to have no effect on annotations.

### New/import defaults

Starting blank text or importing plain text/PDF keeps current margin annotations,
yi-go (including its active embedded image), and the fixed folio phrase. RTF also
keeps those settings; its existing layout preservation is unchanged. Body/page
images and prior text sections are cleared. This follows guide2.0 p36 and author
release1.13.2 forum post157; a separate Close-to-startup-defaults workflow remains
unimplemented. Native full-file loading continues to use the file's own settings.

### Shared baselines and screen guides

Mixed font sizes now share the line's reference baseline; the independent Tibetan
raise offsets Tibetan text only. Inline images and dzog-thik descent use the same
reference. This corrects previous alignment by each run's top edge. The reference
is still derived from the web page-type font metrics; historical font metrics remain unverified. Native baseline offsets are now
imported explicitly as described below.
Optional dashed baseline guides and red/green/blue Title/Fancy/Body frame hints
apply only to screen SVGs. Printed SVGs retain configured frame colours and contain
no baseline guides. Chrome QA verified mixed40pt/12pt text alignment and visible
guide/hint toggles; an automated comparison verifies unchanged print SVG output.

Native image-tail guard: image-bearing files append an image header/metadata/payload
after body bytes. The reader recognizes a structured [START IMAGES] header and
excludes that tail from decoded body text. An independent experimental reader now
handles textual image-header version 1.1: embedded PNG assets, inline placement
references and image yi-go. It validates payload bounds and caps image dimensions,
then carries scale, DPI, baseline adjustment and side spacing into the web model.
Version1.0 records and six fixed-page anchors are now supported experimentally
as detailed below; native export remains open.
Framing and inline-reference indexing were checked by local static inspection.
Regression fixtures are synthetic: no real Windows image specimen is available,
so this is not verified native interoperability. Chrome QA imported a synthetic
file through the picker and visibly rendered its red PNG between two text runs.

### Kerning

The document kerning switch is carried into measured font runs, canvas width-cache
keys and screen/print SVG text style. Layout templates preserve it. The checkbox
is disabled in browsers without canvas fontKerning support; those browsers cannot
reliably reproduce documents saved with kerning disabled. Browser fonts and their
kerning data still differ from the historical Windows fonts. Chrome QA verifies
the enabled checkbox changes state and renders a large Latin test without errors;
exact spacing differences are not claimed from that visual check.
API reference: https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/fontKerning

### Full-page mode

Disabling Pecha mode uses the full paper area between margins, with separate fixed
line height and first-baseline distance. Pecha page counts/frames/labels are retained
for switching back but are not drawn. Sheet imposition uses one page per side.
Yi-go is suppressed only on the first document page; sections start new pages
without forced blank folio backs in this mode. Native PechaMode, LineControl
LineHeight and BaseLnAdjTM settings import into this model.
The web default first-baseline distance is0.6in to fit its Unicode fonts; importing
a smaller historical value may require increasing it. A first-line extent warning
helps detect clipping. Source: installed guide2.0 pp9,22,29; exact original label
interactions and native font/print fidelity still require Windows comparison.
Chrome sample QA:5pecha pages become2full pages; initial0.3in default clipped large
Unicode title glyphs, corrected to0.6in; frames disappear, title text fully visible,
print-sheet view shows one front/back sheet. Regression checks geometry, baseline,
yi-go eligibility, section starts, print dimensions/margins and mode restoration.

Import limitations now remain in a collapsible report above the preview until the
next document is opened, rather than appearing only in a short toast. The report
includes native/RTF warnings and unsupported-character counts, uses plain text,
and is excluded from print. Chrome QA verified the experimental-image warning
remains visible with the imported image. This report is session UI, not saved
document metadata. Inline Copy/Move UI QA also verified100% reset, default spacing,
visible size doubling from50%, and relocation without an extra old text marker.

### Page-type first baselines

Title/Fancy/Body now have an explicit first-baseline distance from the innermost
box. Native Type_n BaseLineAdj imports into this value rather than being discarded
for automatic centering. Installed guide2.0 Fig21 labels this “Box to top Baseline”;
Fig22 arrow3 ends at the baseline under Roman text, not the glyph top.
The old nullable first-line-top setting remains compatible with saved web files.
An explicit baseline takes precedence; clearing it restores the previous setting.
Rendering and image text exclusions use the same baseline geometry. Tests verify
fixed baseline across font-size changes, native import, template retention and
legacy top-edge fallback. Chrome QA entered0.6in for Title, observed repositioning
and disabled top-edge control, then cleared it to restore automatic placement.
Exact historical glyph metrics and printer rounding remain unverified.

### Expanded experimental native image reader

Version1.0 supports only the observed28-byte asset and40-byte inline records,
with explicit bounds and record-size checks. Version1.1 imports fixed-page images
using slots0/1/2 for outer/inner/text left and4/5/6 for text/inner/outer right.
Slot3 is a hidden native center option with a drawing branch; it is reported and
skipped here. Page numbers are one-based document pages; inward/downward shifts
retain their positive direction. Assets remain shared across placements.
These mappings come from read-only serializer, dialog and drawing inspection;
the independent reader does not reuse native implementation code or assets.
Synthetic regression fixtures cover equivalent1.0/1.1 inline output, rejected
record sizes, all six anchors, preserved page/shift/margin values, asset sharing
and unsupported center reporting. Chrome file-picker QA showed a right text-side
page image and subsequently opened the older-format fixture with just its inline
image and yi-go placement. Real Windows image specimens and pixel-level output
comparison are still unavailable: this entire import path remains experimental.

### Unicode character selection

The character picker implements the documented CharSelect workflow with Unicode
Tibetan characters grouped by letters, subjoined forms, marks, signs and numbers.
A supported typeface can be applied to the inserted character while preserving
surrounding font and other attributes. Selection is replaced; insertion inside
a visible formatting token moves to its boundary. Combining glyph examples use
ka as a display base; only the actual mark is inserted. This replaces the original
legacy font-code charts with Unicode and does not expose arbitrary installed fonts.
Chrome QA inserted ka and vowel i, verified text contains only the actual chosen
characters, and confirmed repeated clicks do not scroll away from the palette.
Initial dotted-circle samples displayed missing-glyph boxes; using ka fixed them.
Tests verify replacement, surrounding style/font restoration and atomic tokens.

Static image sizing clarification: original Ignore DPI uses source pixels as
reference-screen logical units and rounds scaled dimensions to integers. Its
ordinary path also rounds to reference-display logical units before scaling.
The web continues to use96CSS pixels/inch; exact display-dependent native
rounding is not reproduced. There is no universal hardcoded Windows96DPI fallback.

Horizontal and vertical image resolution are now independent. Native1.0/1.1 records
and PNG pHYs metadata retain both axes; if either native axis is missing, both use
the documented web96DPI fallback with a warning. Ignore DPI uses96 for both axes.
The optional vertical DPI field inherits horizontal DPI when blank, preserving old
web documents. Scale/copy, page-image text exclusion, yi-go, save/load, print SVG,
and RTF goal-size round trips use the same independent dimensions. SVG images fill
that physical rectangle without preserving the source pixel aspect ratio. Original
PNG bytes are retained on PNG upload so Download PNG keeps their density metadata;
placement overrides remain document settings. JPEG/WebP still convert to PNG at96DPI.
Synthetic fixtures and browser checks cover a96x48-pixel image at96x48DPI becoming
one inch square. Actual native display rounding and real image-file parity remain open.

### Compact page view

Installed guide2.0 §8.8 describes pages pushed together without intervening space
and printing disabled while compact view is enabled. The web switch removes
preview gaps/captions and disables app print buttons; turning it off restores
normal spacing and printing. It is a screen preference, preserved in full web
documents, with no change to generated print SVGs. Browser-level print commands
remain under browser control and generate the normal print layout. Chrome QA
verified touching page edges, disabled print button, and restored captions/button
after switching off. The screen-guide print-equality regression includes compact.

### Preview navigation

Go to Page uses one-based document pages (including blank backs), independent
of Tibetan/Arabic numbering starts. Ctrl+G/Command+G focuses the field. A jump
switches from sheet preview to page preview. Previous/Next buttons browse batches
of24 pages or sheet sides; changing view or loading a document resets the window.
The preview limit does not change pagination, imposition or print output.
Chrome QA used55 explicit pages: batches1–24,25–48,49–55, disabled final Next,
direct jump30–53, and20 sheet sides after switching view. A visual contrast defect
was fixed and rechecked. The original GoToPage menu is documented; selection and
scroll details are web-specific, not a verified recreation of native editor focus.

### Formatting-code navigation and hard returns

Previous/Next formatting mark selects the entire preceding/following brace token
in the current text. It does not wrap at either end. Remove selected line breaks
deletes CR/LF from the selection without inserting spaces or removing page-break
marks. No selection leaves the document unchanged and asks for a selection.
These correspond to original menu/status-help commands; selecting visible web
marks is a web-editor adaptation rather than native exposed-code rendering.
Tests cover selection boundaries, adjacent marks, end-of-document, CRLF, page
break preservation and empty selection. Chrome QA navigated bold/end-bold and
back, then removed a selected line break while preserving formatting/page break.

### Session revert checkpoint

Opening/loading/resuming a document captures a deep copy. Full Save refreshes
the checkpoint when the command is invoked, even if the browser download is
subsequently cancelled; partial-setting downloads do not. Revert confirms
discard, restores the checkpoint and source context, retains import warnings,
and updates browser recovery. It does not reread the file on disk or persist
the earlier checkpoint across reloads. This is partial native Revert equivalence.
Chrome QA saved a disposable document, changed it, cancelled revert (edits
retained), then confirmed revert (saved text restored). Regression verifies
checkpoint and restored document are independent copies including text sections.

### Browser recovery timing

Default recovery remains after each edit. The browser preference can use1/5/10/30
minute intervals or Off; first document recovery is immediate, later pending edits
are saved when due. Page-hide attempts a final save unless disabled. Off retains
the previous recovery without overwriting it. Quota/storage failures leave the
pending document available for retry and tell the user to download a copy.
This is browser-local recovery, not native .pxr files beside the original file.
Tests inject time/storage to verify due boundaries, disabled force-flush, quota
failure/retry, final flush and new-document reset. Chrome QA verified default
saved status, timed pending status, Off status, and resumption of immediate saves.
The full wall-clock minute was covered by deterministic tests, not a browser wait.

### Native PXA0.1 framing correction

Targeted original-writer inspection established that annotation-only files use
bare NON-BODY keys, rather than full-document iNiT-prefixed keys. Their header
has two count/flag fields after u4; compact non-TCC font record0 maps to stream
fontID5. The reader now accepts bare keys and offsets those compact records.
Raw streams retain embedded NUL/control bytes; out-of-block lengths are rejected.
Synthetic regression covers two compactfonts, rich bold text, independent counter
starts and retained body/layout. Chrome imported an original synthetic specimen,
visibly showing its Latin annotation, folio23/page401, preserved body and warning.
No real native PXA export fixture has been obtained. Subsequent static loader
and family-switch evidence shows implicit TCC slots0–4 inherit the current family;
changing families registers five font names without rewriting annotation/body
streams. The reader normalizes those slots using the existing TibetanMachine
conversion tables, an inferred common encoding with unverified full glyph coverage.
Source typeface cannot be recovered from the header and an explicit warning remains.
Unknown converted annotation/yi-go glyphs also now trigger an import warning. This is not a validated native round trip.

### Close versus New

Close document confirms, attempts enabled browser recovery, clears the session
document/checkpoint/print content and returns to the start screen. The next new
pecha uses default settings and blank annotations. This differs intentionally
from New/import retaining reusable annotations while the current document exists,
matching the documented Close/New distinction. Chrome QA confirmed start-screen
recovery remains available, new text is empty, both counters reset1 and annotation
fields are blank. Original Windows startup INI defaults are not imported.

### Editing shortcuts

Typeover is an optional session editing mode, toggled with the checkbox or unmodified Insert while
the text editor has focus. Ordinary typed text replaces the next Unicode grapheme cluster; at end
of text it appends. Tibetan stacks, vowels and surrogate pairs are not partially overwritten.
Typeover stops before visible formatting/image/page tokens and line boundaries. Existing selections
retain normal replacement. Paste, IME composition, formatting commands and character-picker insertion
remain normal insertions; a directly typed combining mark extends the preceding base. The native
browser performs the edit so its undo/redo history is retained. Mode is not saved in document files.
New, Close, opening/recovering a full document, and replacing body content return to Insert mode.
Applying layout or annotation settings keeps the current typing mode because body editing continues.
Targeted static inspection of the original executable confirms Insert toggling, initial Insert mode,
and the New/Close reset to Insert. Its ordinary character path protects native control records from
overwrite, and the release history confirms end-of-file support. These facts do not establish exact
Unicode stack, keyboard mapping, or IME equivalence; original runtime comparison remains open.

Ctrl/Command+S invokes full document Save while the editor is open. In the text
editor, Ctrl/Command+Enter inserts a page mark and Ctrl/Command+backslash inserts
a hard shad. Ctrl/Command+< and > select previous/next marks (physical Shift+comma
and Shift+period are also recognized for browsers reporting unshifted key names).
Chrome QA verified page/hard-shad tokens, pecha-download Save dialog, and both
Control/Command format navigation. The physical-key fallback fixed an observed
shortcut failure. Browser print behavior remains unchanged.


### Native fixed-shad import

Native byte 0x0B imports as `{hs}` in body and rich annotation streams, preserving
the exclusion from automatic rinchen-pung conversion. Plain yi-go/rhino text
uses the visible Tibetan shad. Font-size changes immediately before a fixed shad
are retained. Synthetic native fixtures test import, layout and web Save/Open.
The control identity is supported by the original Hard Shad command and manual;
original Windows runtime and native export round trips remain unverified.


### Experimental Windows PXT layout export

The Windows layout download uses the observed standalone INI framing with CRLF,
ordered PageSetup/LineControl/PechaControl/PechaAnnotation/Type_0–2 sections,
thousandths of inches for paper and margins, six-decimal layout inches, BGR frame
colors, cumulative title/fancy endpoints and the observed 65535 body endpoint.
It emits no text streams, images, private document content or invented native font
IDs. PageNumFIndex is omitted because its IDs belong to a native document's font
table; its native missing-key behavior and the exported file remain runtime-unverified.

Explicit baseline distances are preserved. Automatic placement is converted using
the current font metrics and configured line count, with a warning that shorter
title blocks may move. Legacy top offsets are converted to baseline offsets.
Native integer number sizes are rounded, Tibetan size uses the existing 0.75
import ratio, and unsupported page-number rotations use native 90 degrees with
a warning. Fonts, body sizes, semantic styles, text, images, automatic marks,
numbering starts and print choices require a full web Save to preserve them.

All five public native samples retain the exported numeric template fields through
the independent writer/parser. Unit tests cover field units/colors, scope, invalid
values and automatic placement; Chrome covers download, notes, reimport, Save,
print SVG and PDF generation. These establish web behavior, not Windows acceptance
or font/layout fidelity. Full native PXP/PXC/PXA export remains unimplemented.


Print output hides the editor, start screen and toast; only prepared sheets enter
the PDF. A malformed print rule had exposed editor controls and extra pages.
Chrome regression checks print/screen visibility and actual PDF page objects
against prepared sheets. The 14-by-8.5-inch duplex fixture now produces exactly
two PDF pages rather than six, corroborated with pdfinfo.


### RTF picture paragraph formatting

Pictures now receive the active paragraph/character style on import even when no
text precedes them. RTF group restoration applies to the next image or text run.
Export emits the picture run's paragraph alignment before its PNG group, preserving
left/center/right/justified image-only paragraphs through the web RTF round trip.
Tests cover inherited size/bold, nested group restoration, physical dimensions,
rendered offsets and browser download/reimport/print SVG geometry. Original Windows
picture paragraph behavior remains unverified. Unequal RTF scale axes remain
explicitly warned and reduced to the horizontal scale; this increment does not
establish original support for those controls.


### Experimental modern TibetDoc import

The DCT reader accepts the tested PKTC version-5 signature, optional leading NUL,
a numeric metadata header with Ansi/TibetanAnsi encoding, header records and one
`1<TAB>!<TAB>` body. Older signatures, additional body records, oversized input,
unknown controls and truncated glyph/control pairs are rejected without replacing
the current document. Limits are 4 MB input, 64 KB per header line and bounded
converted output. All file parsing stays local.

Byte markers select one ANSI or TCC subfont glyph and then return to the header
default. The reader reuses the existing TibetanMachine conversion tables; Latin
text uses Windows-1252. Explicit tabs, line and page breaks are retained. Source
formatting controls are ignored with a warning; diacritical/symbol or unmapped
glyphs become visible replacement characters with counts. Import starts a new
web document using New's annotation/yi-go retention, resets typing mode and uses
web body sizing plus 18-point Latin text. It does not implement the native DCT
import-settings dialog or preserve source layout, styles and font identity.

The MIT-licensed public fixture is pinned and attributed under test/fixtures/dct.
Its text decodes without unknown glyphs, but its opening byte201 maps to U+0F06
in the existing legacy table; the independent public converter uses U+0F04.
This discrepancy is deliberately recorded in tests and shown as an import warning,
not normalized away or claimed equivalent. Original Windows import remains
unverified because guest filename entry is still ineffective. All DCT parity
items beyond the bounded tested path remain open; no DCT export is implemented.
