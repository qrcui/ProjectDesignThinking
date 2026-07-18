import { describe, expect, it } from 'vitest';
import type { VisionMetrics } from '../types';
import {
  CONTINUOUS_WINDOW_SECONDS,
  calculateContinuousTrackingCoverage,
  createContinuousBaseline,
  createContinuousMonitoringReport,
  sanitizeContinuousMonitoringReport,
} from './continuousMonitoring';

function metrics(overrides: Partial<VisionMetrics> = {}): VisionMetrics {
  return {
    faceDetected: true,
    lightingLevel: 0.6,
    lightingOk: true,
    distanceCm: 60,
    eyePixelDistance: 120,
    eyeAspectRatio: 0.3,
    eyeBaseline: 0.3,
    isBlinking: false,
    blinkCount: 10,
    blinkRatePerMinute: 12,
    sessionSeconds: 60,
    trackedSeconds: 60,
    tooCloseRatio: 0.1,
    fatigueScore: 10,
    fatigueBand: 'low',
    poseOk: true,
    modelFps: 9,
    ...overrides,
  };
}

function report(current: VisionMetrics, activeSeconds = 120) {
  return createContinuousMonitoringReport({
    id: 'report-1',
    startedAt: '2026-07-17T00:00:00.000Z',
    endedAt: '2026-07-17T00:02:00.000Z',
    reason: 'stopped',
    activeSeconds,
    baseline: createContinuousBaseline(
      metrics({ trackedSeconds: 60, blinkCount: 10, tooCloseRatio: 0.1 }),
    ),
    metrics: current,
  });
}

describe('continuous monitoring reports', () => {
  it('calculates live coverage from the continuous-mode baseline, not engine totals', () => {
    expect(calculateContinuousTrackingCoverage(360, 300, 60)).toBe(1);
    expect(calculateContinuousTrackingCoverage(330, 300, 60)).toBe(0.5);
    expect(calculateContinuousTrackingCoverage(20, 300, 60)).toBe(0);
  });

  it('calculates window values from deltas instead of cumulative session totals', () => {
    const result = report(
      metrics({
        trackedSeconds: 180,
        blinkCount: 34,
        tooCloseRatio: 18 / 180,
      }),
    );

    expect(result.trackedSeconds).toBe(120);
    expect(result.blinkRatePerMinute).toBe(12);
    expect(result.tooCloseRatio).toBe(0.1);
    expect(result.trackingCoverage).toBe(1);
    expect(result.source).toBe('live-camera');
  });

  it('uses a collecting state rather than making claims from a short sample', () => {
    const result = report(
      metrics({ trackedSeconds: 65, blinkCount: 10, distanceCm: null }),
      5,
    );
    expect(result.recommendations).toEqual(['collecting-data']);
    expect(result.fatigueBand).toBe('collecting');
  });

  it('adds a break recommendation for a fully tracked 20-minute window', () => {
    const result = report(
      metrics({ trackedSeconds: 1_260, blinkCount: 250, tooCloseRatio: 0 }),
      CONTINUOUS_WINDOW_SECONDS,
    );
    expect(result.recommendations).toContain('long-session');
  });

  it('allowlists persisted report fields and rejects demo or malformed data', () => {
    const valid = report(metrics({ trackedSeconds: 180, blinkCount: 34 }));
    const sanitized = sanitizeContinuousMonitoringReport({
      ...valid,
      rawFrame: 'data:image/png;base64,not-allowed',
      symptoms: ['eyePain'],
    });
    expect(sanitized).toEqual(valid);
    expect(JSON.stringify(sanitized)).not.toContain('rawFrame');
    expect(JSON.stringify(sanitized)).not.toContain('eyePain');
    expect(
      sanitizeContinuousMonitoringReport({ ...valid, source: 'demo' }),
    ).toBeNull();
    expect(
      sanitizeContinuousMonitoringReport({
        ...valid,
        recommendations: ['demo-mode'],
      }),
    ).toBeNull();
    expect(
      sanitizeContinuousMonitoringReport({ ...valid, trackedSeconds: '120' }),
    ).toBeNull();
  });
});
