# DPR Pecha Maker

Drop a PDF of a Tibetan text and get it back as a traditional pecha, ready to print. Adjust the boxes,
yi-go, folio numbers and margin notes, then print to paper or PDF. Pasted text, typed Wylie and old
PechaMaker files (`.pxp`) work too.

Live test site: <https://solbiatialessandro.github.io/dpr-pecha-maker/>

Everything runs in the browser. PDFs and text stay on your machine and are never uploaded.
`docs/index.html` is the page. `docs/vendor` holds pdf.js and the Tibetan OCR, which load only when a
PDF needs them.

## Working on it

```bash
python3 tools/build.py          # writes docs/index.html
node test/engine.test.js        # engine tests
```

Add a folder of `.pxp` files to the test command to run the importer over them.

`SPEC.md` describes the behaviour. `src/engine.js` holds layout and imposition, `src/folio.js` the
Tibetan number words, `src/pdfread.js` PDF reading and repair, `src/pxp.js` the old file format, and
`src/app.js` the interface.

Credits and licences are in `NOTICE.md`.
