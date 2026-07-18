import { describe, expect, it } from 'vitest';
import type { VisionTestResult } from '../types';
import { buildTrendModel } from './TrendsAndReminder';

function result(
  id: string,
  completedAt: string,
  denominator: number | null,
  options: Partial<Pick<VisionTestResult, 'demo' | 'eyeMode'>> = {},
): VisionTestResult {
  return {
    id,
    completedAt,
    eyeMode: options.eyeMode ?? 'binocular',
    snellen: denominator === null ? '<20/200' : `20/${denominator}`,
    denominator,
    decimalAcuity: denominator === null ? null : 20 / denominator,
    logMar: denominator === null ? null : Math.log10(denominator / 20),
    answers: [],
    accuracy: 1,
    averageDistanceCm: 60,
    screenCalibrated: true,
    cameraCalibrated: true,
    demo: options.demo ?? false,
  };
}

describe('buildTrendModel', () => {
  it('uses every real result rather than truncating the trend and reports demos excluded', () => {
    const realResults = Array.from({ length: 12 }, (_, index) =>
      result(`real-${index}`, `2026-07-${String(index + 1).padStart(2, '0')}T10:00:00.000Z`, 80 - index),
    );
    const model = buildTrendModel([
      result('demo-1', '2026-07-15T10:00:00.000Z', 20, { demo: true }),
      ...realResults.reverse(),
      result('demo-2', '2026-07-16T10:00:00.000Z', 20, { demo: true }),
    ]);

    expect(model.points).toHaveLength(12);
    expect(model.points[0].id).toBe('real-0');
    expect(model.points.at(-1)?.id).toBe('real-11');
    expect(model.excludedDemoCount).toBe(2);
  });

  it('compares the latest result with the prior result for the same eye', () => {
    const model = buildTrendModel([
      result('right-old', '2026-07-01T10:00:00.000Z', 80, { eyeMode: 'right' }),
      result('left-between', '2026-07-02T10:00:00.000Z', 20, { eyeMode: 'left' }),
      result('right-new', '2026-07-03T10:00:00.000Z', 40, { eyeMode: 'right' }),
    ]);

    expect(model.comparison?.latest.id).toBe('right-new');
    expect(model.comparison?.previous?.id).toBe('right-old');
    expect(model.comparison?.change).toBe('improved');
  });

  it('treats a below-chart result as worse and does not compare against demo data', () => {
    const model = buildTrendModel([
      result('real-old', '2026-07-01T10:00:00.000Z', 200),
      result('demo', '2026-07-02T10:00:00.000Z', 20, { demo: true }),
      result('real-new', '2026-07-03T10:00:00.000Z', null),
    ]);

    expect(model.comparison?.previous?.id).toBe('real-old');
    expect(model.comparison?.change).toBe('worsened');
    expect(model.excludedDemoCount).toBe(1);
  });
});
