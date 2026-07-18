export const DESKTOP_RUNTIME_BRIDGE_KEY = 'desktopRuntime' as const;

/** Stable preload/contextBridge contract shared with the Electron shell. */
export interface DesktopRuntimeBridge {
  isDesktop: true;
  platform: string;
  setMonitoringActive(active: boolean): void;
}

export interface DesktopMonitoringRuntime {
  kind: 'browser' | 'electron';
  allowsHiddenWindowMonitoring: boolean;
  setMonitoringActive(active: boolean): void;
}

interface RuntimeScope {
  desktopRuntime?: unknown;
}

const noOp = () => undefined;

const BROWSER_RUNTIME: DesktopMonitoringRuntime = {
  kind: 'browser',
  allowsHiddenWindowMonitoring: false,
  setMonitoringActive: noOp,
};

/**
 * Detects the narrow preload/contextBridge contract. User-agent strings and
 * Node-like globals are deliberately ignored: neither establishes that an
 * Electron shell is configured to keep media/inference active while hidden.
 */
export function detectDesktopMonitoringRuntime(
  scope: unknown = typeof window === 'undefined' ? undefined : window,
): DesktopMonitoringRuntime {
  if (!scope || typeof scope !== 'object') return BROWSER_RUNTIME;
  const bridge = (scope as RuntimeScope).desktopRuntime;
  if (!bridge || typeof bridge !== 'object') return BROWSER_RUNTIME;
  const candidate = bridge as Partial<DesktopRuntimeBridge>;
  if (
    candidate.isDesktop !== true ||
    typeof candidate.platform !== 'string' ||
    candidate.platform.trim().length === 0 ||
    typeof candidate.setMonitoringActive !== 'function'
  ) {
    return BROWSER_RUNTIME;
  }

  return {
    kind: 'electron',
    allowsHiddenWindowMonitoring: true,
    setMonitoringActive(active: boolean) {
      try {
        candidate.setMonitoringActive?.(active);
      } catch {
        // The renderer remains usable if the desktop IPC bridge is unavailable.
      }
    },
  };
}

declare global {
  interface Window {
    /** Optional API exposed by the trusted Electron preload/contextBridge. */
    desktopRuntime?: DesktopRuntimeBridge;
  }
}
