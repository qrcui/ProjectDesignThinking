import { createWriteStream, existsSync, mkdirSync, readdirSync, statSync, copyFileSync, rmSync, renameSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import https from 'node:https';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const strict = process.argv.includes('--strict');
const wasmSource = join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm');
const wasmTarget = join(root, 'public', 'mediapipe', 'wasm');
const modelTarget = join(root, 'public', 'models', 'face_landmarker.task');
const modelUrl = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

function copyDirectory(source, target) {
  mkdirSync(target, { recursive: true });
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    const from = join(source, entry.name);
    const to = join(target, entry.name);
    if (entry.isDirectory()) copyDirectory(from, to);
    else copyFileSync(from, to);
  }
}

function download(url, target, redirects = 0) {
  return new Promise((resolveDownload, reject) => {
    if (redirects > 5) {
      reject(new Error('Too many redirects while downloading the model'));
      return;
    }

    mkdirSync(dirname(target), { recursive: true });
    const temp = `${target}.download`;
    const request = https.get(url, { headers: { 'User-Agent': 'VisionGuard-AI/1.0' } }, (response) => {
      if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume();
        download(new URL(response.headers.location, url).toString(), target, redirects + 1)
          .then(resolveDownload)
          .catch(reject);
        return;
      }

      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`Model download failed: HTTP ${response.statusCode ?? 'unknown'}`));
        return;
      }

      const file = createWriteStream(temp);
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        if (existsSync(target)) rmSync(target);
        renameSync(temp, target);
        resolveDownload();
      });
      file.on('error', (error) => {
        file.close();
        if (existsSync(temp)) rmSync(temp);
        reject(error);
      });
    });
    request.on('error', reject);
  });
}

async function main() {
  if (existsSync(wasmSource)) {
    if (existsSync(wasmTarget)) rmSync(wasmTarget, { recursive: true, force: true });
    copyDirectory(wasmSource, wasmTarget);
    console.log('✓ MediaPipe WASM copied to public/mediapipe/wasm');
  } else if (strict) {
    throw new Error('MediaPipe dependency not found. Run npm install first.');
  }

  const modelReady = existsSync(modelTarget) && statSync(modelTarget).size > 3_000_000;
  if (!modelReady) {
    try {
      console.log('Downloading the Face Landmarker model (about 3.6 MB)…');
      await download(modelUrl, modelTarget);
      console.log('✓ Face Landmarker model saved to public/models');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (strict) throw error;
      console.warn(`⚠ Unable to pre-download the model: ${message}`);
      console.warn('  The app will try to load it from the official URL at runtime. Run npm run assets before using the app offline.');
    }
  } else {
    console.log('✓ Face Landmarker model is ready');
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
