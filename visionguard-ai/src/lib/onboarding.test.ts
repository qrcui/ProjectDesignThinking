import { describe, expect, it } from 'vitest';
import type { EngineStatus } from '../types';
import { resolvePostConsentDestination } from './onboarding';

describe('post-consent onboarding destination', () => {
  it.each<readonly [EngineStatus, 'camera' | 'calibration']>([
    ['idle', 'camera'],
    ['requesting-camera', 'camera'],
    ['loading-model', 'camera'],
    ['paused', 'camera'],
    ['error', 'camera'],
    ['demo', 'camera'],
    ['running', 'calibration'],
  ])('routes an uncalibrated %s session to %s', (status, destination) => {
    expect(resolvePostConsentDestination(status, false)).toBe(destination);
  });

  it('does not require another camera start when this session is calibrated', () => {
    expect(resolvePostConsentDestination('idle', true)).toBe('calibration');
  });
});
