# Third-party notices

VisionGuard AI contains or depends on the following third-party components.

## MediaPipe Tasks Vision 0.10.35

- Copyright Google LLC and contributors.
- License: Apache License 2.0.
- Included artifacts: browser JavaScript dependency and the local WASM files under `public/mediapipe/wasm/`.
- License text: `licenses/Apache-2.0.txt`.

## MediaPipe Face Landmarker model

- Copyright Google LLC and contributors.
- License: Apache License 2.0, as stated by the official Face Mesh, BlazeFace and blendshape model cards used by the Face Landmarker bundle.
- Included artifact: `public/models/face_landmarker.task`.
- SHA-256: `64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff`.
- License text: `licenses/Apache-2.0.txt`.

The checked-in model binary was recovered from the published
`@nuralogix.ai/tf-face-tracker-worker-ts` package because the build environment
could not reach Google Storage during packaging. Its byte hash matches the
standard MediaPipe Face Landmarker task model used by the application. The
package license is retained at `licenses/Nuralogix-MIT.txt` for provenance.
No Nuralogix runtime code is used by this project.

## React and React DOM 18.3.1

- Copyright Meta Platforms, Inc. and affiliates.
- License: MIT.

## Capacitor 8

- Components: `@capacitor/core`, `@capacitor/android`,
  `@capacitor/filesystem`, `@capacitor/share`, and the development-time CLI.
- Copyright (c) 2017-present Drifty Co.
- License: MIT.
- Use in this project: Android WebView runtime, native project integration, and
  the system share/save route used for JSON result export.

## QRCode 1.5.4 (`qrcode`)

- Copyright (c) 2012 Ryan Day.
- License: MIT.
- Use in this project: local generation of the campus-access QR image in the browser. QR content is generated locally and is not sent to a QR-code service.

## QRCode TypeScript declarations 1.5.6 (`@types/qrcode`)

- Copyright (c) Microsoft Corporation.
- License: MIT.
- Use in this project: development-time type declarations only; no declaration-package runtime code is shipped in the browser bundle.

The MIT license applying to the two QRCode entries above is reproduced below:

> Permission is hereby granted, free of charge, to any person obtaining a copy
> of this software and associated documentation files (the "Software"), to deal
> in the Software without restriction, including without limitation the rights
> to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
> copies of the Software, and to permit persons to whom the Software is
> furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in all
> copies or substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
> IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
> FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
> AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
> LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
> OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
> SOFTWARE.

## Vite, TypeScript, Vitest and related build dependencies

These development dependencies retain their respective upstream licenses in
`node_modules` after installation. See each package's metadata for details.
