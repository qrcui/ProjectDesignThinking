import { useEffect, useMemo, useState } from 'react';
import { DEFAULT_SCREEN_CALIBRATION, STORAGE_KEYS } from './constants';
import { useVisionEngine } from './hooks/useVisionEngine';
import { readStorage, writeStorage } from './lib/storage';
import { useI18n } from './i18n/I18nProvider';
import { isLocale, LOCALE_OPTIONS, type MessageKey } from './i18n/messages';
import type { ScreenCalibration, VisionTestResult } from './types';
import { CalibrationPanel } from './components/CalibrationPanel';
import { CameraPanel } from './components/CameraPanel';
import { MetricsPanel } from './components/MetricsPanel';
import { ResultsHistory } from './components/ResultsHistory';
import { VisionTest } from './components/VisionTest';
import { ContinuousMonitoringPanel } from './components/ContinuousMonitoringPanel';
import {
  JourneyProgress,
  type JourneyStageId,
  type JourneyProgressCopy,
} from './components/JourneyProgress';
import { ConsentPanel, type ConsentPanelCopy } from './components/ConsentPanel';
import {
  SymptomsPanel,
  type SymptomChoice,
  type SymptomsPanelCopy,
} from './components/SymptomsPanel';
import { CampaignAccess, type CampaignAccessCopy } from './components/CampaignAccess';
import {
  SYMPTOM_CODES,
  assessScreeningRisk,
  type SymptomCode,
} from './lib/risk';
import {
  ScreeningExplanation,
  type ScreeningExplanationCopy,
} from './components/ScreeningExplanation';
import {
  TrendsAndReminder,
  type TrendsAndReminderCopy,
} from './components/TrendsAndReminder';
import { createRetestReminderDueAt, readReminderTimestamp } from './lib/reminder';
import { parseCampaignDeploymentConfig } from './lib/campaign';
import {
  EMPTY_VISION_METRICS,
  legacyVisionMetricsSnapshot,
  minimizeResultForPersistence,
  parseVisionMetricsSnapshot,
  snapshotVisionMetrics,
  visionMetricsFromSnapshot,
} from './lib/resultSnapshot';
import { normalizeScreenCalibration } from './lib/screenCalibration';
import './app.css';
import './enhancements.css';
import './language-typography.css';

interface ConsentPreferences {
  camera: boolean;
  storeDerivedResults: boolean;
  acceptedAt: string | null;
}

interface ResultSessionContext {
  symptoms: readonly SymptomCode[];
}

const EMPTY_CONSENT: ConsentPreferences = {
  camera: false,
  storeDerivedResults: false,
  acceptedAt: null,
};

function readConsentPreferences(): ConsentPreferences {
  const value = readStorage<unknown>(STORAGE_KEYS.consent, EMPTY_CONSENT);
  if (!value || typeof value !== 'object') return EMPTY_CONSENT;
  const candidate = value as Partial<ConsentPreferences>;
  return {
    camera: candidate.camera === true,
    storeDerivedResults: candidate.storeDerivedResults === true,
    acceptedAt: typeof candidate.acceptedAt === 'string' ? candidate.acceptedAt : null,
  };
}

function readStoredResults(): VisionTestResult[] {
  const value = readStorage<unknown>(STORAGE_KEYS.results, []);
  if (!Array.isArray(value)) return [];
  const normalized = value.flatMap((item): VisionTestResult[] => {
    if (!item || typeof item !== 'object') return [];
    const result = item as Partial<VisionTestResult>;
    const parsedMetricsSnapshot = parseVisionMetricsSnapshot(result.metricsSnapshot);
    const metricsSnapshotComplete =
      parsedMetricsSnapshot !== null && result.metricsSnapshotComplete !== false;
    const metricsSnapshot =
      parsedMetricsSnapshot ?? legacyVisionMetricsSnapshot(result.averageDistanceCm);
    const valid =
      typeof result.id === 'string' &&
      typeof result.completedAt === 'string' &&
      typeof result.snellen === 'string' &&
      typeof result.accuracy === 'number' &&
      Array.isArray(result.answers) &&
      (result.eyeMode === 'binocular' ||
        result.eyeMode === 'left' ||
        result.eyeMode === 'right');
    if (!valid) return [];
    return [
      {
        ...(result as VisionTestResult),
        answers: [],
        metricsSnapshot,
        metricsSnapshotComplete,
      },
    ];
  });
  // Migrate legacy records immediately: discard per-question answers and any
  // unknown/session-only properties while preserving their aggregate summary.
  writeStorage(
    STORAGE_KEYS.results,
    normalized.map(minimizeResultForPersistence),
  );
  return normalized;
}

function hasPersistenceConsent(preferences: ConsentPreferences): boolean {
  return preferences.acceptedAt !== null && preferences.storeDerivedResults;
}

function isSymptomCode(value: string): value is SymptomCode {
  return (SYMPTOM_CODES as readonly string[]).includes(value);
}

export default function App() {
  const { formatDateTime, formatNumber, locale, plural, setLocale, t } = useI18n();
  const engine = useVisionEngine();
  const campaignConfig = useMemo(
    () =>
      parseCampaignDeploymentConfig(
        typeof window === 'undefined' ? '' : window.location.href,
      ),
    [],
  );
  const [savedConsent, setSavedConsent] = useState<ConsentPreferences>(readConsentPreferences);
  const [cameraConsent, setCameraConsent] = useState(() => readConsentPreferences().camera);
  const [storageConsent, setStorageConsent] = useState(
    () => readConsentPreferences().storeDerivedResults,
  );
  const [symptoms, setSymptoms] = useState<SymptomCode[]>([]);
  const [symptomsComplete, setSymptomsComplete] = useState(false);
  const [journeyStartedAt] = useState(() => Date.now());
  const [journeyElapsedSeconds, setJourneyElapsedSeconds] = useState(0);
  const [guidanceEngaged, setGuidanceEngaged] = useState(false);
  const [privacyStatus, setPrivacyStatus] = useState<MessageKey | null>(null);
  const [monitoringResetSignal, setMonitoringResetSignal] = useState(0);
  const [resultSessionContexts, setResultSessionContexts] = useState<
    Record<string, ResultSessionContext>
  >({});
  const [retestDueAt, setRetestDueAt] = useState<number | null>(() =>
    readReminderTimestamp({
      persistenceConsent: hasPersistenceConsent(readConsentPreferences()),
    }),
  );
  const [screenCalibration, setScreenCalibration] = useState<ScreenCalibration>(() =>
    normalizeScreenCalibration(
      readStorage<unknown>(STORAGE_KEYS.screenCalibration, DEFAULT_SCREEN_CALIBRATION),
      DEFAULT_SCREEN_CALIBRATION,
    ),
  );
  const [results, setResults] = useState<VisionTestResult[]>(() =>
    hasPersistenceConsent(readConsentPreferences()) ? readStoredResults() : [],
  );

  const latestResult = results[0] ?? null;
  const latestResultMetrics = latestResult?.metricsSnapshot
    ? visionMetricsFromSnapshot(latestResult.metricsSnapshot)
    : EMPTY_VISION_METRICS;
  const latestResultContext = latestResult
    ? resultSessionContexts[latestResult.id]
    : undefined;
  const active = engine.status === 'running' || engine.status === 'demo';
  const consentComplete =
    cameraConsent && savedConsent.camera && savedConsent.acceptedAt !== null;
  const persistenceConsent = hasPersistenceConsent(savedConsent);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setJourneyElapsedSeconds(Math.floor((Date.now() - journeyStartedAt) / 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [journeyStartedAt]);

  const saveScreenCalibration = (calibration: ScreenCalibration) => {
    setScreenCalibration(calibration);
    writeStorage(STORAGE_KEYS.screenCalibration, calibration);
  };

  const saveResult = (result: VisionTestResult) => {
    const completedResult: VisionTestResult = {
      ...result,
      answers: [...result.answers],
      metricsSnapshot: snapshotVisionMetrics(engine.metrics),
      metricsSnapshotComplete: true,
    };
    setResultSessionContexts((current) => ({
      ...current,
      [completedResult.id]: {
        symptoms: symptomsComplete ? [...symptoms] : [],
      },
    }));
    setResults((current) => {
      const next = [completedResult, ...current].slice(0, 50);
      if (persistenceConsent) {
        writeStorage(
          STORAGE_KEYS.results,
          next.map(minimizeResultForPersistence),
        );
      }
      return next;
    });
    setGuidanceEngaged(false);
    window.setTimeout(() => {
      document
        .getElementById('screening-explanation')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 0);
  };

  const clearResults = () => {
    if (!window.confirm(t('history.clearConfirm'))) return;
    setResults([]);
    setResultSessionContexts({});
    window.localStorage.removeItem(STORAGE_KEYS.results);
  };

  const confirmConsent = () => {
    if (!cameraConsent) return;
    const next: ConsentPreferences = {
      camera: true,
      storeDerivedResults: storageConsent,
      acceptedAt: new Date().toISOString(),
    };
    setSavedConsent(next);
    writeStorage(STORAGE_KEYS.consent, next);
    if (storageConsent) {
      writeStorage(
        STORAGE_KEYS.results,
        results.map(minimizeResultForPersistence),
      );
    } else {
      window.localStorage.removeItem(STORAGE_KEYS.results);
      window.localStorage.removeItem(STORAGE_KEYS.retestReminder);
      window.localStorage.removeItem(STORAGE_KEYS.continuousReports);
      setRetestDueAt(null);
    }
    setPrivacyStatus('consent.saved');
    window.setTimeout(() => {
      document.getElementById('calibration')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 0);
  };

  const handleCameraConsentChange = (consented: boolean) => {
    setCameraConsent(consented);
    setPrivacyStatus(null);
    if (!consented) {
      engine.stopCamera();
      setSavedConsent((current) => {
        const next = { ...current, camera: false };
        writeStorage(STORAGE_KEYS.consent, next);
        return next;
      });
    }
  };

  const handleStorageConsentChange = (consented: boolean) => {
    setStorageConsent(consented);
    setPrivacyStatus(null);
    if (!consented && savedConsent.storeDerivedResults) {
      const next = { ...savedConsent, storeDerivedResults: false };
      setSavedConsent(next);
      writeStorage(STORAGE_KEYS.consent, next);
      window.localStorage.removeItem(STORAGE_KEYS.results);
      window.localStorage.removeItem(STORAGE_KEYS.retestReminder);
      window.localStorage.removeItem(STORAGE_KEYS.continuousReports);
      setRetestDueAt(null);
      setPrivacyStatus('consent.storageRevoked');
    }
  };

  const startCameraWithConsent = async () => {
    if (!consentComplete) {
      document.getElementById('consent')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    await engine.startCamera();
  };

  const deleteLocalScreeningData = () => {
    if (!window.confirm(t('privacy.deleteConfirm'))) return;
    engine.stopCamera();
    engine.resetDistanceCalibration();
    setResults([]);
    setResultSessionContexts({});
    setScreenCalibration(DEFAULT_SCREEN_CALIBRATION);
    setSymptoms([]);
    setSymptomsComplete(false);
    setCameraConsent(false);
    setStorageConsent(false);
    setSavedConsent(EMPTY_CONSENT);
    setGuidanceEngaged(false);
    setRetestDueAt(null);
    setMonitoringResetSignal((current) => current + 1);
    [
      STORAGE_KEYS.results,
      STORAGE_KEYS.screenCalibration,
      STORAGE_KEYS.distanceCalibration,
      STORAGE_KEYS.consent,
      STORAGE_KEYS.retestReminder,
      STORAGE_KEYS.continuousReports,
    ].forEach((key) => window.localStorage.removeItem(key));
    setPrivacyStatus('privacy.deleted');
  };

  const exitCurrentSession = () => {
    engine.stopCamera();
    setSymptoms([]);
    setSymptomsComplete(false);
    setGuidanceEngaged(false);
    document.getElementById('top')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const completion = useMemo(() => {
    const complete = [
      consentComplete,
      engine.distanceCalibration !== null,
      screenCalibration.confirmed,
      engine.metrics.lightingOk,
      active,
      symptomsComplete,
    ].filter(Boolean).length;
    return Math.round((complete / 6) * 100);
  }, [active, consentComplete, engine.distanceCalibration, engine.metrics.lightingOk, screenCalibration.confirmed, symptomsComplete]);

  const currentJourneyStage = useMemo<JourneyStageId>(() => {
    if (latestResult) return guidanceEngaged ? 'guide' : 'explain';
    if (!consentComplete) return 'consent';
    if (!engine.distanceCalibration || !screenCalibration.confirmed) return 'calibrate';
    return 'screen';
  }, [consentComplete, engine.distanceCalibration, guidanceEngaged, latestResult, screenCalibration.confirmed]);

  const journeyCopy: JourneyProgressCopy = {
    eyebrow: t('journey.eyebrow'),
    title: t('journey.title'),
    ariaLabel: t('journey.aria'),
    progressLabel: t('journey.progress'),
    elapsedLabel: t('journey.elapsed'),
    timeGoalLabel: t('journey.goal'),
    completedLabel: t('journey.completed'),
    currentLabel: t('journey.current'),
    upcomingLabel: t('journey.upcoming'),
    stageLabels: {
      access: t('journey.stage.access'),
      consent: t('journey.stage.consent'),
      calibrate: t('journey.stage.calibrate'),
      screen: t('journey.stage.screen'),
      explain: t('journey.stage.explain'),
      guide: t('journey.stage.guide'),
    },
  };

  const consentCopy: ConsentPanelCopy = {
    eyebrow: t('consent.eyebrow'),
    title: t('consent.title'),
    introduction: t('consent.intro'),
    cameraTitle: t('consent.cameraTitle'),
    cameraDescription: t('consent.cameraDescription'),
    requiredLabel: t('consent.required'),
    storageTitle: t('consent.storageTitle'),
    storageDescription: t('consent.storageDescription'),
    optionalLabel: t('consent.optional'),
    privacyNoticeTitle: t('consent.privacyTitle'),
    privacyNoticeBody: t('consent.privacyBody'),
    continueLabel: t('consent.continue'),
    cameraConsentHint: t('consent.hint'),
  };

  const symptomChoices = useMemo<SymptomChoice[]>(
    () => [
      {
        id: 'blurredVision',
        label: t('symptoms.choice.blurredVision'),
        description: t('symptoms.choice.blurredVisionDesc'),
      },
      {
        id: 'eyeStrainDryness',
        label: t('symptoms.choice.eyeStrainDryness'),
        description: t('symptoms.choice.eyeStrainDrynessDesc'),
      },
      {
        id: 'headache',
        label: t('symptoms.choice.headache'),
        description: t('symptoms.choice.headacheDesc'),
      },
      {
        id: 'eyePain',
        label: t('symptoms.choice.eyePain'),
        description: t('symptoms.choice.eyePainDesc'),
        redFlag: true,
      },
      {
        id: 'doubleVision',
        label: t('symptoms.choice.doubleVision'),
        description: t('symptoms.choice.doubleVisionDesc'),
        redFlag: true,
      },
      {
        id: 'flashesFloaters',
        label: t('symptoms.choice.flashesFloaters'),
        description: t('symptoms.choice.flashesFloatersDesc'),
        redFlag: true,
      },
      {
        id: 'none',
        label: t('symptoms.choice.none'),
        description: t('symptoms.choice.noneDesc'),
        exclusive: true,
      },
    ],
    [t],
  );

  const symptomsCopy: SymptomsPanelCopy = {
    eyebrow: t('symptoms.eyebrow'),
    title: t('symptoms.title'),
    introduction: t('symptoms.intro'),
    checklistLegend: t('symptoms.legend'),
    redFlagLabel: t('symptoms.redFlag'),
    redFlagNoticeTitle: t('symptoms.redFlagTitle'),
    redFlagNoticeBody: t('symptoms.redFlagBody'),
    completeLabel: t('symptoms.complete'),
    selectionRequiredHint: t('symptoms.required'),
    completedTitle: t('symptoms.completedTitle'),
    completedBody: t('symptoms.completedBody'),
    selectedSummaryLabel: t('symptoms.selected'),
    editLabel: t('symptoms.edit'),
  };

  const campaignCopy: CampaignAccessCopy = {
    eyebrow: t('campaign.eyebrow'),
    title: t('campaign.title'),
    introduction: t('campaign.intro'),
    currentLinkLabel: t('campaign.currentLink'),
    copyLinkLabel: t('campaign.copyLink'),
    linkCopiedStatus: t('campaign.linkCopied'),
    copyFailedStatus: t('campaign.copyFailed'),
    printCardLabel: t('campaign.printCard'),
    cardAriaLabel: t('campaign.cardAria'),
    cardKicker: t('campaign.cardKicker'),
    cardBody: t('campaign.cardBody'),
    qrAlt: t('campaign.qrAlt'),
    qrUnavailable: t('campaign.qrUnavailable'),
    campusFieldLabel: t('campaign.campusField'),
    linkFieldLabel: t('campaign.linkField'),
    accessCodeFieldLabel: t('campaign.codeField'),
    cardPrivacyLine: t('campaign.privacyLine'),
    careTitle: t('campaign.careTitle'),
    careBody: t('campaign.careBody'),
    careActionLabel: t('campaign.careAction'),
    referralTitle: t('campaign.referralTitle'),
    referralBody: t('campaign.referralBody'),
    referralActionLabel: t('campaign.referralAction'),
    shareTitle: t('campaign.shareTitle'),
    shareBody: t('campaign.shareBody'),
    shareActionLabel: t('campaign.shareAction'),
    sharePayloadText: t('campaign.sharePayload'),
    shareCompleteStatus: t('campaign.shareComplete'),
  };

  const assessment = useMemo(
    () =>
      assessScreeningRisk({
        metrics: latestResultMetrics,
        latestResult,
        symptoms: latestResultContext?.symptoms ?? [],
        symptomContextRetained: latestResultContext !== undefined,
        metricsSnapshotRetained: latestResult?.metricsSnapshotComplete === true,
      }),
    [latestResult, latestResultContext, latestResultMetrics],
  );

  const explanationCopy: ScreeningExplanationCopy = {
    eyebrow: t('explanation.eyebrow'),
    title: t('explanation.title'),
    introduction: t('explanation.intro'),
    blocksAriaLabel: t('explanation.blocksAria'),
    resultTitle: t('explanation.resultTitle'),
    mainIndicatorsTitle: t('explanation.indicatorsTitle'),
    confidenceAndLimitationsTitle: t('explanation.confidenceTitle'),
    recommendedNextStepTitle: t('explanation.nextStepTitle'),
    riskBandLabel: t('explanation.riskLabel'),
    riskBandLabels: {
      normal: t('explanation.risk.normal'),
      caution: t('explanation.risk.caution'),
      concern: t('explanation.risk.concern'),
    },
    riskBandDescriptions: {
      normal: t('explanation.riskDesc.normal'),
      caution: t('explanation.riskDesc.caution'),
      concern: t('explanation.riskDesc.concern'),
    },
    screeningNotDiagnosisNotice: t('explanation.notDiagnosis'),
    professionalCareCue: t('explanation.professionalCue'),
    demoWarningTitle: t('explanation.demoTitle'),
    demoWarningBody: t('explanation.demoBody'),
    metricCardsAriaLabel: t('explanation.metricCardsAria'),
    acuityMetricTitle: t('explanation.metric.acuity'),
    blinkMetricTitle: t('explanation.metric.blink'),
    distanceMetricTitle: t('explanation.metric.distance'),
    unavailableValue: t('explanation.unavailable'),
    blinkRateUnit: t('explanation.blinkUnit'),
    distanceUnit: t('explanation.distanceUnit'),
    metricStateLabels: {
      flagged: t('explanation.metricState.flagged'),
      notFlagged: t('explanation.metricState.notFlagged'),
      unavailable: t('explanation.metricState.unavailable'),
    },
    indicatorListLabel: t('explanation.indicatorList'),
    indicatorLabels: {
      symptomBlurredVision: t('explanation.indicator.symptomBlurredVision'),
      symptomEyeStrainDryness: t('explanation.indicator.symptomEyeStrainDryness'),
      symptomHeadache: t('explanation.indicator.symptomHeadache'),
      symptomEyePain: t('explanation.indicator.symptomEyePain'),
      symptomDoubleVision: t('explanation.indicator.symptomDoubleVision'),
      symptomFlashesFloaters: t('explanation.indicator.symptomFlashesFloaters'),
      acuityWorseThan20_40: t('explanation.indicator.acuityWorseThan20_40'),
      blinkRateLow: t('explanation.indicator.blinkRateLow'),
      viewingDistanceUnsafe: t('explanation.indicator.viewingDistanceUnsafe'),
      fatigueModerate: t('explanation.indicator.fatigueModerate'),
      fatigueHigh: t('explanation.indicator.fatigueHigh'),
    },
    noIndicators: t('explanation.indicator.none'),
    confidenceLabel: t('explanation.confidenceLabel'),
    confidenceLabels: {
      high: t('explanation.confidence.high'),
      medium: t('explanation.confidence.medium'),
      low: t('explanation.confidence.low'),
    },
    limitationsLabel: t('explanation.limitationsLabel'),
    limitationLabels: {
      visionTestMissing: t('explanation.limitation.visionTestMissing'),
      screenCalibrationMissing: t('explanation.limitation.screenCalibrationMissing'),
      cameraCalibrationMissing: t('explanation.limitation.cameraCalibrationMissing'),
      demoMode: t('explanation.limitation.demoMode'),
      averageDistanceMissing: t('explanation.limitation.averageDistanceMissing'),
      averageDistanceOutsideSupportedRange: t(
        'explanation.limitation.averageDistanceOutsideSupportedRange',
      ),
      trackedDataInsufficient: t('explanation.limitation.trackedDataInsufficient'),
      symptomContextNotRetained: t(
        'explanation.limitation.symptomContextNotRetained',
      ),
      metricsSnapshotNotRetained: t(
        'explanation.limitation.metricsSnapshotNotRetained',
      ),
    },
    noLimitations: t('explanation.limitation.none'),
    nextStepLabel: t('explanation.nextStepLabel'),
    nextStepLabels: {
      demoOnly: t('explanation.next.demoOnly'),
      continueHealthyScreenHabits: t('explanation.next.continueHealthyScreenHabits'),
      takeBreakAndReassess: t('explanation.next.takeBreakAndReassess'),
      pauseAndSeekAdviceIfPersistent: t(
        'explanation.next.pauseAndSeekAdviceIfPersistent',
      ),
      arrangeProfessionalEyeExam: t('explanation.next.arrangeProfessionalEyeExam'),
      seekUrgentProfessionalCare: t('explanation.next.seekUrgentProfessionalCare'),
    },
    actionGroupAriaLabel: t('explanation.actionsAria'),
    scheduleRetestLabel: t('explanation.scheduleRetest'),
    scheduleRetestHint: t('explanation.scheduleHint'),
    retestActionStatus: t('explanation.retestStatus'),
    careReferralActionLabel: t('explanation.referralAction'),
    careReferralHint: t('explanation.referralHint'),
    summaryActionsAriaLabel: t('explanation.summaryActionsAria'),
    copySummaryLabel: t('explanation.copySummary'),
    shareSummaryLabel: t('explanation.shareSummary'),
    printSummaryLabel: t('explanation.printSummary'),
    summaryTitle: t('explanation.summaryTitle'),
    summaryRiskLabel: t('explanation.summaryRisk'),
    summaryAcuityLabel: t('explanation.summaryAcuity'),
    summaryBlinkLabel: t('explanation.summaryBlink'),
    summaryDistanceLabel: t('explanation.summaryDistance'),
    summaryIndicatorsLabel: t('explanation.summaryIndicators'),
    summaryConfidenceLabel: t('explanation.summaryConfidence'),
    summaryLimitationsLabel: t('explanation.summaryLimitations'),
    summaryNextStepLabel: t('explanation.summaryNext'),
    summaryLabelSeparator: t('explanation.summaryLabelSeparator'),
    summaryListSeparator: t('explanation.summaryListSeparator'),
    summaryCopiedStatus: t('explanation.summaryCopied'),
    summaryCopyFailedStatus: t('explanation.summaryCopyFailed'),
    summarySharedStatus: t('explanation.summaryShared'),
    summaryPrintStatus: t('explanation.summaryPrint'),
  };

  const trendsCopy: TrendsAndReminderCopy = {
    eyebrow: t('trends.eyebrow'),
    title: t('trends.title'),
    description: t('trends.description'),
    formatDateTime: (value) =>
      formatDateTime(value, { dateStyle: 'medium', timeStyle: 'short' }),
    trend: {
      title: t('trends.chartTitle'),
      realResultsOnly: t('trends.realOnly'),
      empty: t('trends.empty'),
      singleResult: t('trends.single'),
      resultCount: (count) =>
        plural(count, 'trends.countOne', 'trends.countOther', { count }),
      demoExcluded: (count) =>
        plural(count, 'trends.demoExcludedOne', 'trends.demoExcludedOther', { count }),
      chartAriaLabel: (count) => t('trends.chartAria', { count }),
      chartSummary: ({ count, firstDate, lastDate, excludedDemoCount }) =>
        t('trends.chartSummary', {
          count,
          first: firstDate,
          last: lastDate,
          excluded: excludedDemoCount,
        }),
      chartScaleHint: t('trends.scaleHint'),
      accessibleDataTitle: t('trends.accessibleData'),
      pointLabel: ({ position, date, eye, snellen }) =>
        t('trends.point', { position, date, eye, snellen }),
      eyeLabels: {
        binocular: t('vision.eye.binocular'),
        left: t('vision.eye.left'),
        right: t('vision.eye.right'),
      },
      comparisonTitle: t('trends.comparisonTitle'),
      comparisonScope: (eye) => t('trends.comparisonScope', { eye }),
      latestLabel: t('trends.latest'),
      previousLabel: t('trends.previous'),
      changeLabel: t('trends.change'),
      noPrevious: t('trends.noPrevious'),
      noComparison: t('trends.noComparison'),
      improved: ({ previous, latest }) => t('trends.improved', { previous, latest }),
      worsened: ({ previous, latest }) => t('trends.worsened', { previous, latest }),
      unchanged: ({ previous, latest }) =>
        t('trends.unchanged', { previous, latest }),
    },
    reminder: {
      title: t('reminder.title'),
      description: t('reminder.description'),
      persisted: t('reminder.persisted'),
      memoryOnly: t('reminder.memoryOnly'),
      inactive: t('reminder.inactive'),
      set: t('reminder.set'),
      reset: t('reminder.reset'),
      cancel: t('reminder.cancel'),
      scheduledFor: (date) => t('reminder.scheduledFor', { date }),
      countdown: ({ minutes, seconds }) =>
        t('reminder.countdown', { minutes, seconds }),
      due: t('reminder.due'),
    },
  };

  return (
    <div className="app-shell">
      <header className="site-header">
        <a className="brand" href="#top" aria-label={t('brand.homeAria')}>
          <span className="brand-mark" aria-hidden="true">
            <i />
          </span>
          <span>
            <strong>VisionGuard</strong>
            <small>{t('brand.tagline')}</small>
          </span>
        </a>
        <nav aria-label={t('nav.aria')}>
          <a href="#calibration">{t('nav.calibration')}</a>
          <a href="#vision-test">{t('nav.screening')}</a>
          <a href="#continuous-monitoring">{t('nav.continuous')}</a>
          <span className={`privacy-chip ${active ? 'is-active' : ''}`}>
            <span /> {t('nav.local')}
          </span>
          <label className="language-picker">
            <span>{t('language.label')}</span>
            <select
              aria-label={t('language.label')}
              value={locale}
              onChange={(event) => {
                if (isLocale(event.target.value)) setLocale(event.target.value);
              }}
            >
              {LOCALE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </nav>
      </header>

      <main id="top">
        <section className="hero">
          <div className="hero-copy">
            <span className="hero-kicker">{t('hero.kicker')}</span>
            <h1>
              {t('hero.title')}
              <em>{t('hero.titleEmphasis')}</em>
            </h1>
            <p>{t('hero.body')}</p>
            <div className="hero-actions">
              <a className="button button-primary button-large" href="#consent">
                {t('hero.start')}
              </a>
              <a className="button button-ghost button-large" href="#vision-test">
                {t('hero.steps')}
              </a>
            </div>
            <div className="hero-proof">
              <span><strong>478</strong> {t('hero.landmarks')}</span>
              <span><strong>100%</strong> {t('hero.inference')}</span>
              <span><strong>0</strong> {t('hero.accounts')}</span>
            </div>
          </div>

          <div className="hero-visual" aria-hidden="true">
            <div className="hero-orbit orbit-one" />
            <div className="hero-orbit orbit-two" />
            <div className="hero-eye">
              <div className="hero-iris">
                <div className="hero-pupil" />
              </div>
            </div>
            <div className="hero-readout readout-top">
              <span>{t('hero.distance')}</span>
              <strong>
                {engine.metrics.distanceCm === null
                  ? '--'
                  : formatNumber(engine.metrics.distanceCm, {
                      minimumFractionDigits: 1,
                      maximumFractionDigits: 1,
                    })}{' '}
                cm
              </strong>
            </div>
            <div className="hero-readout readout-bottom">
              <span>{t('hero.fatigue')}</span>
              <strong>{engine.metrics.fatigueScore}/100</strong>
            </div>
            <div className="scan-line" />
          </div>
        </section>

        <div className="medical-notice" role="note">
          <strong>{t('notice.title')}</strong>
          <span>{t('notice.body')}</span>
        </div>

        <JourneyProgress
          currentStage={currentJourneyStage}
          elapsedSeconds={journeyElapsedSeconds}
          copy={journeyCopy}
        />

        <div id="consent" className="consent-anchor">
          <ConsentPanel
            cameraConsent={cameraConsent}
            storageConsent={storageConsent}
            onCameraConsentChange={handleCameraConsentChange}
            onStorageConsentChange={handleStorageConsentChange}
            onContinue={confirmConsent}
            copy={consentCopy}
          />
          <div className="privacy-data-controls">
            <button className="text-button danger" type="button" onClick={deleteLocalScreeningData}>
              {t('privacy.delete')}
            </button>
            <span role="status" aria-live="polite">
              {privacyStatus ? t(privacyStatus) : ''}
            </span>
          </div>
        </div>

        <section className="setup-overview" aria-label={t('setup.aria')}>
          <div>
            <span className="eyebrow">{t('setup.label')}</span>
            <strong>{t('setup.ready', { value: completion })}</strong>
          </div>
          <div className="setup-track"><span style={{ width: `${completion}%` }} /></div>
          <div className="setup-checks">
            <span className={active ? 'is-complete' : ''}>{t('setup.camera')}</span>
            <span className={engine.distanceCalibration ? 'is-complete' : ''}>{t('setup.distance')}</span>
            <span className={screenCalibration.confirmed ? 'is-complete' : ''}>{t('setup.screen')}</span>
            <span className={engine.metrics.lightingOk ? 'is-complete' : ''}>{t('setup.lighting')}</span>
            <span className={symptomsComplete ? 'is-complete' : ''}>{t('symptoms.eyebrow')}</span>
          </div>
        </section>

        <section className="dashboard-grid" aria-label={t('dashboard.aria')}>
          <CameraPanel
            videoRef={engine.videoRef}
            status={engine.status}
            error={engine.error}
            metrics={engine.metrics}
            onStart={startCameraWithConsent}
            onPause={engine.pauseMonitoring}
            onResume={engine.resumeMonitoring}
            onStop={engine.stopCamera}
            onExit={exitCurrentSession}
            onDemo={engine.enableDemo}
          />
          <MetricsPanel
            metrics={engine.metrics}
            latestResult={latestResult}
            hasDistanceCalibration={engine.distanceCalibration !== null}
            demoMode={engine.status === 'demo'}
            onResetSession={engine.resetSession}
          />
        </section>

        <ContinuousMonitoringPanel
          engineStatus={engine.status}
          metrics={engine.metrics}
          cameraConsentReady={consentComplete}
          persistenceConsent={persistenceConsent}
          hasDistanceCalibration={engine.distanceCalibration !== null}
          resetSignal={monitoringResetSignal}
          onRequestConsent={() =>
            document
              .getElementById('consent')
              ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }
          onStartCamera={startCameraWithConsent}
          onPauseCamera={engine.pauseMonitoring}
          onResumeCamera={engine.resumeMonitoring}
          onStopCamera={engine.stopCamera}
          onExit={exitCurrentSession}
        />

        <CalibrationPanel
          distanceCalibration={engine.distanceCalibration}
          screenCalibration={screenCalibration}
          lightingLevel={engine.metrics.lightingLevel}
          lightingOk={engine.metrics.lightingOk}
          isDistanceCalibrating={engine.isDistanceCalibrating}
          calibrationProgress={engine.calibrationProgress}
          calibrationMessage={engine.calibrationMessage}
          onStartDistanceCalibration={() => engine.startDistanceCalibration()}
          onResetDistanceCalibration={engine.resetDistanceCalibration}
          onSaveScreenCalibration={saveScreenCalibration}
        />

        <SymptomsPanel
          choices={symptomChoices}
          selectedIds={symptoms}
          completed={symptomsComplete}
          onSelectedIdsChange={(ids) => setSymptoms(ids.filter(isSymptomCode))}
          onComplete={() => setSymptomsComplete(true)}
          onEdit={() => setSymptomsComplete(false)}
          copy={symptomsCopy}
        />

        <VisionTest
          status={engine.status}
          metrics={engine.metrics}
          distanceCalibration={engine.distanceCalibration}
          screenCalibration={screenCalibration}
          symptomsComplete={symptomsComplete}
          onPauseMonitoring={engine.pauseMonitoring}
          onResumeMonitoring={engine.resumeMonitoring}
          onStopMonitoring={engine.stopCamera}
          onComplete={saveResult}
        />

        {latestResult && (
          <div id="screening-explanation">
            <ScreeningExplanation
              assessment={assessment}
              latestResult={latestResult}
              metrics={latestResultMetrics}
              copy={explanationCopy}
              onScheduleRetest={() => {
                setRetestDueAt(createRetestReminderDueAt());
                setGuidanceEngaged(true);
                window.setTimeout(() => {
                  document
                    .getElementById('trends-reminder')
                    ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }, 0);
              }}
              careReferralAction={campaignConfig.referralUrl
                ? {
                    href: campaignConfig.referralUrl,
                    openInNewTab:
                      campaignConfig.referralUrl.startsWith('https:') ||
                      campaignConfig.referralUrl.startsWith('http:'),
                  }
                : {
                    onActivate: () => {
                      setGuidanceEngaged(true);
                      document
                        .querySelector<HTMLElement>(
                          '#screening-explanation .vg-screening-explanation__summary-actions button',
                        )
                        ?.focus();
                    },
                  }}
            />
          </div>
        )}

        <ResultsHistory results={results} onClear={clearResults} />

        <div id="trends-reminder">
          <TrendsAndReminder
            results={results}
            copy={trendsCopy}
            persistenceConsent={persistenceConsent}
            reminderDueAt={retestDueAt}
            onReminderChange={(dueAt) => {
              setRetestDueAt(dueAt);
              if (dueAt !== null) setGuidanceEngaged(true);
            }}
          />
        </div>

        <CampaignAccess
          campaignName={campaignConfig.campaignName ?? t('campaign.name')}
          campusName={campaignConfig.campusName ?? t('campaign.campusName')}
          accessCode={campaignConfig.accessCode}
          careAction={{
            onActivate: () =>
              document.getElementById('method-title')?.scrollIntoView({ behavior: 'smooth' }),
          }}
          referralAction={campaignConfig.referralUrl
            ? {
                href: campaignConfig.referralUrl,
                openInNewTab:
                  campaignConfig.referralUrl.startsWith('https:') ||
                  campaignConfig.referralUrl.startsWith('http:'),
              }
            : {
                onActivate: () => {
                  setGuidanceEngaged(true);
                  document
                    .getElementById(latestResult ? 'screening-explanation' : 'vision-test')
                    ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                },
              }}
          copy={campaignCopy}
        />

        <section className="method-section" aria-labelledby="method-title">
          <div className="section-heading">
            <div>
              <span className="eyebrow">{t('method.eyebrow')}</span>
              <h2 id="method-title">{t('method.title')}</h2>
            </div>
            <p>{t('method.intro')}</p>
          </div>
          <div className="method-grid">
            <article>
              <span>01</span>
              <h3>{t('method.landmarkTitle')}</h3>
              <p>{t('method.landmarkBody')}</p>
            </article>
            <article>
              <span>02</span>
              <h3>{t('method.distanceTitle')}</h3>
              <p>{t('method.distanceBody')}</p>
            </article>
            <article>
              <span>03</span>
              <h3>{t('method.optotypeTitle')}</h3>
              <p>{t('method.optotypeBody')}</p>
            </article>
            <article>
              <span>04</span>
              <h3>{t('method.strainTitle')}</h3>
              <p>{t('method.strainBody')}</p>
            </article>
          </div>
        </section>
      </main>

      <footer>
        <div className="brand footer-brand">
          <span className="brand-mark" aria-hidden="true"><i /></span>
          <span><strong>VisionGuard AI</strong><small>{t('footer.tagline')}</small></span>
        </div>
        <p>{t('footer.notice')}</p>
        <span>© 2026 VisionGuard</span>
      </footer>
    </div>
  );
}
