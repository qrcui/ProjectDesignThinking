import { describe, expect, it } from 'vitest';
import { createVisionTestResult, decimalAcuity, logMar, optotypeSizeMm } from './acuity';

const answer = {
  denominator: 40,
  expected: 'right' as const,
  actual: 'right' as const,
  correct: true,
  distanceCm: 60,
  answeredAt: '2026-07-13T00:00:00.000Z',
};

describe('visual acuity helpers', () => {
  it('converts a 20/20 optotype at 60 cm to roughly 0.87 mm', () => {
    expect(optotypeSizeMm(20, 60)).toBeCloseTo(0.873, 2);
  });

  it('converts Snellen denominator to decimal acuity and logMAR', () => {
    expect(decimalAcuity(40)).toBe(0.5);
    expect(logMar(20)).toBe(0);
    expect(logMar(200)).toBe(1);
  });

  it('builds a serializable screening result', () => {
    const result = createVisionTestResult({
      eyeMode: 'binocular',
      denominator: 40,
      answers: [answer, answer],
      screenCalibrated: true,
      cameraCalibrated: true,
      demo: false,
    });

    expect(result.snellen).toBe('20/40');
    expect(result.accuracy).toBe(1);
    expect(result.averageDistanceCm).toBe(60);
  });

  it('labels failure at the largest optotype as worse than 20/200', () => {
    const result = createVisionTestResult({
      eyeMode: 'binocular',
      denominator: null,
      answers: [],
      screenCalibrated: true,
      cameraCalibrated: true,
      demo: false,
    });

    expect(result.snellen).toBe('<20/200');
  });
});
