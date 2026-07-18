# VisionGuard AI for Android

The Android app wraps the same local-first Vite build with Capacitor. Camera
frames and MediaPipe inference stay inside the device WebView; the app does not
add a remote API, analytics SDK, microphone permission, or photo-library
permission.

## Prerequisites

- Node.js 22 or newer;
- Android Studio with Android SDK 36;
- JDK 21 (Android Studio's bundled JDK is suitable);
- an Android 7.0/API 24 or newer physical device or emulator with a current
  Android System WebView.

Set `JAVA_HOME` and `ANDROID_HOME`, or let Android Studio manage them. The
machine used for the initial Windows package did not have Java/Android SDK
installed, so Gradle APK compilation must be run after those prerequisites are
available.

## Build a directly installable debug APK

On Windows:

```powershell
npm ci
npm run android:apk
```

On Linux or macOS:

```bash
npm ci
npm run android:apk:unix
```

The APK is written to:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

This debug-signed APK is appropriate for device testing and assignment demos.
Install it with Android Studio or:

```bash
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

## Build a signed release APK or Play bundle

Keep the signing key outside Git. Set these four environment variables:

```text
VISIONGUARD_ANDROID_KEYSTORE=/absolute/path/visionguard-release.jks
VISIONGUARD_ANDROID_KEYSTORE_PASSWORD=...
VISIONGUARD_ANDROID_KEY_ALIAS=...
VISIONGUARD_ANDROID_KEY_PASSWORD=...
```

Then run `npm run android:apk:release` on Windows or
`npm run android:apk:release:unix` on Linux/macOS. The signed APK is written
under `android/app/build/outputs/apk/release/`.

For Google Play, run `npm run android:bundle` on Windows or
`npm run android:bundle:unix` on Linux/macOS. The `.aab` output is under
`android/app/build/outputs/bundle/release/`. If the four variables are absent,
Gradle can create an unsigned release artifact, but it cannot be installed or
published until it is signed.

## Development workflow

After changing React/TypeScript/CSS or bundled model assets, always synchronize
the native project:

```bash
npm run android:sync
```

Use `npm run android:open` to synchronize and open Android Studio, or
`npm run android:run` to choose a connected device from the terminal.

The Android manifest declares camera access but marks camera hardware optional
because the application's manual/demo route remains usable without it. Android
asks for camera access only after the in-app consent flow calls
`getUserMedia()`. Cleartext HTTP is disabled and application data backup is
disabled because opted-in derived screening history may be stored locally.

Continuous monitoring on Android remains a foreground feature. Locking the
screen, switching applications, the OS suspending the WebView, or closing the
app interrupts monitoring; the APK is not a hidden camera service.

## Device acceptance checks

Test at least one real phone as well as an emulator:

1. first-run consent and camera allow/deny;
2. denial recovery through Android Settings;
3. front-camera selection, portrait/landscape rotation, safe areas, and the
   software keyboard;
4. local Face Landmarker/WASM loading while offline;
5. pause/resume and interruption when the app moves to the background;
6. result persistence, JSON export through the Android share/save sheet, and
   local-data deletion;
7. upgrade install over an earlier APK with the same application ID.
