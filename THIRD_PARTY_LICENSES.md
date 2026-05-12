# Third-Party Licenses

This product bundles or embeds the following third-party software. Each is
listed with its license. The full text of permissive licenses is reproduced
below.

---

## SuperSplat

**Project:** SuperSplat (https://github.com/playcanvas/supersplat)
**License:** MIT
**Used as:** Embedded viewer for `.ply` / `.splat` point-cloud / Gaussian
Splat files in the in-app "3D Plus" surface
(`src/pages/patient/Scan3DPlusView.tsx`,
`src/lib/scanning/SuperSplatEmbed.tsx`).

The current integration loads `https://superspl.at/editor?load=…` in an
iframe. A self-hosted SuperSplat deployment is planned for production to
avoid sending PHI-derived assets to a third-party origin; see the in-code
comment in `src/lib/scanning/SuperSplatEmbed.tsx`.

```
Copyright (c) 2011-2026 PlayCanvas Ltd.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```
