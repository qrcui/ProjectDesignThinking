import type {
  FatigueBand,
  VisionMetrics,
  VisionMetricsSnapshot,
  VisionTestResult,
} from '../types';

const FATIGUE_BANDS: readonly FatigueBand[] = [
  'collecting',
  'low',
  'moderate',
  'high',
];

export const EMPTY_VISION_METRICS: VisionMetrics = {
  faceDetected: false,
  lightingLevel: null,
  lightingOk: false,
  distanceCm: null,
  eyePixelDistance: null,
  eyeAspectRatio: null,
  eyeBaseline: null,
  isBlinking: false,
  blinkCount: 0,
  blinkRatePerMinute: null,
  sessionSeconds: 0,
  trackedSeconds: 0,
  tooCloseRatio: 0,
  fatigueScore: 0,
  fatigueBand: 'collecting',
  poseOk: false,
  modelFps: 0,
};

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function finiteNumberOrNull(value: unknown): value is number | null {
  return value === null || finiteNumber(value);
}

/** Copies only the derived fields needed to reproduce result risk and sharing. */
export function snapshotVisionMetrics(
  metrics: VisionMetrics,
): VisionMetricsSnapshot {
  return {
    distanceCm: metrics.distanceCm,
    blinkRatePerMinute: metrics.blinkRatePerMinute,
    sessionSeconds: metrics.sessionSeconds,
    trackedSeconds: metrics.trackedSeconds,
    tooCloseRatio: metrics.tooCloseRatio,
    fatigueScore: metrics.fatigueScore,
    fatigueBand: metrics.fatigueBand,
  };
}

/** Rejects malformed local data instead of feeding it into health guidance. */
export function parseVisionMetricsSnapshot(
  value: unknown,
): VisionMetricsSnapshot | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<Record<keyof VisionMetricsSnapshot, unknown>>;
  if (
    !finiteNumberOrNull(candidate.distanceCm) ||
    !finiteNumberOrNull(candidate.blinkRatePerMinute) ||
    !finiteNumber(candidate.sessionSeconds) ||
    !finiteNumber(candidate.trackedSeconds) ||
    !finiteNumber(candidate.tooCloseRatio) ||
    !finiteNumber(candidate.fatigueScore) ||
    !FATIGUE_BANDS.includes(candidate.fatigueBand as FatigueBand)
  ) {
    return null;
  }

  return {
    distanceCm: candidate.distanceCm,
    blinkRatePerMinute: candidate.blinkRatePerMinute,
    sessionSeconds: candidate.sessionSeconds,
    trackedSeconds: candidate.trackedSeconds,
    tooCloseRatio: candidate.tooCloseRatio,
    fatigueScore: candidate.fatigueScore,
    fatigueBand: candidate.fatigueBand as FatigueBand,
  };
}

/** Rebuilds neutral ephemeral fields for existing risk/explanation consumers. */
export function visionMetricsFromSnapshot(
  snapshot: VisionMetricsSnapshot | null | undefined,
): VisionMetrics {
  if (!snapshot) return EMPTY_VISION_METRICS;
  return {
    ...EMPTY_VISION_METRICS,
    distanceCm: snapshot.distanceCm,
    blinkRatePerMinute: snapshot.blinkRatePerMinute,
    sessionSeconds: snapshot.sessionSeconds,
    trackedSeconds: snapshot.trackedSeconds,
    tooCloseRatio: snapshot.tooCloseRatio,
    fatigueScore: snapshot.fatigueScore,
    fatigueBand: snapshot.fatigueBand,
  };
}

/** Preserves a legacy result's aggregate distance while marking other data absent. */
export function legacyVisionMetricsSnapshot(
  averageDistanceCm: unknown,
): VisionMetricsSnapshot {
  return snapshotVisionMetrics({
    ...EMPTY_VISION_METRICS,
    distanceCm:
      finiteNumber(averageDistanceCm) ? averageDistanceCm : null,
  });
}

/**
 * Produces the only representation written to localStorage. Per-question
 * direction choices and timestamps are discarded; aggregate accuracy remains.
 */
export function minimizeResultForPersistence(
  result: VisionTestResult,
): VisionTestResult {
  return {
    id: result.id,
    completedAt: result.completedAt,
    eyeMode: result.eyeMode,
    snellen: result.snellen,
    denominator: result.denominator,
    decimalAcuity: result.decimalAcuity,
    logMar: result.logMar,
    answers: [],
    accuracy: result.accuracy,
    averageDistanceCm: result.averageDistanceCm,
    screenCalibrated: result.screenCalibrated,
    cameraCalibrated: result.cameraCalibrated,
    demo: result.demo,
    metricsSnapshotComplete: result.metricsSnapshotComplete === true,
    metricsSnapshot:
      parseVisionMetricsSnapshot(result.metricsSnapshot) ??
      snapshotVisionMetrics(EMPTY_VISION_METRICS),
  };
}
