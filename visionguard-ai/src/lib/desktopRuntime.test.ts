import { describe, expect, it, vi } from 'vitest';
import { detectDesktopMonitoringRuntime } from './desktopRuntime';

function expectBrowserRuntime(value: ReturnType<typeof detectDesktopMonitoringRuntime>) {
  expect(value.kind).toBe('browser');
  expect(value.allowsHiddenWindowMonitoring).toBe(false);
}

describe('desktop monitoring runtime bridge', () => {
  it('keeps an ordinary browser on the foreground-only policy', () => {
    expectBrowserRuntime(detectDesktopMonitoringRuntime(undefined));
    expectBrowserRuntime(
      detectDesktopMonitoringRuntime({ navigator: { userAgent: 'Electron/99' } }),
    );
    expectBrowserRuntime(
      detectDesktopMonitoringRuntime({ process: { versions: { electron: '99' } } }),
    );
  });

  it('allows hidden-window monitoring only with the exact desktop bridge', () => {
    const setMonitoringActive = vi.fn();
    const runtime = detectDesktopMonitoringRuntime({
      desktopRuntime: {
        isDesktop: true,
        platform: 'win32',
        setMonitoringActive,
      },
    });

    expect(runtime.kind).toBe('electron');
    expect(runtime.allowsHiddenWindowMonitoring).toBe(true);
    runtime.setMonitoringActive(true);
    runtime.setMonitoringActive(false);
    expect(setMonitoringActive).toHaveBeenNthCalledWith(1, true);
    expect(setMonitoringActive).toHaveBeenNthCalledWith(2, false);
  });

  it.each([
    null,
    {},
    { isDesktop: false, platform: 'win32', setMonitoringActive() {} },
    { isDesktop: true, platform: '', setMonitoringActive() {} },
    { isDesktop: true, platform: 'win32' },
  ])('rejects a missing or malformed bridge: %o', (bridge) => {
    expectBrowserRuntime(detectDesktopMonitoringRuntime({ desktopRuntime: bridge }));
  });

  it('contains bridge IPC failures instead of breaking the monitoring UI', () => {
    const runtime = detectDesktopMonitoringRuntime({
      desktopRuntime: {
        isDesktop: true,
        platform: 'darwin',
        setMonitoringActive() {
          throw new Error('IPC unavailable');
        },
      },
    });
    expect(() => runtime.setMonitoringActive(true)).not.toThrow();
  });
});
