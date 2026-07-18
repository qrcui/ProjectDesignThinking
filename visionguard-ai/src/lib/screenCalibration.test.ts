import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SCREEN_CALIBRATION,
  PASSPORT_TD3_WIDTH_MM,
  STANDARD_CARD_WIDTH_MM,
} from '../constants';
import {
  createPhysicalScreenCalibration,
  estimateScreenCalibrationFromDiagonal,
  normalizeScreenCalibration,
  PHYSICAL_CALIBRATION_REFERENCES,
} from './screenCalibration';

describe('screen calibration', () => {
  it('uses the selected physical reference width', () => {
    const card = createPhysicalScreenCalibration('standard-card', 342.4, 'now');
    const passport = createPhysicalScreenCalibration('passport-td3', 500, 'now');

    expect(card.pxPerMm).toBeCloseTo(342.4 / STANDARD_CARD_WIDTH_MM, 8);
    expect(passport.pxPerMm).toBeCloseTo(500 / PASSPORT_TD3_WIDTH_MM, 8);
    expect(passport.referenceType).toBe('passport-td3');
    expect(passport.estimated).toBe(false);
    expect(PHYSICAL_CALIBRATION_REFERENCES['passport-td3']).toEqual({
      widthMm: 125,
      heightMm: 88,
    });
  });

  it('estimates CSS pixels per millimeter from a supplied screen diagonal', () => {
    const calibration = estimateScreenCalibrationFromDiagonal(
      15.6,
      1920,
      1080,
      'now',
    );

    expect(calibration).not.toBeNull();
    expect(calibration?.pxPerMm).toBeCloseTo(Math.hypot(1920, 1080) / (15.6 * 25.4), 8);
    expect(calibration?.referenceType).toBe('screen-diagonal');
    expect(calibration?.estimated).toBe(true);
  });

  it('rejects invalid diagonal estimates', () => {
    expect(estimateScreenCalibrationFromDiagonal(0, 1920, 1080, 'now')).toBeNull();
    expect(estimateScreenCalibrationFromDiagonal(15.6, 0, 1080, 'now')).toBeNull();
  });

  it('upgrades a legacy card calibration without changing its result', () => {
    const legacy = {
      cardWidthPx: 350,
      pxPerMm: 4.088785,
      confirmed: true,
      calibratedAt: '2025-01-01T00:00:00.000Z',
    };

    const normalized = normalizeScreenCalibration(legacy, DEFAULT_SCREEN_CALIBRATION);

    expect(normalized.pxPerMm).toBe(legacy.pxPerMm);
    expect(normalized.cardWidthPx).toBe(legacy.cardWidthPx);
    expect(normalized.referenceType).toBe('standard-card');
    expect(normalized.referenceWidthMm).toBe(STANDARD_CARD_WIDTH_MM);
    expect(normalized.estimated).toBe(false);
  });

  it('falls back when persisted calibration is malformed', () => {
    expect(
      normalizeScreenCalibration(
        { cardWidthPx: -1, pxPerMm: Number.NaN, confirmed: 'yes' },
        DEFAULT_SCREEN_CALIBRATION,
      ),
    ).toBe(DEFAULT_SCREEN_CALIBRATION);
  });
});
