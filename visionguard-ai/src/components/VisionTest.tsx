import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ACUITY_LEVELS,
  DIRECTIONS,
  DISTANCE_TOLERANCE_CM,
  TARGET_DISTANCE_CM,
} from '../constants';
import { createVisionTestResult, optotypeSizeMm, optotypeSizePx } from '../lib/acuity';
import { useI18n } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/messages';
import type {
  AcuityAnswer,
  Direction,
  DistanceCalibration,
  EngineStatus,
  EyeMode,
  ScreenCalibration,
  VisionMetrics,
  VisionTestResult,
} from '../types';
import { LandoltC } from './LandoltC';

interface VisionTestProps {
  status: EngineStatus;
  metrics: VisionMetrics;
  distanceCalibration: DistanceCalibration | null;
  screenCalibration: ScreenCalibration;
  symptomsComplete: boolean;
  onPauseMonitoring: () => void;
  onResumeMonitoring: () => Promise<void>;
  onStopMonitoring: () => void;
  onComplete: (result: VisionTestResult) => void;
}

type TestPhase = 'setup' | 'testing' | 'complete';
type TestSource = 'camera' | 'demo' | 'manual';

const directionMessageKeys: Record<Direction, MessageKey> = {
  up: 'vision.direction.up',
  right: 'vision.direction.right',
  down: 'vision.direction.down',
  left: 'vision.direction.left',
};

const eyeModeMessageKeys: Record<EyeMode, MessageKey> = {
  binocular: 'vision.eye.binocular',
  left: 'vision.eye.left',
  right: 'vision.eye.right',
};

function randomDirection(previous?: Direction): Direction {
  const candidates = previous ? DIRECTIONS.filter((direction) => direction !== previous) : DIRECTIONS;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

export function VisionTest({
  status,
  metrics,
  distanceCalibration,
  screenCalibration,
  symptomsComplete,
  onPauseMonitoring,
  onResumeMonitoring,
  onStopMonitoring,
  onComplete,
}: VisionTestProps) {
  const { formatNumber, t } = useI18n();
  const [phase, setPhase] = useState<TestPhase>('setup');
  const [eyeMode, setEyeMode] = useState<EyeMode>('binocular');
  const [levelIndex, setLevelIndex] = useState(0);
  const [trialIndex, setTrialIndex] = useState(0);
  const [correctAtLevel, setCorrectAtLevel] = useState(0);
  const [bestDenominator, setBestDenominator] = useState<number | null>(null);
  const [direction, setDirection] = useState<Direction>(() => randomDirection());
  const [answers, setAnswers] = useState<AcuityAnswer[]>([]);
  const [result, setResult] = useState<VisionTestResult | null>(null);
  const [manualFallbackOpen, setManualFallbackOpen] = useState(false);
  const [manualChecks, setManualChecks] = useState({
    distance: false,
    lighting: false,
    position: false,
  });
  const [testSource, setTestSource] = useState<TestSource | null>(null);
  const [testIncludesDemo, setTestIncludesDemo] = useState(false);
  const [sourceChanged, setSourceChanged] = useState(false);

  const activeLevel = ACUITY_LEVELS[levelIndex];
  const cameraActive = status === 'running' || status === 'demo';
  const withinDistance =
    metrics.distanceCm !== null &&
    Math.abs(metrics.distanceCm - TARGET_DISTANCE_CM) <= DISTANCE_TOLERANCE_CM;
  const automaticReady =
    cameraActive && metrics.faceDetected && metrics.poseOk && withinDistance && metrics.lightingOk;
  const manualReady =
    manualFallbackOpen &&
    manualChecks.distance &&
    manualChecks.lighting &&
    manualChecks.position;
  const distanceReady = automaticReady || manualReady;
  const calibrationReady =
    screenCalibration.confirmed && (distanceCalibration !== null || manualReady);
  const canStart = symptomsComplete && calibrationReady && distanceReady;

  const displayedSizePx = useMemo(
    () =>
      activeLevel
        ? optotypeSizePx(activeLevel.denominator, TARGET_DISTANCE_CM, screenCalibration.pxPerMm)
        : 0,
    [activeLevel, screenCalibration.pxPerMm],
  );

  const finishTest = useCallback(
    (finalDenominator: number | null, finalAnswers: AcuityAnswer[]) => {
      const completed = createVisionTestResult({
        eyeMode,
        denominator: finalDenominator,
        answers: finalAnswers,
        screenCalibrated: screenCalibration.confirmed,
        cameraCalibrated: testSource === 'camera' && distanceCalibration !== null,
        demo: testIncludesDemo,
      });
      setResult(completed);
      setPhase('complete');
      onComplete(completed);
    },
    [distanceCalibration, eyeMode, onComplete, screenCalibration.confirmed, testIncludesDemo, testSource],
  );

  const handleAnswer = useCallback(
    (actual: Direction) => {
      if (phase !== 'testing' || !distanceReady || !activeLevel) return;

      const answer: AcuityAnswer = {
        denominator: activeLevel.denominator,
        expected: direction,
        actual,
        correct: actual === direction,
        distanceCm: testSource === 'manual' ? null : metrics.distanceCm,
        answeredAt: new Date().toISOString(),
      };
      const nextAnswers = [...answers, answer];
      const nextCorrectCount = correctAtLevel + (answer.correct ? 1 : 0);
      setAnswers(nextAnswers);

      if (trialIndex < 2) {
        setTrialIndex((current) => current + 1);
        setCorrectAtLevel(nextCorrectCount);
        setDirection((current) => randomDirection(current));
        return;
      }

      const passedLevel = nextCorrectCount >= 2;
      if (!passedLevel) {
        finishTest(bestDenominator, nextAnswers);
        return;
      }

      const passedDenominator = activeLevel.denominator;
      setBestDenominator(passedDenominator);
      if (levelIndex === ACUITY_LEVELS.length - 1) {
        finishTest(passedDenominator, nextAnswers);
        return;
      }

      setLevelIndex((current) => current + 1);
      setTrialIndex(0);
      setCorrectAtLevel(0);
      setDirection((current) => randomDirection(current));
    },
    [
      activeLevel,
      answers,
      bestDenominator,
      correctAtLevel,
      direction,
      distanceReady,
      finishTest,
      levelIndex,
      metrics.distanceCm,
      phase,
      testSource,
      trialIndex,
    ],
  );

  useEffect(() => {
    if (phase !== 'testing') return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      const mapping: Partial<Record<string, Direction>> = {
        ArrowUp: 'up',
        ArrowRight: 'right',
        ArrowDown: 'down',
        ArrowLeft: 'left',
        w: 'up',
        d: 'right',
        s: 'down',
        a: 'left',
      };
      const normalizedKey = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      const selectedDirection = mapping[normalizedKey];
      if (selectedDirection) {
        event.preventDefault();
        handleAnswer(selectedDirection);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleAnswer, phase]);

  useEffect(() => {
    if (phase !== 'testing' || !testSource) return;
    const changedToLive = testSource === 'demo' && status === 'running';
    const changedToDemo = testSource === 'camera' && status === 'demo';
    if (!changedToLive && !changedToDemo) return;
    setPhase('setup');
    setResult(null);
    setTestSource(null);
    setSourceChanged(true);
  }, [phase, status, testSource]);

  useEffect(() => {
    if (phase === 'testing' && manualReady && testSource !== 'manual') {
      setTestSource('manual');
    }
  }, [manualReady, phase, testSource]);

  const startTest = () => {
    if (!canStart) return;
    setLevelIndex(0);
    setTrialIndex(0);
    setCorrectAtLevel(0);
    setBestDenominator(null);
    setAnswers([]);
    setDirection(randomDirection());
    setResult(null);
    const source: TestSource = manualReady ? 'manual' : status === 'demo' ? 'demo' : 'camera';
    setTestSource(source);
    setTestIncludesDemo(source === 'demo');
    setSourceChanged(false);
    setPhase('testing');
  };

  const restart = () => {
    setPhase('setup');
    setResult(null);
    setTestSource(null);
  };

  const manualFallbackPanel = (
    <div className="manual-fallback-panel">
      <div>
        <strong>{t('vision.manual.title')}</strong>
        <p>{t('vision.manual.body')}</p>
      </div>
      {!manualFallbackOpen ? (
        <button
          className="button button-ghost"
          type="button"
          onClick={() => setManualFallbackOpen(true)}
        >
          {t('vision.manual.enable')}
        </button>
      ) : (
        <>
          <fieldset aria-label={t('vision.manual.checksAria')}>
            {(
              [
                ['distance', 'vision.manual.distance'],
                ['lighting', 'vision.manual.lighting'],
                ['position', 'vision.manual.position'],
              ] as const
            ).map(([key, messageKey]) => (
              <label key={key}>
                <input
                  type="checkbox"
                  checked={manualChecks[key]}
                  onChange={(event) =>
                    setManualChecks((current) => ({
                      ...current,
                      [key]: event.target.checked,
                    }))
                  }
                />
                <span>{t(messageKey)}</span>
              </label>
            ))}
          </fieldset>
          <div className="button-row">
            <span className={`manual-ready-status ${manualReady ? 'is-ready' : ''}`} role="status">
              {manualReady ? `✓ ${t('vision.manual.active')}` : t('vision.manual.continue')}
            </span>
            <button
              className="text-button"
              type="button"
              onClick={() => setManualFallbackOpen(false)}
            >
              {t('vision.manual.cancel')}
            </button>
          </div>
        </>
      )}
    </div>
  );

  return (
    <section className="vision-test-section" id="vision-test" aria-labelledby="vision-test-title">
      <div className="section-heading">
        <div>
          <span className="eyebrow">{t('vision.eyebrow')}</span>
          <h2 id="vision-test-title">{t('vision.title')}</h2>
        </div>
        <p>{t('vision.body')}</p>
      </div>

      <div className="panel test-shell">
        {phase === 'setup' && (
          <div className="test-setup">
            <div className="test-copy">
              <span className="step-tag">{t('vision.prepare')}</span>
              <h3>{t('vision.chooseEye')}</h3>
              <p>{t('vision.coverEye')}</p>

              <div className="eye-mode-selector" role="radiogroup" aria-label={t('vision.eyeAria')}>
                {(Object.keys(eyeModeMessageKeys) as EyeMode[]).map((mode) => (
                  <button
                    key={mode}
                    className={eyeMode === mode ? 'is-selected' : ''}
                    type="button"
                    role="radio"
                    aria-checked={eyeMode === mode}
                    onClick={() => setEyeMode(mode)}
                  >
                    {t(eyeModeMessageKeys[mode])}
                  </button>
                ))}
              </div>

              <div className="readiness-list">
                <div className={distanceCalibration || manualReady ? 'is-ready' : ''}>
                  <span>{distanceCalibration || manualReady ? '✓' : '1'}</span>
                  {t('vision.readyDistance')}
                </div>
                <div className={screenCalibration.confirmed ? 'is-ready' : ''}>
                  <span>{screenCalibration.confirmed ? '✓' : '2'}</span>
                  {t('vision.readyScreen')}
                </div>
                <div className={metrics.lightingOk || manualReady ? 'is-ready' : ''}>
                  <span>{metrics.lightingOk || manualReady ? '✓' : '3'}</span>
                  {t('vision.readyLighting')}
                </div>
                <div className={distanceReady ? 'is-ready' : ''}>
                  <span>{distanceReady ? '✓' : '4'}</span>
                  {t('vision.readyFace')}
                </div>
                <div className={symptomsComplete ? 'is-ready' : ''}>
                  <span>{symptomsComplete ? '✓' : '5'}</span>
                  {t('vision.readySymptoms')}
                </div>
              </div>

              <button className="button button-primary button-large" type="button" onClick={startTest} disabled={!canStart}>
                {t('vision.start', { eye: t(eyeModeMessageKeys[eyeMode]) })}
              </button>
              {!canStart && (
                <p className="fine-print">
                  {!calibrationReady
                    ? t('vision.completeCalibrations')
                    : !symptomsComplete
                      ? t('vision.completeSymptoms')
                      : t('vision.startCameraDistance')}
                </p>
              )}
              {sourceChanged && (
                <p className="calibration-message" role="status">
                  {t('vision.sourceChanged')}
                </p>
              )}
              {!automaticReady && manualFallbackPanel}
            </div>

            <div className="test-preview-card">
              <div className="preview-optotype">
                <LandoltC
                  sizePx={optotypeSizePx(80, TARGET_DISTANCE_CM, screenCalibration.pxPerMm)}
                  direction="right"
                />
              </div>
              <span>{t('vision.sample')}</span>
              <small>
                {t('vision.sampleSize', {
                  size: formatNumber(optotypeSizeMm(80, TARGET_DISTANCE_CM), {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  }),
                })}
              </small>
            </div>
          </div>
        )}

        {phase === 'testing' && activeLevel && (
          <div className="test-active">
            <div className="test-toolbar">
              <div>
                <span className="step-tag">
                  {t('vision.screeningEye', { eye: t(eyeModeMessageKeys[eyeMode]) })}
                </span>
                <strong>
                  {t('vision.levelAttempt', {
                    level: levelIndex + 1,
                    levels: ACUITY_LEVELS.length,
                    attempt: trialIndex + 1,
                  })}
                </strong>
              </div>
              <div className="test-toolbar-actions" role="group" aria-label={t('vision.controlsAria')}>
                <div className={`distance-lock ${distanceReady ? 'is-ready' : ''}`}>
                  <span className="status-dot" />
                  {testSource === 'manual' && manualReady
                    ? t('vision.manual.active')
                    : distanceReady
                    ? t('vision.distanceLocked', {
                        distance:
                          metrics.distanceCm === null
                            ? '--'
                            : formatNumber(metrics.distanceCm, {
                                minimumFractionDigits: 1,
                                maximumFractionDigits: 1,
                              }),
                      })
                    : metrics.faceDetected
                      ? t('vision.moveDistance')
                      : t('vision.noFace')}
                </div>
                {(status === 'running' || status === 'demo') && (
                  <button className="text-button" type="button" onClick={onPauseMonitoring}>
                    {t('vision.pauseCamera')}
                  </button>
                )}
                {status === 'paused' && (
                  <button className="text-button" type="button" onClick={() => void onResumeMonitoring()}>
                    {t('vision.resumeCamera')}
                  </button>
                )}
                {(status === 'running' || status === 'demo' || status === 'paused') && (
                  <button
                    className="text-button danger"
                    type="button"
                    onClick={() => {
                      onStopMonitoring();
                      restart();
                    }}
                  >
                    {t('vision.stopCamera')}
                  </button>
                )}
                <button
                  className="text-button test-exit-button"
                  type="button"
                  onClick={() => {
                    onStopMonitoring();
                    restart();
                  }}
                >
                  {t('vision.exit')}
                </button>
              </div>
            </div>

            <div className={`optotype-stage ${distanceReady ? '' : 'is-paused'}`}>
              <LandoltC sizePx={displayedSizePx} direction={direction} />
              {!distanceReady && (
                <div className="pause-overlay">
                  <strong>{t('vision.paused')}</strong>
                  <span>{t('vision.resume')}</span>
                  {manualFallbackPanel}
                </div>
              )}
            </div>

            <div className="test-question">
              <strong>{t('vision.question')}</strong>
              <span>{t('vision.inputHint')}</span>
            </div>

            <div className="direction-pad" aria-label={t('vision.directionAria')}>
              <button type="button" className="direction-up" onClick={() => handleAnswer('up')} disabled={!distanceReady}>
                ↑<span>{t(directionMessageKeys.up)}</span>
              </button>
              <button type="button" className="direction-left" onClick={() => handleAnswer('left')} disabled={!distanceReady}>
                ←<span>{t(directionMessageKeys.left)}</span>
              </button>
              <button type="button" className="direction-right" onClick={() => handleAnswer('right')} disabled={!distanceReady}>
                →<span>{t(directionMessageKeys.right)}</span>
              </button>
              <button type="button" className="direction-down" onClick={() => handleAnswer('down')} disabled={!distanceReady}>
                ↓<span>{t(directionMessageKeys.down)}</span>
              </button>
            </div>

            <div
              className="test-progress"
              role="progressbar"
              aria-label={t('journey.progress')}
              aria-valuemin={0}
              aria-valuemax={ACUITY_LEVELS.length * 3}
              aria-valuenow={levelIndex * 3 + trialIndex + 1}
              aria-valuetext={t('vision.levelAttempt', {
                level: levelIndex + 1,
                levels: ACUITY_LEVELS.length,
                attempt: trialIndex + 1,
              })}
            >
              <span
                style={{
                  width: `${((levelIndex * 3 + trialIndex + 1) / (ACUITY_LEVELS.length * 3)) * 100}%`,
                }}
              />
            </div>
          </div>
        )}

        {phase === 'complete' && result && (
          <div className="test-result">
            <div className="result-mark">✓</div>
            <span className="step-tag">{t('vision.complete')}</span>
            <h3>{t('vision.estimated', { eye: t(eyeModeMessageKeys[result.eyeMode]) })}</h3>
            <div className="result-value">{result.snellen}</div>
            <p>
              {result.denominator === null
                ? t('vision.resultLargestMissed')
                : result.denominator > 40
                  ? t('vision.resultBelow40')
                  : t('vision.result40OrBetter')}
            </p>
            <div className="result-facts">
              <span>{t('vision.accuracy', { value: Math.round(result.accuracy * 100) })}</span>
              <span>
                {t('vision.averageDistance', {
                  value:
                    result.averageDistanceCm === null
                      ? '--'
                      : formatNumber(result.averageDistanceCm, {
                          minimumFractionDigits: 1,
                          maximumFractionDigits: 1,
                        }),
                })}
              </span>
              <span>{t(result.demo ? 'vision.demoData' : 'vision.liveData')}</span>
            </div>
            <button className="button button-primary" type="button" onClick={restart}>
              {t('vision.again')}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
