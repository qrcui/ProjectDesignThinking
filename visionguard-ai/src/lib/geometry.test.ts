import { describe, expect, it } from 'vitest';
import { clamp, median, percentile, roundTo } from './geometry';

describe('geometry helpers', () => {
  it('calculates median for odd and even sample sets', () => {
    expect(median([9, 1, 5])).toBe(5);
    expect(median([10, 2, 6, 4])).toBe(5);
    expect(median([])).toBeNull();
  });

  it('interpolates percentiles and clamps values', () => {
    expect(percentile([0, 10, 20], 0.75)).toBe(15);
    expect(clamp(12, 0, 10)).toBe(10);
    expect(roundTo(3.14159, 2)).toBe(3.14);
  });
});
