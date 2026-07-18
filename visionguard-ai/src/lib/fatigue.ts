import type {
  FatigueBand,
  FatigueInputs,
  RecommendationCode,
  VisionMetrics,
  VisionTestResult,
} from '../types';
import { clamp } from './geometry';

export function calculateBlinkRate(blinkCount: number, trackedSeconds: number): number | null {
  if (trackedSeconds < 20) return null;
  return (blinkCount / trackedSeconds) * 60;
}

export function calculateFatigueScore(inputs: FatigueInputs): number {
  const { blinkRatePerMinute, tooCloseRatio, sessionMinutes, trackedSeconds } = inputs;

  const blinkPenalty =
    trackedSeconds >= 30 && blinkRatePerMinute !== null
      ? clamp((14 - blinkRatePerMinute) / 10, 0, 1) * 45
      : 0;
  const distancePenalty = clamp((tooCloseRatio - 0.08) / 0.52, 0, 1) * 35;
  const durationPenalty = clamp((sessionMinutes - 20) / 40, 0, 1) * 20;

  return Math.round(clamp(blinkPenalty + distancePenalty + durationPenalty, 0, 100));
}

export function fatigueBand(score: number, trackedSeconds: number): FatigueBand {
  if (trackedSeconds < 30) return 'collecting';
  if (score < 30) return 'low';
  if (score < 60) return 'moderate';
  return 'high';
}

export function buildRecommendations(
  metrics: VisionMetrics,
  latestResult: VisionTestResult | null,
  demoMode = false,
): RecommendationCode[] {
  if (demoMode) return ['demo-mode'];

  const recommendations: RecommendationCode[] = [];

  if (metrics.distanceCm !== null && metrics.distanceCm < 45) {
    recommendations.push('too-close-now');
  } else if (metrics.tooCloseRatio > 0.25) {
    recommendations.push('too-close-session');
  }

  if (
    metrics.trackedSeconds >= 30 &&
    metrics.blinkRatePerMinute !== null &&
    metrics.blinkRatePerMinute < 10
  ) {
    recommendations.push('low-blink');
  }

  if (metrics.sessionSeconds >= 20 * 60) {
    recommendations.push('long-session');
  }

  if (
    latestResult &&
    !latestResult.demo &&
    (latestResult.denominator === null || latestResult.denominator > 40)
  ) {
    recommendations.push('poor-acuity');
  }

  if (recommendations.length === 0) {
    recommendations.push(
      metrics.trackedSeconds < 30 ? 'collecting-data' : 'no-risk-signals',
    );
  }

  return recommendations;
}
