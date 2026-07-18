import { describe, expect, it } from 'vitest';
import type { NormalizedPoint } from '../types';
import { calculateEyeAspectRatio, estimateDistanceCm } from './vision';

function syntheticLandmarks(): NormalizedPoint[] {
  const landmarks = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5 }));

  // Right eye: horizontal width 0.20, each vertical pair totals 0.08.
  landmarks[33] = { x: 0.2, y: 0.5 };
  landmarks[160] = { x: 0.25, y: 0.46 };
  landmarks[158] = { x: 0.35, y: 0.46 };
  landmarks[133] = { x: 0.4, y: 0.5 };
  landmarks[153] = { x: 0.35, y: 0.54 };
  landmarks[144] = { x: 0.25, y: 0.54 };

  landmarks[362] = { x: 0.6, y: 0.5 };
  landmarks[385] = { x: 0.65, y: 0.46 };
  landmarks[387] = { x: 0.75, y: 0.46 };
  landmarks[263] = { x: 0.8, y: 0.5 };
  landmarks[373] = { x: 0.75, y: 0.54 };
  landmarks[380] = { x: 0.65, y: 0.54 };

  return landmarks;
}

describe('vision calculations', () => {
  it('uses inverse proportionality for calibrated screen distance', () => {
    expect(estimateDistanceCm(120, 60, 120)).toBe(60);
    expect(estimateDistanceCm(120, 60, 80)).toBe(90);
    expect(estimateDistanceCm(0, 60, 80)).toBeNull();
  });

  it('calculates eye aspect ratio from six landmarks per eye', () => {
    const ear = calculateEyeAspectRatio(syntheticLandmarks(), 1000, 1000);
    expect(ear).toBeCloseTo(0.4, 5);
  });
});
