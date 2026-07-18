import { describe, expect, it } from 'vitest';
import type { AcuityAnswer, VisionMetrics, VisionTestResult } from '../types';
import {
  minimizeResultForPersistence,
  legacyVisionMetricsSnapshot,
  parseVisionMetricsSnapshot,
  snapshotVisionMetrics,
  visionMetricsFromSnapshot,
} from './resultSnapshot';

const metrics: VisionMetrics = {
  faceDetected: true,
  lightingLevel: 0.61,
  lightingOk: true,
  distanceCm: 59.4,
  eyePixelDistance: 121,
  eyeAspectRatio: 0.3,
  eyeBaseline: 0.31,
  isBlinking: false,
  blinkCount: 8,
  blinkRatePerMinute: 12.5,
  sessionSeconds: 84,
  trackedSeconds: 63,
  tooCloseRatio: 0.08,
  fatigueScore: 14,
  fatigueBand: 'low',
  poseOk: true,
  modelFps: 12,
};

const answer: AcuityAnswer = {
  denominator: 40,
  expected: 'left',
  actual: 'left',
  correct: true,
  distanceCm: 59.4,
  answeredAt: '2026-07-17T00:00:00.000Z',
};

function result(): VisionTestResult {
  return {
    id: 'result-1',
    completedAt: '2026-07-17T00:01:00.000Z',
    eyeMode: 'binocular',
    snellen: '20/40',
    denominator: 40,
    decimalAcuity: 0.5,
    logMar: 0.3,
    answers: [answer],
    accuracy: 1,
    averageDistanceCm: 59.4,
    screenCalibrated: true,
    cameraCalibrated: true,
    demo: false,
    metricsSnapshot: metrics,
    metricsSnapshotComplete: true,
  };
}

describe('completed-result snapshots', () => {
  it('captures only the derived fields needed for result interpretation', () => {
    const snapshot = snapshotVisionMetrics(metrics);
    expect(snapshot).toEqual({
      distanceCm: 59.4,
      blinkRatePerMinute: 12.5,
      sessionSeconds: 84,
      trackedSeconds: 63,
      tooCloseRatio: 0.08,
      fatigueScore: 14,
      fatigueBand: 'low',
    });
    expect(snapshot).not.toHaveProperty('eyePixelDistance');
    expect(snapshot).not.toHaveProperty('eyeAspectRatio');
    expect(snapshot).not.toHaveProperty('modelFps');
  });

  it('persists aggregate accuracy and metrics but no per-question answers', () => {
    const original = result();
    const persisted = minimizeResultForPersistence(original);
    const serialized = JSON.stringify(persisted);

    expect(persisted.accuracy).toBe(1);
    expect(persisted.answers).toEqual([]);
    expect(persisted.metricsSnapshot).toEqual(snapshotVisionMetrics(metrics));
    expect(original.answers).toEqual([answer]);
    expect(serialized).not.toContain('expected');
    expect(serialized).not.toContain('actual');
    expect(serialized).not.toContain('answeredAt');
    expect(serialized).not.toContain('symptom');
  });

  it('allowlists persisted fields rather than copying unknown session context', () => {
    const withUnknownContext = {
      ...result(),
      symptoms: ['eyePain'],
      internalNote: 'session-only',
    } as VisionTestResult;
    const serialized = JSON.stringify(
      minimizeResultForPersistence(withUnknownContext),
    );

    expect(serialized).not.toContain('eyePain');
    expect(serialized).not.toContain('internalNote');
  });

  it('accepts a complete derived snapshot and rejects malformed local data', () => {
    const snapshot = snapshotVisionMetrics(metrics);
    expect(parseVisionMetricsSnapshot(metrics)).toEqual(snapshot);
    expect(parseVisionMetricsSnapshot({ ...metrics, trackedSeconds: '63' })).toBeNull();
    expect(parseVisionMetricsSnapshot(null)).toBeNull();
    expect(visionMetricsFromSnapshot(snapshot)).toMatchObject(snapshot);
    expect(visionMetricsFromSnapshot(snapshot).eyePixelDistance).toBeNull();
  });

  it('reconstructs a neutral legacy snapshot while keeping aggregate distance', () => {
    expect(legacyVisionMetricsSnapshot(58.2)).toEqual({
      distanceCm: 58.2,
      blinkRatePerMinute: null,
      sessionSeconds: 0,
      trackedSeconds: 0,
      tooCloseRatio: 0,
      fatigueScore: 0,
      fatigueBand: 'collecting',
    });
    expect(legacyVisionMetricsSnapshot('58.2').distanceCm).toBeNull();
  });
});
