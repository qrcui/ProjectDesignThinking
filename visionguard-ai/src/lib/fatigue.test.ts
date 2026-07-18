import { describe, expect, it } from 'vitest';
import type { VisionMetrics, VisionTestResult } from '../types';
import { buildRecommendations, calculateBlinkRate, calculateFatigueScore, fatigueBand } from './fatigue';

const neutralMetrics: VisionMetrics = {
  faceDetected: true,
  lightingLevel: 0.62,
  lightingOk: true,
  distanceCm: 60,
  eyePixelDistance: 120,
  eyeAspectRatio: 0.3,
  eyeBaseline: 0.3,
  isBlinking: false,
  blinkCount: 10,
  blinkRatePerMinute: 15,
  sessionSeconds: 60,
  trackedSeconds: 60,
  tooCloseRatio: 0,
  fatigueScore: 0,
  fatigueBand: 'low',
  poseOk: true,
  modelFps: 9,
};

function resultWith(options: Partial<VisionTestResult>): VisionTestResult {
  return {
    id: 'result',
    completedAt: '2026-07-17T00:00:00.000Z',
    eyeMode: 'binocular',
    snellen: '<20/200',
    denominator: null,
    decimalAcuity: null,
    logMar: null,
    answers: [],
    accuracy: 0,
    averageDistanceCm: 60,
    screenCalibrated: true,
    cameraCalibrated: true,
    demo: false,
    ...options,
  };
}

describe('fatigue heuristics', () => {
  it('waits for enough tracked time before reporting blink rate', () => {
    expect(calculateBlinkRate(2, 10)).toBeNull();
    expect(calculateBlinkRate(10, 60)).toBe(10);
  });

  it('produces a higher score for low blink rate and close viewing', () => {
    const healthy = calculateFatigueScore({
      blinkRatePerMinute: 16,
      tooCloseRatio: 0.02,
      sessionMinutes: 10,
      trackedSeconds: 600,
    });
    const strained = calculateFatigueScore({
      blinkRatePerMinute: 5,
      tooCloseRatio: 0.8,
      sessionMinutes: 60,
      trackedSeconds: 3600,
    });

    expect(healthy).toBe(0);
    expect(strained).toBeGreaterThan(80);
    expect(fatigueBand(strained, 3600)).toBe('high');
  });

  it('recommends professional follow-up for a live null-acuity result', () => {
    expect(buildRecommendations(neutralMetrics, resultWith({ denominator: null }))).toContain(
      'poor-acuity',
    );
  });

  it('does not issue acuity follow-up from demo results', () => {
    expect(
      buildRecommendations(neutralMetrics, resultWith({ denominator: null, demo: true })),
    ).toEqual(['no-risk-signals']);
  });

  it('does not derive monitoring recommendations from simulated demo metrics', () => {
    expect(
      buildRecommendations(
        {
          ...neutralMetrics,
          distanceCm: 20,
          tooCloseRatio: 1,
          blinkRatePerMinute: 2,
          trackedSeconds: 1_500,
          sessionSeconds: 1_500,
        },
        null,
        true,
      ),
    ).toEqual(['demo-mode']);
  });

  it('does not report no risk before enough live data has been collected', () => {
    expect(
      buildRecommendations(
        {
          ...neutralMetrics,
          trackedSeconds: 0,
          blinkRatePerMinute: null,
          fatigueBand: 'collecting',
        },
        null,
      ),
    ).toEqual(['collecting-data']);
    expect(buildRecommendations({ ...neutralMetrics, trackedSeconds: 30 }, null)).toEqual([
      'no-risk-signals',
    ]);
  });
});
