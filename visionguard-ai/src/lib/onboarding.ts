import type { EngineStatus } from '../types';

export type PostConsentDestination = 'camera' | 'calibration';

/**
 * Distance calibration needs a live camera session. The consent checkbox,
 * camera-loading states and camera-free demo do not establish that readiness.
 */
export function resolvePostConsentDestination(
  cameraStatus: EngineStatus,
  distanceCalibrated: boolean,
): PostConsentDestination {
  return !distanceCalibrated && cameraStatus !== 'running'
    ? 'camera'
    : 'calibration';
}
