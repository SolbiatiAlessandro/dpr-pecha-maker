# Notices

**PechaMaker** is copyright Frederick W. Johnson. Nalandabodhi Pecha Maker is an independent project and is not
affiliated with it. It contains no PechaMaker code, documentation, sample files or fonts. It reads
PechaMaker files so that existing work stays usable.

**Fonts**, embedded in the page under the SIL Open Font License 1.1 (see `fonts/`):
- Jomolhari, copyright 2006 Christopher Fynn
- Noto Serif Tibetan, copyright The Noto Project Authors

**jsewts**, the Wylie converter in `vendor/`: Buddhist Digital Resource Center, Apache-2.0.

**pdf.js** 4.10.38 in `docs/vendor/`: Mozilla, Apache-2.0.

**Tesseract.js** 5.1.1, its core and the Tibetan model in `docs/vendor/ocr/`: Apache-2.0.

**Legacy font tables** in `src/legacy-table.js`: UTFC (Trace Foundation) and ATTU tables as published
in [buda-base/py-tiblegenc](https://github.com/buda-base/py-tiblegenc), Apache-2.0. TibetanMachine bytes
128-156 were added from the glyph shapes and font order. Only 129, 130, 133, 135, 144 and 150 have been
confirmed against real text so far.

**Example text**: the Dorje Chang Tungma by Bengar Jampal Zangpo, Tibetan as published by
[Lotsawa House](https://www.lotsawahouse.org/tibetan-masters/bengar-jampal-zangpo/invoking-the-blessings)
under CC BY-NC 4.0.

**Experimental TibetanClassic and TibetanChogyal tables** (base and Skt1–4) use the distinct
family maps from [py-tiblegenc tiblegenc.csv](https://github.com/buda-base/py-tiblegenc/blob/52a3c72f3afb6fe123d6605b124c488d6d47a102/pytiblegenc/font-tables/tiblegenc.csv),
Apache-2.0; license included in `src/legacy-table.LICENSE`. Pinned CSV SHA256:
`59d50a2975179e8533085c45e521af74fdf4e26b627c13647b535f25b78ee399`.
`tools/import_tcc_tables.py` retains Tibetan Unicode sequences, space and explicit empty
slots, and rejects four-zero error markers and non-Tibetan placeholders. The public
converter's Skt-to-Skt1 names are aliases. These are public conversion references,
not verified original font shapes; missing slots remain unresolved.
