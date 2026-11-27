# Original UI / workflow checklist

Evidence baseline: installed original guide v2.0 (June 2008), original 2.9 menu resource 103 and dialog resource labels 114–141, official release history, and privately ingested original forum topics. No live Windows session was used for this rebuild. “Tested” below means browser tests, not original-runtime comparison.

| Screen / workflow | Original evidence | Rebuild state and finite acceptance check |
| --- | --- | --- |
| Main window | Guide fig. 1, 6, 10, 11, 12; menu 103, toolbar 114 | Windows title/menu/toolbar/status bars; gray scrollable workspace, white paper, blue body/red title/green fancy hint frames. Screenshot captured. Native OS border/scrollbar/font rendering remains approximate. |
| Direct editing | Guide §5.3, fig. 12–14 | Caret typing, Enter, selection, paste, mixed font/color/style spans and reflow implemented. Browser test types a long fixture and checks every repeated sentence after reflow/save/reopen. No raw code textarea. Cross-page boundary deletion and original typeover behavior remain open. |
| Font selection | Guide §5.1.2, §5.3.1; Windows ChooseFont import | Toolbar family/size and modal Font controls. Size-only selected changes preserve bold and font family; tested. Available modern system/bundled Unicode fonts differ from legacy TCC/CSX fonts. Common font dialog grouping is reconstructed, not runtime measured. |
| Layout: Style | Guide fig. 2, 5, 8; resource 128 | Six original tabs; height, double-line separation, Default 1/2/3 counts and explicit Title/Fancy counts. Page types transition into Body; tested. Default 2/3 counts follow documented examples, but their full native geometry presets require runtime capture. |
| Layout: Title/Fancy/Body | Guide fig. 3, 7, §8.3; resources 129–131 | Lines, line height, top/side margin, double/single/no frame, color, inner/outer side widths and inside inset frame. Apply/Cancel and reflow tested. Squeeze Outside Box, Auto Adjust and second-title blank rules unfinished. Baseline placement approximates browser metrics. |
| Layout: Folio Numbers | Guide §8.4.1; resource 133 | Independent start, title visibility, font size and inset. Existing Unicode number-word routine reused. Native legacy font choices, Jyon and single-folio phrase unfinished. Exact native orientation/placement pending live reference. |
| Layout: Page Numbers | Guide §8.4.2; resource 132 | Independent Arabic start, title/first-title visibility, bottom/center position, angle, size and inset. Title/fancy transition starting at 101 tested. Native font picker/precise inset anchoring pending. |
| Line Formatting | Guide fig. 13; resource 123 | Original two-group dialog; tab width, kerning and ordinary-page line/baseline controls work. Tibetan baseline adjustment disabled pending font/run implementation. |
| Normal / Pecha / Compact / hints | Guide fig. 1 and §8.8; resource 103 | Frame toggling, compact page height, hint colors, page margins and baselines. Normal/Pecha toggling preserves text; tested. Native compact spacing and cursor-follow settings need runtime comparison. |
| Page Setup / Placement | Guide §8.2, §8.6; resource 134 | Paper size, equal margin and portrait/landscape swap; top or centered placement and pages per sheet. Two-up sheet count and PDF generation tested. Native per-edge margins and printer capabilities not reproduced. |
| File lifecycle | Guide §4, resource 103 | New, plain-text open, validated web document open/save. Rich text and settings round trip tested. Native PXP/PXC/PXT/PXA/RTF/DCT import/export, auto recovery and revert remain disconnected; unavailable menu items disabled. Unsaved-change confirmation is still needed before replacing a document. |
| Print | Guide §8.7, resource 135 | Print-ready paper geometry; screen-only margins/baselines/hint colors excluded. Letter PDF rendered and visually checked, Tibetan text extracted correctly. Odd/even passes, reverse/rotate/cut marks and original Print Options dialog unfinished. |
| Annotation Controls | Guide §8.5, resources 126–127 | Disabled; original multi-position/page-type rich paste workflow still to build. |
| Tibetan options / keyboards | Guide §5.1–2, §7; resources 121, 122, 124, 125 | TCC mapping, locked keyboard, Sambhota, shad transformation, yi-go, dzog thik and CharSelect disabled. No Kathmandu-only semantic roles added. |
| Images / advanced editing | Guide §9; resources 118–120 | Inline/page images, format-code navigation/exposure, hard shad and native typeover remain unfinished. Hard page break insertion exists but needs a larger fixture suite. |
| Help / About | Resource 136–141 | About states independent rebuild scope. Synthetic sample available for review; original help/update commands disabled. |

## Review artifacts

`test-output/01-new-document.png` through `08-pecha-menu.png` show the implemented browser surfaces. `output.pdf` and `two-up.pdf` exercise printing. These are generated locally and ignored by Git. Side-by-side original-vs-rebuild comparisons are kept in the private evidence directory because they include original manual screenshots; they are not published in this repository.

## Next original-runtime captures

1. Main window at a recorded viewport/DPI, every menu, toolbar on/off, empty/default document.
2. Font dialog with a mixed selection, caret font changes, locked keyboard, cross-page caret/delete/selection.
3. Every Layout tab for each default preset, including all numeric defaults and controls absent from this first slice.
4. Ordinary/compact pecha views with identical synthetic input and original fonts; baseline and wrap positions.
5. Save/reopen the synthetic fixture, then print normal and two-up pages to compare physical dimensions and folio/page-number orientation.

No full-parity claim follows from this checklist or the automated browser tests.
