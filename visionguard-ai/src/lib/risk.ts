import type { VisionMetrics, VisionTestResult } from '../types';

export const SYMPTOM_CODES = [
  'blurredVision',
  'eyeStrainDryness',
  'headache',
  'eyePain',
  'doubleVision',
  'flashesFloaters',
  'none',
] as const;

export type SymptomCode = (typeof SYMPTOM_CODES)[number];
export type RiskBand = 'normal' | 'caution' | 'concern';
export type RiskConfidence = 'high' | 'medium' | 'low';

export type RiskIndicatorCode =
  | 'symptomBlurredVision'
  | 'symptomEyeStrainDryness'
  | 'symptomHeadache'
  | 'symptomEyePain'
  | 'symptomDoubleVision'
  | 'symptomFlashesFloaters'
  | 'acuityWorseThan20_40'
  | 'blinkRateLow'
  | 'viewingDistanceUnsafe'
  | 'fatigueModerate'
  | 'fatigueHigh';

export type RiskLimitationCode =
  | 'visionTestMissing'
  | 'screenCalibrationMissing'
  | 'cameraCalibrationMissing'
  | 'demoMode'
  | 'averageDistanceMissing'
  | 'averageDistanceOutsideSupportedRange'
  | 'trackedDataInsufficient'
  | 'symptomContextNotRetained'
  | 'metricsSnapshotNotRetained';

export type RiskNextStepCode =
  | 'demoOnly'
  | 'continueHealthyScreenHabits'
  | 'takeBreakAndReassess'
  | 'pauseAndSeekAdviceIfPersistent'
  | 'arrangeProfessionalEyeExam'
  | 'seekUrgentProfessionalCare';

export interface RiskAssessmentInput {
  metrics: VisionMetrics;
  latestResult: VisionTestResult | null;
  symptoms?: readonly SymptomCode[];
  /** False after reload because symptom choices are intentionally session-only. */
  symptomContextRetained?: boolean;
  /** False only when loading a legacy result without completion metrics. */
  metricsSnapshotRetained?: boolean;
}

export interface RiskAssessment {
  riskBand: RiskBand;
  mainIndicators: RiskIndicatorCode[];
  confidence: RiskConfidence;
  limitations: RiskLimitationCode[];
  nextStep: RiskNextStepCode;
  triggeredSignalCount: number;
}

export const RISK_THRESHOLDS = {
  acuityConcernDenominator: 40,
  minimumTrackedSeconds: 30,
  lowBlinkRatePerMinute: 10,
  minimumSupportedDistanceCm: 40,
  maximumSupportedDistanceCm: 80,
  maximumTooCloseRatio: 0.25,
} as const;

const RED_FLAG_SYMPTOMS: ReadonlySet<SymptomCode> = new Set([
  'eyePain',
  'doubleVision',
  'flashesFloaters',
]);

const NON_RED_SYMPTOMS: ReadonlySet<SymptomCode> = new Set([
  'blurredVision',
  'eyeStrainDryness',
  'headache',
]);

const INDICATOR_BY_SYMPTOM: Partial<Record<SymptomCode, RiskIndicatorCode>> = {
  blurredVision: 'symptomBlurredVision',
  eyeStrainDryness: 'symptomEyeStrainDryness',
  headache: 'symptomHeadache',
  eyePain: 'symptomEyePain',
  doubleVision: 'symptomDoubleVision',
  flashesFloaters: 'symptomFlashesFloaters',
};

function activeSymptoms(symptoms: readonly SymptomCode[]): SymptomCode[] {
  const selected = new Set(symptoms);
  selected.delete('none');
  return SYMPTOM_CODES.filter((symptom) => symptom !== 'none' && selected.has(symptom));
}

function assessConfidence(
  metrics: VisionMetrics,
  latestResult: VisionTestResult | null,
  symptomContextRetained: boolean,
  metricsSnapshotRetained: boolean,
): Pick<RiskAssessment, 'confidence' | 'limitations'> {
  const limitations: RiskLimitationCode[] = [];

  if (latestResult === null) {
    limitations.push('visionTestMissing');
  } else {
    if (!latestResult.screenCalibrated) limitations.push('screenCalibrationMissing');
    if (!latestResult.cameraCalibrated) limitations.push('cameraCalibrationMissing');
    if (latestResult.demo) limitations.push('demoMode');

    const distance = latestResult.averageDistanceCm;
    if (distance === null) {
      limitations.push('averageDistanceMissing');
    } else if (
      !Number.isFinite(distance) ||
      distance < RISK_THRESHOLDS.minimumSupportedDistanceCm ||
      distance > RISK_THRESHOLDS.maximumSupportedDistanceCm
    ) {
      limitations.push('averageDistanceOutsideSupportedRange');
    }
  }

  if (metrics.trackedSeconds < RISK_THRESHOLDS.minimumTrackedSeconds) {
    limitations.push('trackedDataInsufficient');
  }
  if (!symptomContextRetained) {
    limitations.push('symptomContextNotRetained');
  }
  if (!metricsSnapshotRetained) {
    limitations.push('metricsSnapshotNotRetained');
  }

  let confidence: RiskConfidence;
  if (latestResult === null || limitations.length >= 3) {
    confidence = 'low';
  } else if (limitations.length > 0) {
    confidence = 'medium';
  } else {
    confidence = 'high';
  }

  return { confidence, limitations };
}

/**
 * Combines symptom, acuity, and fatigue screening signals without producing a diagnosis.
 * The returned semantic codes are intended to be translated by the presentation layer.
 */
export function assessScreeningRisk({
  metrics,
  latestResult,
  symptoms = [],
  symptomContextRetained = true,
  metricsSnapshotRetained = true,
}: RiskAssessmentInput): RiskAssessment {
  const selectedSymptoms = activeSymptoms(symptoms);
  const mainIndicators: RiskIndicatorCode[] = [];

  for (const symptom of selectedSymptoms) {
    const indicator = INDICATOR_BY_SYMPTOM[symptom];
    if (indicator) mainIndicators.push(indicator);
  }

  const hasRedFlag = selectedSymptoms.some((symptom) => RED_FLAG_SYMPTOMS.has(symptom));
  const nonRedSymptomCount = selectedSymptoms.filter((symptom) =>
    NON_RED_SYMPTOMS.has(symptom),
  ).length;
  // Demo measurements are simulated and must never drive personal health guidance.
  // Symptom selections remain eligible because they are supplied by the user.
  const hasLiveMeasurements = latestResult?.demo !== true;
  const hasAcuityConcern =
    hasLiveMeasurements &&
    latestResult !== null &&
    (latestResult.denominator === null ||
      latestResult.denominator > RISK_THRESHOLDS.acuityConcernDenominator);
  const hasHighFatigue = hasLiveMeasurements && metrics.fatigueBand === 'high';
  const hasModerateFatigue = hasLiveMeasurements && metrics.fatigueBand === 'moderate';
  const hasLowBlinkRate =
    hasLiveMeasurements &&
    metrics.trackedSeconds >= RISK_THRESHOLDS.minimumTrackedSeconds &&
    metrics.blinkRatePerMinute !== null &&
    Number.isFinite(metrics.blinkRatePerMinute) &&
    metrics.blinkRatePerMinute < RISK_THRESHOLDS.lowBlinkRatePerMinute;
  const hasUnsafeViewingDistance =
    hasLiveMeasurements &&
    ((metrics.distanceCm !== null &&
      Number.isFinite(metrics.distanceCm) &&
      (metrics.distanceCm < RISK_THRESHOLDS.minimumSupportedDistanceCm ||
        metrics.distanceCm > RISK_THRESHOLDS.maximumSupportedDistanceCm)) ||
      metrics.tooCloseRatio > RISK_THRESHOLDS.maximumTooCloseRatio);

  if (hasAcuityConcern) mainIndicators.push('acuityWorseThan20_40');
  if (hasLowBlinkRate) mainIndicators.push('blinkRateLow');
  if (hasUnsafeViewingDistance) mainIndicators.push('viewingDistanceUnsafe');
  if (hasHighFatigue) mainIndicators.push('fatigueHigh');
  else if (hasModerateFatigue) mainIndicators.push('fatigueModerate');

  const nonRedSignalCount =
    nonRedSymptomCount +
    (hasModerateFatigue ? 1 : 0) +
    (hasLowBlinkRate ? 1 : 0) +
    (hasUnsafeViewingDistance ? 1 : 0);

  let riskBand: RiskBand;
  if (hasRedFlag || hasAcuityConcern || hasHighFatigue || nonRedSignalCount >= 2) {
    riskBand = 'concern';
  } else if (nonRedSignalCount === 1) {
    riskBand = 'caution';
  } else {
    riskBand = 'normal';
  }

  let nextStep: RiskNextStepCode;
  if (hasRedFlag) {
    nextStep = 'seekUrgentProfessionalCare';
  } else if (hasAcuityConcern) {
    nextStep = 'arrangeProfessionalEyeExam';
  } else if (latestResult?.demo === true && selectedSymptoms.length === 0) {
    nextStep = 'demoOnly';
  } else if (riskBand === 'concern') {
    nextStep = 'pauseAndSeekAdviceIfPersistent';
  } else if (riskBand === 'caution') {
    nextStep = 'takeBreakAndReassess';
  } else {
    nextStep = 'continueHealthyScreenHabits';
  }

  const { confidence, limitations } = assessConfidence(
    metrics,
    latestResult,
    symptomContextRetained,
    metricsSnapshotRetained,
  );

  return {
    riskBand,
    mainIndicators,
    confidence,
    limitations,
    nextStep,
    triggeredSignalCount: mainIndicators.length,
  };
}
