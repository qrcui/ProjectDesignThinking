import type { AcuityLevel, Direction, ScreenCalibration } from './types';

export const TARGET_DISTANCE_CM = 60;
export const DISTANCE_TOLERANCE_CM = 20;
export const TOO_CLOSE_CM = 45;
export const ANALYSIS_INTERVAL_MS = 110;
export const LIGHTING_SAMPLE_INTERVAL_MS = 1000;
export const MIN_ACCEPTABLE_LIGHTING_LEVEL = 0.18;
export const MAX_ACCEPTABLE_LIGHTING_LEVEL = 0.92;
export const STANDARD_CARD_WIDTH_MM = 85.6;
export const STANDARD_CARD_HEIGHT_MM = 53.98;
export const PASSPORT_TD3_WIDTH_MM = 125;
export const PASSPORT_TD3_HEIGHT_MM = 88;
/** @deprecated Use STANDARD_CARD_WIDTH_MM for new code. */
export const CARD_WIDTH_MM = STANDARD_CARD_WIDTH_MM;
export const NOMINAL_CSS_PX_PER_MM = 96 / 25.4;

export const MODEL_REMOTE_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

export const ACUITY_LEVELS: AcuityLevel[] = [
  { denominator: 200, label: '20/200' },
  { denominator: 125, label: '20/125' },
  { denominator: 80, label: '20/80' },
  { denominator: 63, label: '20/63' },
  { denominator: 50, label: '20/50' },
  { denominator: 40, label: '20/40' },
  { denominator: 32, label: '20/32' },
  { denominator: 25, label: '20/25' },
  { denominator: 20, label: '20/20' },
];

export const DIRECTIONS: Direction[] = ['up', 'right', 'down', 'left'];

export const DEFAULT_SCREEN_CALIBRATION: ScreenCalibration = {
  cardWidthPx: Math.round(STANDARD_CARD_WIDTH_MM * NOMINAL_CSS_PX_PER_MM),
  pxPerMm: NOMINAL_CSS_PX_PER_MM,
  confirmed: false,
  calibratedAt: null,
  referenceType: 'standard-card',
  referenceWidthMm: STANDARD_CARD_WIDTH_MM,
  estimated: false,
};

export const STORAGE_KEYS = {
  distanceCalibration: 'visionguard.distanceCalibration.v1',
  screenCalibration: 'visionguard.screenCalibration.v1',
  results: 'visionguard.results.v1',
  language: 'visionguard.language.v1',
  consent: 'visionguard.consent.v1',
  retestReminder: 'visionguard.retestReminder.v1',
  continuousReports: 'visionguard.continuousReports.v1',
} as const;
