# VisionGuard AI Delivery Validation Record

Validation date: 2026-07-17

## Static Checks and Build

| Check | Result |
|---|---|
| `npm run typecheck` | Passed |
| `npm run test` | Passed; all 106 tests across 13 test files passed |
| `npm run build` | Passed; Vite successfully transformed 142 modules |
| Parent-workspace `python .\serve_dist.py --no-browser --port 4201` | Passed; forwarding launcher served the built app with HTTP 200 |

The production build emitted approximately 78.14 kB of CSS and 473.42 kB of JavaScript (153.65 kB gzip). These sizes are informational and are not performance targets. Generated HTML uses relative `./assets/...` URLs for static hosting at an unknown subpath.

The production build includes:

- `dist/models/face_landmarker.task`
- `dist/mediapipe/wasm/vision_wasm_internal.js`
- `dist/mediapipe/wasm/vision_wasm_internal.wasm`
- The corresponding module and no-SIMD compatibility files

Model SHA-256:

```text
64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff
```

The model hashes in `public/` and `dist/` match.

## Browser Model Smoke Test

Chromium loaded the MediaPipe browser package used in production and read the local model, WASM loader, and WASM binary from the delivery directory. Validation results:

- Face Landmarker was created and closed successfully;
- The local `face_landmarker.task` request succeeded;
- The local `vision_wasm_internal.js` request succeeded;
- The local `vision_wasm_internal.wasm` request succeeded;
- The TensorFlow Lite XNNPACK CPU delegate was created successfully;
- No page exceptions occurred.

## Browser End-to-End Flow (Current Build)

The 2026-07-17 production bundle completed the following automated flow in Chromium/Selenium:

1. The earlier flow rendered in `zh-CN`, and the primary start action led to Consent; the current build instead maps the first visit from the device language, with English for unsupported or unavailable device languages, as covered by locale unit tests;
2. Symptom input remained usable without camera consent, allowing the camera-free/manual route;
3. Manual fallback completed all 27 Landolt C responses and produced a `20/20` result without camera access;
4. The result rendered exactly four numbered explanation blocks and three primary cards (acuity, blink rate, and viewing distance);
5. Editing the symptom form after completion did not reinterpret the completed result;
6. Optional persistence removed per-question answers, retained only seven necessary metric fields, and did not store symptom choices;
7. Unchecking local result storage immediately deleted saved summaries and the reminder and updated the saved preference;
8. The privacy status changed language immediately when the locale switched from Simplified Chinese to English;
9. Camera requesting/loading/running states exposed Pause, Stop, and Exit controls;
10. Demo monitoring displayed an explicit no-personal-health-advice message;
11. The campus entry generated a QR image locally;
12. A true 390 px layout viewport had no horizontal overflow;
13. No application console errors or page exceptions occurred.

After the mobile and locale changes, headless Edge device emulation measured the final production build at exact `390 × 844`, `360 × 800`, and `844 × 390` CSS viewports. At both portrait widths, the document scroll width equalled the viewport width, the language selector remained inside the header, and the camera/monitoring/calibration panels stayed inside the page. At `844 × 390`, the document also had no horizontal overflow; the hero, camera/metrics dashboard, and test setup used their landscape two-column layouts, and the camera stage measured at the intended 16:9 ratio.

The legacy 2026-07-13 end-to-end pass also exercised all 27 Landolt C responses, obtained a `20/20` demo result, verified exit/restart behavior, and checked restoration after demo shutdown. It remains useful regression evidence, but the current-build run above is authoritative for the newly added consent, localization, explanation, risk, trend, and access features.

## Requirement-oriented Verification

The following requirements are covered by implementation inspection, unit tests, and/or browser automation:

- Six visible stages from access through guidance;
- Consent before camera access and optional persistence of derived results;
- Lighting feedback and 40–80 cm distance guidance;
- Symptom input and multi-signal Normal/Caution/Concern classification;
- Four-part result explanation and three primary indicator cards;
- Pause, stop, exit, and manual fallback controls;
- Explicit foreground continuous monitoring, interruption handling, 20-minute/stop summaries, recommendation generation, strict persisted-report allowlisting, and storage-consent deletion;
- ISO/IEC 7810 ID-1 and ICAO TD-3 physical calibration references, legacy migration, and a clearly marked screen-diagonal estimate;
- Completion-time result snapshots, minimal structured persistence, and compatible migration of legacy history;
- Local trends, reminder, share/print output, campus link, and local QR generation;
- Sanitized URL configuration for campus name, campaign name, access code, and an approved HTTP(S)/email referral destination;
- Simplified Chinese, Traditional Chinese, and English, with device-language selection on first use, English fallback, and saved-choice precedence;
- Portrait/landscape phone layouts, safe-area padding, touch targets, and portable relative build paths;
- Static hosting with no account, application server, booking system, dedicated equipment, or staffed operation.

## Accuracy Targets Requiring External Validation

The following assignment targets are **not claimed as validated by this delivery**:

| Target | Evidence still required |
|---|---|
| Visual-acuity result within one chart line of a reference test | A preregistered participant study against a standardized, professionally administered chart or clinical reference, across representative displays and test conditions |
| Blink detection F1 greater than 0.85 | Frame/event-level ground-truth annotations from representative participants, glasses/lighting conditions, and cameras, followed by precision, recall, and F1 calculation |
| Viewing-distance error within 5 cm throughout 40–80 cm | Measurements against a calibrated physical distance reference at multiple distances, postures, cameras, zoom states, and participants |

The application's thresholds and automated tests establish deterministic software behavior, not clinical validity or sensor accuracy. These three metrics must remain marked **pending real-participant/calibrated-device validation** until the corresponding studies are completed.

## Notes

Automated validation demonstrates that the code paths, asset packaging, and primary interactions work, but it cannot replace camera, lighting, display, physical-reference, accessibility, and participant testing on the target computer. During initial deployment, complete an acceptance test on each supported device/browser, configure institution-approved campus and clinic information, and run the accuracy studies described above.
