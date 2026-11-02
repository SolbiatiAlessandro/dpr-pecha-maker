# Pecha Studio

Compose traditional Tibetan pecha in the browser and print them. Paste Unicode Tibetan or type Wylie,
adjust the boxes, yi-go, folio numbers and margin notes, and print to paper or PDF. Old PechaMaker
files (`.pxp`) open directly and convert to Unicode.

Live test site: <https://solbiatialessandro.github.io/pecha-studio/>

Everything runs in the browser. Text stays on your machine. `docs/index.html` is one self-contained
file, so it also works offline when saved locally.

## Working on it

```bash
python3 tools/build.py          # writes docs/index.html
node test/engine.test.js        # engine tests
```

Add a folder of `.pxp` files to the test command to run the importer over them.

`SPEC.md` describes the behaviour. `src/engine.js` holds layout and imposition, `src/folio.js` the
Tibetan number words, `src/pxp.js` the old file format, and `src/app.js` the interface.

Credits and licences are in `NOTICE.md`.
