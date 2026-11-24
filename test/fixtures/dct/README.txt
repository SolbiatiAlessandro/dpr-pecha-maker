Public modern TibetDoc fixture from karmapa/tibetDoc-converter, commit a9f7e9436e2b378f5342724729d907e627985017
Source: https://github.com/karmapa/tibetDoc-converter/blob/a9f7e9436e2b378f5342724729d907e627985017/__tests__/test.dct
MIT license reproduced in LICENSE. No private material or original PechaMaker assets.
Independent expected-text reference: https://github.com/karmapa/tibetdoc-parser/blob/24eef96/test.js
The existing TibetanMachine conversion table maps the opening byte201 to U+0F06 (followed by U+0F05/U+0F0D); the reference converter uses U+0F04 instead. This mismatch is documented and remains unverified against native PechaMaker.
