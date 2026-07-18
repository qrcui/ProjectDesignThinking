# VisionGuard AI Desktop Shell

The optional Electron shell packages the existing production web build for Windows and macOS. It is intended for consented continuous monitoring that must remain active when the main window is minimized or hidden. The browser/HTTPS deployment remains the right choice for QR-based phone access.

## Runtime behavior

- The application loads only the bundled `dist/` directory through the privileged, secure `visionguard://app/` protocol. The handler rejects other hosts, non-read methods, and paths that escape `dist/`.
- Remote referral links never replace the application page. Supported `https:`, `http:`, `mailto:`, and `tel:` links open in the operating system's external handler.
- Closing the main window hides it instead of stopping the process. Minimizing leaves the renderer active. Use the tray icon to reopen or hide the window.
- The process terminates only through **Quit VisionGuard AI** in the tray, **Cmd+Q**/the application menu on macOS, an operating-system shutdown/logoff, or a force quit.
- `backgroundThrottling` is disabled for the application window. This allows timers, camera capture, and local inference to continue while the window is hidden or minimized.
- A `prevent-app-suspension` power-save blocker is enabled only while the renderer reports that continuous monitoring is genuinely active. Pause, stop, exit, interruption, renderer failure, and application quit release it. It does not keep the display awake or override an explicit system sleep/shutdown.
- Starting continuous monitoring remains an explicit in-app action after camera consent. The shell does not auto-start monitoring or launch at login.

The preload exposes only this frozen API:

```ts
window.desktopRuntime = {
  isDesktop: true,
  platform: string,
  setMonitoringActive(active: boolean): void,
};
```

`setMonitoringActive` sends one boolean over the allow-listed `desktop:set-monitoring-active` IPC channel. No filesystem, shell, process, or generic IPC API is exposed to page code.

## Security boundary

The renderer uses:

- `contextIsolation: true`;
- `sandbox: true`;
- `nodeIntegration: false` in frames and workers;
- `webviewTag: false`;
- `webSecurity: true`;
- a restrictive Content Security Policy and Permissions Policy;
- blocked in-window navigation, popups, redirects, webviews, display capture, microphone access, and unrelated permission requests.

Camera permission is granted only to the main `visionguard://app/` renderer, only for a video-only request, and only after the web UI initiates the request following its own consent step. On macOS, the main process additionally requests operating-system camera authorization. The packaged app includes `NSCameraUsageDescription`.

The secure custom scheme is necessary because directly loading `dist/index.html` through `file://` can cause inconsistent secure-context, Fetch API, CORS, model, and WASM behavior. Relative Vite assets and local MediaPipe fetches resolve under `visionguard://app/`; the protocol never maps them outside `dist/`. The desktop Content Security Policy deliberately blocks the web build's remote model fallback, so bundled local assets are required.

## Install and run locally

Install the newly declared desktop development dependencies and prepare assets once:

```bash
npm install
```

Build `dist/` and launch Electron:

```bash
npm run desktop
```

If `dist/` is already current:

```bash
npm run desktop:run
```

The shell refuses to start when `dist/index.html` is absent. Run `npm run assets` if the bundled Face Landmarker model or MediaPipe WASM files are missing, then rebuild.

## Package installers

Create an unpacked application for smoke testing on the current host:

```bash
npm run desktop:pack
```

Create the installer/disk image for the current host:

```bash
npm run desktop:dist
```

Platform-specific commands are also available:

```bash
npm run desktop:dist:win
npm run desktop:dist:mac
```

The Windows target is NSIS and the macOS target is DMG. Build and test the Windows installer on Windows and the macOS image on macOS. Output is written to `release/` and is ignored by Git.

The checked-in `build/entitlements.mac.plist` enables Electron's JIT/unsigned executable-memory requirements and camera access for the main app and inherited helper processes. Library-validation disabling is deliberately omitted because this app does not load third-party native plugins; add that broader entitlement only if a reviewed native dependency proves it necessary.

An unsigned or ad-hoc-signed macOS build is suitable only for local development. Gatekeeper may require a manual first launch, camera authorization can be tied to an unstable development identity, and the artifact is not suitable for public distribution. A production macOS release must use a stable bundle identifier and Apple Developer ID Application identity, preserve the hardened runtime and explicit entitlements, and be notarized/stapled. Electron Builder can discover signing/notarization credentials from its documented environment variables; credentials must not be committed to this repository.

This repository contains the runtime/package skeleton, not production signing credentials. A public release still needs:

- a Windows code-signing certificate;
- an Apple Developer ID certificate, hardened-runtime signing, and notarization;
- final `.ico` and `.icns` application/installer artwork (the included SVG is a tray fallback only);
- camera tests on each target OS, including denial, later re-enabling in system settings, hide/minimize, pause/resume, sleep/wake, force quit, and installer upgrade behavior.

On Windows, camera access can be reviewed under **Settings → Privacy & security → Camera**. On macOS, use **System Settings → Privacy & Security → Camera**. Denial at the OS level cannot be bypassed by the Electron permission handler.

## Background limitations

This is a tray application, not an operating-system service. Continuous camera monitoring works only while the VisionGuard process is running and the user session permits camera use. Laptop lid closure, explicit sleep, logout, shutdown, force quit, OS resource policy, or another application taking exclusive camera access can interrupt a session. The report should surface any interruption rather than representing the missing interval as monitored time.

Relevant Electron APIs are documented in the official [BrowserWindow](https://www.electronjs.org/docs/latest/api/browser-window), [session permissions](https://www.electronjs.org/docs/latest/api/session), [protocol](https://www.electronjs.org/docs/latest/api/protocol), and [powerSaveBlocker](https://www.electronjs.org/docs/latest/api/power-save-blocker) references.
