import {
  PASSPORT_TD3_HEIGHT_MM,
  PASSPORT_TD3_WIDTH_MM,
  STANDARD_CARD_HEIGHT_MM,
  STANDARD_CARD_WIDTH_MM,
} from '../constants';
import type { ScreenCalibration, ScreenCalibrationReference } from '../types';

export type PhysicalCalibrationReference = Exclude<
  ScreenCalibrationReference,
  'screen-diagonal'
>;

export interface PhysicalReferenceDimensions {
  widthMm: number;
  heightMm: number;
}

export const PHYSICAL_CALIBRATION_REFERENCES: Record<
  PhysicalCalibrationReference,
  PhysicalReferenceDimensions
> = {
  'standard-card': {
    widthMm: STANDARD_CARD_WIDTH_MM,
    heightMm: STANDARD_CARD_HEIGHT_MM,
  },
  'passport-td3': {
    widthMm: PASSPORT_TD3_WIDTH_MM,
    heightMm: PASSPORT_TD3_HEIGHT_MM,
  },
};

function isFinitePositive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

export function isScreenCalibrationReference(
  value: unknown,
): value is ScreenCalibrationReference {
  return (
    value === 'standard-card' || value === 'passport-td3' || value === 'screen-diagonal'
  );
}

export function getCalibrationReferenceType(
  calibration: Pick<ScreenCalibration, 'referenceType'>,
): ScreenCalibrationReference {
  return isScreenCalibrationReference(calibration.referenceType)
    ? calibration.referenceType
    : 'standard-card';
}

export function createPhysicalScreenCalibration(
  referenceType: PhysicalCalibrationReference,
  displayedWidthPx: number,
  calibratedAt: string,
): ScreenCalibration {
  const dimensions = PHYSICAL_CALIBRATION_REFERENCES[referenceType];
  return {
    // Keep writing the legacy field so older application builds can still use
    // the resulting px/mm value even though the reference may be a passport.
    cardWidthPx: displayedWidthPx,
    pxPerMm: displayedWidthPx / dimensions.widthMm,
    confirmed: true,
    calibratedAt,
    referenceType,
    referenceWidthMm: dimensions.widthMm,
    estimated: false,
  };
}

export function estimateScreenCalibrationFromDiagonal(
  screenDiagonalInches: number,
  screenWidthCssPx: number,
  screenHeightCssPx: number,
  calibratedAt: string,
): ScreenCalibration | null {
  if (
    !isFinitePositive(screenDiagonalInches) ||
    !isFinitePositive(screenWidthCssPx) ||
    !isFinitePositive(screenHeightCssPx)
  ) {
    return null;
  }

  const cssPixelDiagonal = Math.hypot(screenWidthCssPx, screenHeightCssPx);
  const physicalDiagonalMm = screenDiagonalInches * 25.4;
  return {
    cardWidthPx: cssPixelDiagonal,
    pxPerMm: cssPixelDiagonal / physicalDiagonalMm,
    confirmed: true,
    calibratedAt,
    referenceType: 'screen-diagonal',
    referenceWidthMm: physicalDiagonalMm,
    estimated: true,
    screenDiagonalInches,
  };
}

/**
 * Validates persisted calibration and upgrades legacy card-based records in
 * memory. It intentionally preserves a legacy px/mm value rather than
 * recalculating it, so existing users do not lose their calibration.
 */
export function normalizeScreenCalibration(
  value: unknown,
  fallback: ScreenCalibration,
): ScreenCalibration {
  if (!value || typeof value !== 'object') return fallback;
  const candidate = value as Partial<ScreenCalibration>;
  if (
    !isFinitePositive(candidate.cardWidthPx) ||
    !isFinitePositive(candidate.pxPerMm) ||
    typeof candidate.confirmed !== 'boolean' ||
    !(
      candidate.calibratedAt === null ||
      typeof candidate.calibratedAt === 'string'
    )
  ) {
    return fallback;
  }

  const referenceType = getCalibrationReferenceType(candidate);
  const defaultReferenceWidthMm =
    referenceType === 'screen-diagonal'
      ? candidate.screenDiagonalInches && candidate.screenDiagonalInches > 0
        ? candidate.screenDiagonalInches * 25.4
        : candidate.cardWidthPx / candidate.pxPerMm
      : PHYSICAL_CALIBRATION_REFERENCES[referenceType].widthMm;

  return {
    cardWidthPx: candidate.cardWidthPx,
    pxPerMm: candidate.pxPerMm,
    confirmed: candidate.confirmed,
    calibratedAt: candidate.calibratedAt,
    referenceType,
    referenceWidthMm: isFinitePositive(candidate.referenceWidthMm)
      ? candidate.referenceWidthMm
      : defaultReferenceWidthMm,
    estimated: referenceType === 'screen-diagonal' || candidate.estimated === true,
    screenDiagonalInches: isFinitePositive(candidate.screenDiagonalInches)
      ? candidate.screenDiagonalInches
      : undefined,
  };
}
