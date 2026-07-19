export type Direction = 'up' | 'right' | 'down' | 'left';
export type EyeMode = 'binocular' | 'left' | 'right';
export type EngineStatus =
  | 'idle'
  | 'loading-model'
  | 'requesting-camera'
  | 'running'
  | 'demo'
  | 'paused'
  | 'error';
export type FatigueBand = 'collecting' | 'low' | 'moderate' | 'high';
export type VisionEngineErrorCode =
  | 'camera-blocked'
  | 'camera-not-found'
  | 'camera-in-use'
  | 'camera-unavailable'
  | 'model-load-failed'
  | 'video-not-ready'
  | 'engine-failed';
export type CalibrationMessageCode =
  | 'complete'
  | 'not-enough-samples'
  | 'demo'
  | 'start-camera'
  | 'face-not-ready'
  | 'lighting-not-ready'
  | 'camera-frame-changed'
  | 'hold-still'
  | 'cleared';
export type RecommendationCode =
  | 'too-close-now'
  | 'too-close-session'
  | 'low-blink'
  | 'long-session'
  | 'poor-acuity'
  | 'demo-mode'
  | 'collecting-data'
  | 'no-risk-signals';

export interface NormalizedPoint {
  x: number;
  y: number;
  z?: number;
}

export interface DistanceCalibration {
  referenceEyePx: number;
  /** Eye span divided by intrinsic video width, independent of resolution. */
  referenceEyeWidthRatio: number;
  /** Intrinsic video width/height ratio used to detect rotation or recropping. */
  referenceFrameAspectRatio: number;
  referenceDistanceCm: number;
  calibratedAt: string;
}

export type ScreenCalibrationReference =
  | 'standard-card'
  | 'passport-td3'
  | 'screen-diagonal';

export interface ScreenCalibration {
  /**
   * CSS-pixel span used for calibration. The property name is retained so
   * screen calibrations saved by earlier releases remain readable.
   */
  cardWidthPx: number;
  pxPerMm: number;
  confirmed: boolean;
  calibratedAt: string | null;
  /** Missing on legacy records, which are interpreted as a standard ID-1 card. */
  referenceType?: ScreenCalibrationReference;
  /** Physical span corresponding to `cardWidthPx`. */
  referenceWidthMm?: number;
  /** Set only for the lower-confidence screen-diagonal calculation. */
  estimated?: boolean;
  screenDiagonalInches?: number;
}

export interface FaceMeasurement {
  eyePixelDistance: number;
  eyeWidthRatio: number;
  frameAspectRatio: number;
  eyeAspectRatio: number;
  poseOk: boolean;
  centered: boolean;
  level: boolean;
}

export interface VisionMetrics {
  faceDetected: boolean;
  lightingLevel: number | null;
  lightingOk: boolean;
  distanceCm: number | null;
  eyePixelDistance: number | null;
  eyeAspectRatio: number | null;
  eyeBaseline: number | null;
  isBlinking: boolean;
  blinkCount: number;
  blinkRatePerMinute: number | null;
  sessionSeconds: number;
  trackedSeconds: number;
  tooCloseRatio: number;
  fatigueScore: number;
  fatigueBand: FatigueBand;
  poseOk: boolean;
  modelFps: number;
}

/** Minimal derived fields needed to reproduce a completed result explanation. */
export interface VisionMetricsSnapshot {
  distanceCm: number | null;
  blinkRatePerMinute: number | null;
  sessionSeconds: number;
  trackedSeconds: number;
  tooCloseRatio: number;
  fatigueScore: number;
  fatigueBand: FatigueBand;
}

export interface VisionEngineError {
  code: VisionEngineErrorCode;
  status?: number;
}

export interface AcuityLevel {
  denominator: number;
  label: string;
}

export interface AcuityAnswer {
  denominator: number;
  expected: Direction;
  actual: Direction;
  correct: boolean;
  distanceCm: number | null;
  answeredAt: string;
}

export interface VisionTestResult {
  id: string;
  completedAt: string;
  eyeMode: EyeMode;
  snellen: string;
  denominator: number | null;
  decimalAcuity: number | null;
  logMar: number | null;
  answers: AcuityAnswer[];
  accuracy: number;
  averageDistanceCm: number | null;
  screenCalibrated: boolean;
  cameraCalibrated: boolean;
  demo: boolean;
  /**
   * Immutable derived measurements captured when this result completed. New
   * results always include this; it stays optional for legacy local records.
   */
  metricsSnapshot?: VisionMetricsSnapshot;
  /** False only for a legacy record reconstructed without completion metrics. */
  metricsSnapshotComplete?: boolean;
}

export interface FatigueInputs {
  blinkRatePerMinute: number | null;
  tooCloseRatio: number;
  sessionMinutes: number;
  trackedSeconds: number;
}
