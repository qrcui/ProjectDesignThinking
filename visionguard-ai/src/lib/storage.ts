export function readStorage<T>(key: string, fallback: T): T {
  try {
    const value = window.localStorage.getItem(key);
    if (!value) return fallback;
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function writeStorage<T>(key: string, value: T): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage can be blocked in private mode. The app remains usable in memory.
  }
}

async function shareNativeJson(filename: string, json: string): Promise<void> {
  try {
    const savedFile = await Filesystem.writeFile({
      path: filename,
      data: json,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
    });
    await Share.share({
      title: filename,
      url: savedFile.uri,
      dialogTitle: 'Export VisionGuard AI results',
    });
  } catch {
    // If a device cannot expose the cache file, the native text share sheet is
    // still a useful export route and does not require storage permission.
    await Share.share({
      title: filename,
      text: json,
      dialogTitle: 'Export VisionGuard AI results',
    });
  }
}

export function downloadJson(filename: string, value: unknown): void | Promise<void> {
  const json = JSON.stringify(value, null, 2);
  if (Capacitor.isNativePlatform()) return shareNativeJson(filename, json);

  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
