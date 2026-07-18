import { describe, expect, it } from 'vitest';
import type { VisionMetrics, VisionTestResult } from '../types';
import { assessScreeningRisk, type RiskAssessmentInput, type SymptomCode } from './risk';

function metrics(overrides: Partial<VisionMetrics> = {}): VisionMetrics {
  return {
    faceDetected: true,
    lightingLevel: 0.62,
    lightingOk: true,
    distanceCm: 60,
    eyePixelDistance: 120,
    eyeAspectRatio: 0.3,
    eyeBaseline: 0.3,
    isBlinking: false,
    blinkCount: 12,
    blinkRatePerMinute: 12,
    sessionSeconds: 120,
    trackedSeconds: 120,
    tooCloseRatio: 0,
    fatigueScore: 10,
    fatigueBand: 'low',
    poseOk: true,
    modelFps: 15,
    ...overrides,
  };
}

function result(overrides: Partial<VisionTestResult> = {}): VisionTestResult {
  return {
    id: 'result-1',
    completedAt: '2026-07-17T00:00:00.000Z',
    eyeMode: 'binocular',
    snellen: '20/20',
    denominator: 20,
    decimalAcuity: 1,
    logMar: 0,
    answers: [],
    accuracy: 1,
    averageDistanceCm: 60,
    screenCalibrated: true,
    cameraCalibrated: true,
    demo: false,
    ...overrides,
  };
}

function assess(overrides: Partial<RiskAssessmentInput> = {}) {
  return assessScreeningRisk({
    metrics: metrics(),
    latestResult: result(),
    symptoms: [],
    ...overrides,
  });
}

describe('combined screening risk assessment', () => {
  it('reports a normal, high-confidence result when no signal or limitation is present', () => {
    expect(assess()).toEqual({
      riskBand: 'normal',
      mainIndicators: [],
      confidence: 'high',
      limitations: [],
      nextStep: 'continueHealthyScreenHabits',
      triggeredSignalCount: 0,
    });
  });

  it.each([
    ['eyePain', 'symptomEyePain'],
    ['doubleVision', 'symptomDoubleVision'],
    ['flashesFloaters', 'symptomFlashesFloaters'],
  ] as const)('treats %s as an urgent red flag', (symptom, indicator) => {
    const assessment = assess({ symptoms: [symptom] });

    expect(assessment.riskBand).toBe('concern');
    expect(assessment.mainIndicators).toEqual([indicator]);
    expect(assessment.nextStep).toBe('seekUrgentProfessionalCare');
    expect(assessment.triggeredSignalCount).toBe(1);
  });

  it('deduplicates symptoms and ignores none when a real symptom is selected', () => {
    const assessment = assess({
      symptoms: ['none', 'blurredVision', 'blurredVision'],
    });

    expect(assessment.riskBand).toBe('caution');
    expect(assessment.mainIndicators).toEqual(['symptomBlurredVision']);
    expect(assessment.triggeredSignalCount).toBe(1);
  });

  it.each([
    [50, '20/50'],
    [null, '>20/200'],
  ] as const)('treats an acuity denominator of %s as a concern', (denominator, snellen) => {
    const assessment = assess({
      latestResult: result({ denominator, snellen }),
    });

    expect(assessment.riskBand).toBe('concern');
    expect(assessment.mainIndicators).toContain('acuityWorseThan20_40');
    expect(assessment.nextStep).toBe('arrangeProfessionalEyeExam');
  });

  it('does not classify exactly 20/40 as worse than 20/40', () => {
    const assessment = assess({
      latestResult: result({ denominator: 40, snellen: '20/40' }),
    });

    expect(assessment.riskBand).toBe('normal');
    expect(assessment.mainIndicators).not.toContain('acuityWorseThan20_40');
  });

  it('treats high fatigue as a concern on its own', () => {
    const assessment = assess({
      metrics: metrics({ fatigueBand: 'high', fatigueScore: 75 }),
    });

    expect(assessment.riskBand).toBe('concern');
    expect(assessment.mainIndicators).toEqual(['fatigueHigh']);
    expect(assessment.nextStep).toBe('pauseAndSeekAdviceIfPersistent');
  });

  it('reports caution for one moderate non-red signal', () => {
    const assessment = assess({ symptoms: ['eyeStrainDryness'] });

    expect(assessment.riskBand).toBe('caution');
    expect(assessment.mainIndicators).toEqual(['symptomEyeStrainDryness']);
    expect(assessment.nextStep).toBe('takeBreakAndReassess');
  });

  it('reports concern for two non-red symptoms', () => {
    const assessment = assess({ symptoms: ['blurredVision', 'headache'] });

    expect(assessment.riskBand).toBe('concern');
    expect(assessment.mainIndicators).toEqual([
      'symptomBlurredVision',
      'symptomHeadache',
    ]);
    expect(assessment.triggeredSignalCount).toBe(2);
  });

  it('combines moderate fatigue with one non-red symptom as two signals', () => {
    const assessment = assess({
      metrics: metrics({ fatigueBand: 'moderate', fatigueScore: 45 }),
      symptoms: ['headache'],
    });

    expect(assessment.riskBand).toBe('concern');
    expect(assessment.mainIndicators).toEqual(['symptomHeadache', 'fatigueModerate']);
    expect(assessment.triggeredSignalCount).toBe(2);
  });

  it('reports low blink rate only after enough tracked time', () => {
    const assessment = assess({
      metrics: metrics({ trackedSeconds: 30, blinkRatePerMinute: 9.9 }),
    });

    expect(assessment.riskBand).toBe('caution');
    expect(assessment.mainIndicators).toEqual(['blinkRateLow']);
    expect(assessment.nextStep).toBe('takeBreakAndReassess');
  });

  it.each([
    [29, 5],
    [30, 10],
    [120, null],
  ] as const)(
    'does not report low blink rate with %s tracked seconds and a rate of %s',
    (trackedSeconds, blinkRatePerMinute) => {
      const assessment = assess({
        metrics: metrics({ trackedSeconds, blinkRatePerMinute }),
      });

      expect(assessment.mainIndicators).not.toContain('blinkRateLow');
    },
  );

  it.each([39.9, 80.1])(
    'reports an unsafe current viewing distance at %s cm',
    (distanceCm) => {
      const assessment = assess({ metrics: metrics({ distanceCm }) });

      expect(assessment.riskBand).toBe('caution');
      expect(assessment.mainIndicators).toEqual(['viewingDistanceUnsafe']);
    },
  );

  it('uses session history to report too-close viewing even when current distance is safe', () => {
    const assessment = assess({
      metrics: metrics({ distanceCm: 60, tooCloseRatio: 0.251 }),
    });

    expect(assessment.riskBand).toBe('caution');
    expect(assessment.mainIndicators).toEqual(['viewingDistanceUnsafe']);
  });

  it.each([
    [40, 0.25],
    [80, 0],
  ])(
    'accepts current distance %s cm with a too-close ratio of %s',
    (distanceCm, tooCloseRatio) => {
      const assessment = assess({ metrics: metrics({ distanceCm, tooCloseRatio }) });

      expect(assessment.mainIndicators).not.toContain('viewingDistanceUnsafe');
    },
  );

  it('escalates combined low-blink and unsafe-distance signals to concern', () => {
    const assessment = assess({
      metrics: metrics({
        blinkRatePerMinute: 7,
        distanceCm: 35,
      }),
    });

    expect(assessment.riskBand).toBe('concern');
    expect(assessment.mainIndicators).toEqual(['blinkRateLow', 'viewingDistanceUnsafe']);
    expect(assessment.triggeredSignalCount).toBe(2);
  });

  it('exposes indicators for the acuity, blink, and distance screening cards', () => {
    const assessment = assess({
      metrics: metrics({ blinkRatePerMinute: 8, distanceCm: 85 }),
      latestResult: result({ denominator: 50, snellen: '20/50' }),
    });

    expect(assessment.mainIndicators).toEqual([
      'acuityWorseThan20_40',
      'blinkRateLow',
      'viewingDistanceUnsafe',
    ]);
    expect(assessment.triggeredSignalCount).toBe(3);
    expect(assessment.nextStep).toBe('arrangeProfessionalEyeExam');
  });

  it('uses the urgent next step when red-flag and acuity concerns coexist', () => {
    const assessment = assess({
      symptoms: ['eyePain'],
      latestResult: result({ denominator: 80, snellen: '20/80' }),
    });

    expect(assessment.nextStep).toBe('seekUrgentProfessionalCare');
    expect(assessment.triggeredSignalCount).toBe(2);
  });

  it('reports medium confidence and precise limitation codes for limited quality', () => {
    const assessment = assess({
      latestResult: result({
        screenCalibrated: false,
        averageDistanceCm: 39.9,
      }),
    });

    expect(assessment.confidence).toBe('medium');
    expect(assessment.limitations).toEqual([
      'screenCalibrationMissing',
      'averageDistanceOutsideSupportedRange',
    ]);
  });

  it('reports low confidence when three or more quality limitations apply', () => {
    const assessment = assess({
      metrics: metrics({ trackedSeconds: 29 }),
      latestResult: result({
        cameraCalibrated: false,
        demo: true,
        averageDistanceCm: null,
      }),
    });

    expect(assessment.confidence).toBe('low');
    expect(assessment.limitations).toEqual([
      'cameraCalibrationMissing',
      'demoMode',
      'averageDistanceMissing',
      'trackedDataInsufficient',
    ]);
  });

  it('never derives personal risk guidance from simulated demo measurements', () => {
    const assessment = assessScreeningRisk({
      symptoms: [],
      latestResult: result({ denominator: 200, snellen: '20/200', demo: true }),
      metrics: metrics({
        trackedSeconds: 120,
        fatigueBand: 'high',
        blinkRatePerMinute: 2,
        distanceCm: 20,
        tooCloseRatio: 1,
      }),
    });

    expect(assessment.riskBand).toBe('normal');
    expect(assessment.mainIndicators).toEqual([]);
    expect(assessment.nextStep).toBe('demoOnly');
    expect(assessment.limitations).toContain('demoMode');
  });

  it('keeps real symptom guidance active when measurements are demo data', () => {
    const nonRed = assess({
      latestResult: result({ demo: true }),
      symptoms: ['headache'],
    });
    const redFlag = assess({
      latestResult: result({ demo: true }),
      symptoms: ['eyePain'],
    });

    expect(nonRed.nextStep).toBe('takeBreakAndReassess');
    expect(nonRed.mainIndicators).toEqual(['symptomHeadache']);
    expect(redFlag.nextStep).toBe('seekUrgentProfessionalCare');
    expect(redFlag.mainIndicators).toEqual(['symptomEyePain']);
  });

  it('reports low confidence when there is no completed vision test', () => {
    const assessment = assess({ latestResult: null });

    expect(assessment.confidence).toBe('low');
    expect(assessment.limitations).toEqual(['visionTestMissing']);
  });

  it('lowers confidence and declares when session-only symptoms were not retained', () => {
    const assessment = assess({ symptomContextRetained: false });

    expect(assessment.riskBand).toBe('normal');
    expect(assessment.confidence).toBe('medium');
    expect(assessment.limitations).toEqual(['symptomContextNotRetained']);
  });

  it('marks a reconstructed legacy result low-confidence without discarding it', () => {
    const assessment = assess({
      metrics: metrics({
        distanceCm: 60,
        blinkRatePerMinute: null,
        trackedSeconds: 0,
        sessionSeconds: 0,
        fatigueBand: 'collecting',
      }),
      symptomContextRetained: false,
      metricsSnapshotRetained: false,
    });

    expect(assessment.confidence).toBe('low');
    expect(assessment.limitations).toEqual([
      'trackedDataInsufficient',
      'symptomContextNotRetained',
      'metricsSnapshotNotRetained',
    ]);
  });

  it.each([40, 80])('accepts %s cm as a supported distance boundary', (distance) => {
    const assessment = assess({
      latestResult: result({ averageDistanceCm: distance }),
    });

    expect(assessment.confidence).toBe('high');
    expect(assessment.limitations).toEqual([]);
  });

  it('keeps the none-only selection signal-free', () => {
    const symptoms: SymptomCode[] = ['none'];
    expect(assess({ symptoms }).triggeredSignalCount).toBe(0);
  });
});
