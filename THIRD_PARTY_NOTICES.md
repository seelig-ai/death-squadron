# Third-party notices

death-squadron is MIT licensed (see LICENSE). It contains code ported from, and assets made by, the projects below. Their notices are kept here as their licences require.

## Ported code

### azorkai/claude-code-office (MIT)

Source: https://github.com/azorkai/claude-code-office (commit 0e0cc0b). The lane timeline (`web/src/lanes.js`) is a port of `public/js/akis.js`. The transcript event model from `server.js` (ingest, tool categories and labels, subagent discovery) lives in the vendored reader, `core/vendor/live-core/categorize.js`, `ingest.js` and `subagents.js`.

```
MIT License

Copyright (c) 2026 azorkai

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### Kostakurta8/roundtable (MIT)

Source: https://github.com/Kostakurta8/roundtable (commit 242bc4e). The bounded incremental tailer from `server/tail.ts` (at most 1 MiB per pass, restart on a file that shrank) lives in `core/vendor/live-core/tail.js`.

The files in `core/vendor/live-core/` are compiled from a TypeScript live-view core by the same author as this package. `core/vendor/live-core/SOURCE` names the commit they were built from, and `scripts/vendor-core.js` rebuilds them.

```
MIT License

Copyright (c) 2026 Kostakurta8

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Bundled libraries

### three.js (MIT)

Copyright © 2010-2026 three.js authors. Bundled into `dist/` at build time. Licence: MIT, https://github.com/mrdoob/three.js/blob/dev/LICENSE

## Fonts

All fonts are shipped inside the package and loaded from the local server. None are fetched from a font service.

- **Aurebesh** by SilvinoR (github.com/silvinor/font-aurebesh). Copyright (c) 2022, SilvinoR, with Reserved Font Name AUREBESH. SIL Open Font License 1.1.
- **Michroma**. Copyright 2011 The Michroma Project Authors (github.com/googlefonts/Michroma-font). SIL Open Font License 1.1. Subset to Latin.
- **Rajdhani** (SemiBold, Bold). Copyright (c) 2014, Indian Type Foundry. SIL Open Font License 1.1. Subset to Latin.

The full OFL 1.1 text: https://openfontlicense.org

## Icons

- **Galactic Empire crest**: the `empire` icon from Font Awesome Free 6.7.2 by Fonticons, Inc. Icons licence: CC BY 4.0 (https://fontawesome.com/license/free). Used as the crest in the header, on the hulls and on the bridge walls.

## Fan project

Star Wars, the Galactic Empire, Darth Vader, stormtroopers, Star Destroyers and TIE fighters are trademarks of Lucasfilm Ltd. This is an unofficial fan project, not affiliated with or endorsed by Lucasfilm, Disney or Anthropic.
