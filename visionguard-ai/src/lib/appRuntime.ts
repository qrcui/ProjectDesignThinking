import { Capacitor } from '@capacitor/core';
import { detectDesktopMonitoringRuntime } from './desktopRuntime';

export type AppRuntime = 'web' | 'android' | 'ios' | 'native' | 'desktop';

interface NativeRuntimeProbe {
  isNativePlatform(): boolean;
  getPlatform(): string;
}

/** Uses trusted runtime bridges instead of user-agent sniffing. */
export function detectAppRuntime(
  scope: unknown = typeof window === 'undefined' ? undefined : window,
  nativeRuntime: NativeRuntimeProbe = Capacitor,
): AppRuntime {
  if (detectDesktopMonitoringRuntime(scope).kind === 'electron') return 'desktop';

  try {
    if (!nativeRuntime.isNativePlatform()) return 'web';
    const platform = nativeRuntime.getPlatform();
    if (platform === 'android' || platform === 'ios') return platform;
    return 'native';
  } catch {
    return 'web';
  }
}

export function isNativeAppRuntime(runtime: AppRuntime): boolean {
  return runtime === 'android' || runtime === 'ios' || runtime === 'native';
}
