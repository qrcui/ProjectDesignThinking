import { describe, expect, it } from 'vitest';
import { detectAppRuntime, isNativeAppRuntime } from './appRuntime';

const webProbe = {
  isNativePlatform: () => false,
  getPlatform: () => 'web',
};

describe('application runtime detection', () => {
  it('uses a trusted Electron bridge for desktop builds', () => {
    expect(
      detectAppRuntime(
        {
          desktopRuntime: {
            isDesktop: true,
            platform: 'darwin',
            setMonitoringActive() {},
          },
        },
        webProbe,
      ),
    ).toBe('desktop');
  });

  it('recognizes a Capacitor Android build', () => {
    const runtime = detectAppRuntime(undefined, {
      isNativePlatform: () => true,
      getPlatform: () => 'android',
    });
    expect(runtime).toBe('android');
    expect(isNativeAppRuntime(runtime)).toBe(true);
  });

  it('keeps an ordinary webpage in the web copy branch', () => {
    expect(detectAppRuntime(undefined, webProbe)).toBe('web');
    expect(isNativeAppRuntime('web')).toBe(false);
  });
});
