import type {
  FatigueBand,
  RecommendationCode,
  VisionMetrics,
} from '../types';
import { buildRecommendations, calculateBlinkRate, calculateFatigueScore, fatigueBand } from './fatigue';
import { clamp } from './geometry';
import { EMPTY_VISION_METRICS } from './resultSnapshot';

export const CONTINUOUS_WINDOW_SECONDS = 20 * 60;

export type ContinuousReportReason =
  | 'window-complete'
  | 'stopped'
  | 'interrupted'
  | 'exited';

export interface ContinuousMonitoringBaseline {
  trackedSeconds: number;
  blinkCount: number;
  tooCloseSeconds: number;
}

export interface ContinuousMonitoringReport {
  id: string;
  startedAt: string;
  endedAt: string;
  source: 'live-camera';
  reason: ContinuousReportReason;
  targetWindowSeconds: typeof CONTINUOUS_WINDOW_SECONDS;
  activeSeconds: number;
  trackedSeconds: number;
  trackingCoverage: number;
  blinkRatePerMinute: number | null;
  distanceCm: number | null;
  tooCloseRatio: number;
  fatigueScore: number;
  fatigueBand: FatigueBand;
  recommendations: RecommendationCode[];
}

const REPORT_REASONS: readonly ContinuousReportReason[] = [
  'window-complete',
  'stopped',
  'interrupted',
  'exited',
];

const FATIGUE_BANDS: readonly FatigueBand[] = [
  'collecting',
  'low',
  'moderate',
  'high',
];

const RECOMMENDATION_CODES: readonly RecommendationCode[] = [
  'too-close-now',
  'too-close-session',
  'low-blink',
  'long-session',
  'collecting-data',
  'no-risk-signals',
];

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function finiteNumberOrNull(value: unknown): value is number | null {
  return value === null || finiteNumber(value);
}

function validDate(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}

function round(value: number, digits = 1): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function createContinuousBaseline(
  metrics: VisionMetrics,
): ContinuousMonitoringBaseline {
  const trackedSeconds = Math.max(0, metrics.trackedSeconds);
  return {
    trackedSeconds,
    blinkCount: Math.max(0, metrics.blinkCount),
    tooCloseSeconds: Math.max(0, metrics.tooCloseRatio * trackedSeconds),
  };
}

export function calculateContinuousTrackingCoverage(
  currentTrackedSeconds: number,
  baselineTrackedSeconds: number,
  activeSeconds: number,
): number {
  if (activeSeconds <= 0) return 0;
  return round(
    clamp(
      Math.max(0, currentTrackedSeconds - baselineTrackedSeconds) / activeSeconds,
      0,
      1,
    ),
    3,
  );
}

export function createContinuousMonitoringReport(options: {
  id: string;
  startedAt: string;
  endedAt: string;
  reason: ContinuousReportReason;
  activeSeconds: number;
  baseline: ContinuousMonitoringBaseline;
  metrics: VisionMetrics;
}): ContinuousMonitoringReport {
  const { baseline, metrics } = options;
  const activeSeconds = Math.max(0, Math.round(options.activeSeconds));
  const trackedSeconds = Math.max(
    0,
    Math.round(metrics.trackedSeconds - baseline.trackedSeconds),
  );
  const blinkCount = Math.max(0, metrics.blinkCount - baseline.blinkCount);
  const cumulativeTooCloseSeconds = Math.max(
    0,
    metrics.tooCloseRatio * Math.max(0, metrics.trackedSeconds),
  );
  const tooCloseSeconds = Math.max(
    0,
    cumulativeTooCloseSeconds - baseline.tooCloseSeconds,
  );
  const tooCloseRatio =
    trackedSeconds > 0 ? clamp(tooCloseSeconds / trackedSeconds, 0, 1) : 0;
  const blinkRatePerMinute = calculateBlinkRate(blinkCount, trackedSeconds);
  const fatigueScore = calculateFatigueScore({
    blinkRatePerMinute,
    tooCloseRatio,
    sessionMinutes: activeSeconds / 60,
    trackedSeconds,
  });
  const band = fatigueBand(fatigueScore, trackedSeconds);
  const reportMetrics: VisionMetrics = {
    ...EMPTY_VISION_METRICS,
    distanceCm: metrics.distanceCm,
    blinkRatePerMinute,
    sessionSeconds: activeSeconds,
    trackedSeconds,
    tooCloseRatio,
    fatigueScore,
    fatigueBand: band,
  };
  const recommendations =
    trackedSeconds < 30
      ? (['collecting-data'] satisfies RecommendationCode[])
      : buildRecommendations(reportMetrics, null, false);

  return {
    id: options.id,
    startedAt: options.startedAt,
    endedAt: options.endedAt,
    source: 'live-camera',
    reason: options.reason,
    targetWindowSeconds: CONTINUOUS_WINDOW_SECONDS,
    activeSeconds,
    trackedSeconds,
    trackingCoverage: calculateContinuousTrackingCoverage(
      metrics.trackedSeconds,
      baseline.trackedSeconds,
      activeSeconds,
    ),
    blinkRatePerMinute:
      blinkRatePerMinute === null ? null : round(blinkRatePerMinute, 1),
    distanceCm:
      metrics.distanceCm === null || !Number.isFinite(metrics.distanceCm)
        ? null
        : round(metrics.distanceCm, 1),
    tooCloseRatio: round(tooCloseRatio, 3),
    fatigueScore,
    fatigueBand: band,
    recommendations,
  };
}

/** Exact allowlist for optional local persistence; never copies unknown fields. */
export function sanitizeContinuousMonitoringReport(
  value: unknown,
): ContinuousMonitoringReport | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<ContinuousMonitoringReport>;
  if (
    typeof candidate.id !== 'string' ||
    typeof candidate.startedAt !== 'string' ||
    typeof candidate.endedAt !== 'string' ||
    !validDate(candidate.startedAt) ||
    !validDate(candidate.endedAt) ||
    candidate.source !== 'live-camera' ||
    !REPORT_REASONS.includes(candidate.reason as ContinuousReportReason) ||
    candidate.targetWindowSeconds !== CONTINUOUS_WINDOW_SECONDS ||
    !finiteNumber(candidate.activeSeconds) ||
    !finiteNumber(candidate.trackedSeconds) ||
    !finiteNumber(candidate.trackingCoverage) ||
    !finiteNumberOrNull(candidate.blinkRatePerMinute) ||
    !finiteNumberOrNull(candidate.distanceCm) ||
    !finiteNumber(candidate.tooCloseRatio) ||
    !finiteNumber(candidate.fatigueScore) ||
    !FATIGUE_BANDS.includes(candidate.fatigueBand as FatigueBand) ||
    !Array.isArray(candidate.recommendations) ||
    !candidate.recommendations.every((code) =>
      RECOMMENDATION_CODES.includes(code as RecommendationCode),
    )
  ) {
    return null;
  }

  return {
    id: candidate.id,
    startedAt: candidate.startedAt,
    endedAt: candidate.endedAt,
    source: 'live-camera',
    reason: candidate.reason as ContinuousReportReason,
    targetWindowSeconds: CONTINUOUS_WINDOW_SECONDS,
    activeSeconds: Math.max(0, Math.round(candidate.activeSeconds)),
    trackedSeconds: Math.max(0, Math.round(candidate.trackedSeconds)),
    trackingCoverage: round(clamp(candidate.trackingCoverage, 0, 1), 3),
    blinkRatePerMinute: candidate.blinkRatePerMinute,
    distanceCm: candidate.distanceCm,
    tooCloseRatio: round(clamp(candidate.tooCloseRatio, 0, 1), 3),
    fatigueScore: Math.round(clamp(candidate.fatigueScore, 0, 100)),
    fatigueBand: candidate.fatigueBand as FatigueBand,
    recommendations: [...candidate.recommendations] as RecommendationCode[],
  };
}
