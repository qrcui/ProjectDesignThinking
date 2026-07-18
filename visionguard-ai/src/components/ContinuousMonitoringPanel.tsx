import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { STORAGE_KEYS } from '../constants';
import { useI18n } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/messages';
import {
  CONTINUOUS_WINDOW_SECONDS,
  calculateContinuousTrackingCoverage,
  createContinuousBaseline,
  createContinuousMonitoringReport,
  sanitizeContinuousMonitoringReport,
  type ContinuousMonitoringBaseline,
  type ContinuousMonitoringReport,
  type ContinuousReportReason,
} from '../lib/continuousMonitoring';
import { readStorage, writeStorage } from '../lib/storage';
import { detectDesktopMonitoringRuntime } from '../lib/desktopRuntime';
import type { EngineStatus, RecommendationCode, VisionMetrics } from '../types';
import '../continuous-monitoring.css';

type ContinuousModeStatus =
  | 'idle'
  | 'starting'
  | 'active'
  | 'paused'
  | 'interrupted'
  | 'error';

type MonitoringNotice =
  | 'consent-required'
  | 'page-hidden'
  | 'page-frozen'
  | 'page-left'
  | 'stream-ended'
  | 'manual-pause'
  | 'start-error'
  | null;

interface ContinuousMonitoringPanelProps {
  engineStatus: EngineStatus;
  metrics: VisionMetrics;
  cameraConsentReady: boolean;
  persistenceConsent: boolean;
  hasDistanceCalibration: boolean;
  resetSignal: number;
  onRequestConsent: () => void;
  onStartCamera: () => Promise<void>;
  onPauseCamera: () => void;
  onResumeCamera: () => Promise<void>;
  onStopCamera: () => void;
  onExit: () => void;
}

const statusMessageKeys: Record<ContinuousModeStatus, MessageKey> = {
  idle: 'continuous.status.idle',
  starting: 'continuous.status.starting',
  active: 'continuous.status.active',
  paused: 'continuous.status.paused',
  interrupted: 'continuous.status.interrupted',
  error: 'continuous.status.error',
};

const noticeMessageKeys: Record<Exclude<MonitoringNotice, null>, MessageKey> = {
  'consent-required': 'continuous.notice.consentRequired',
  'page-hidden': 'continuous.notice.pageHidden',
  'page-frozen': 'continuous.notice.pageFrozen',
  'page-left': 'continuous.notice.pageLeft',
  'stream-ended': 'continuous.notice.streamEnded',
  'manual-pause': 'continuous.notice.manualPause',
  'start-error': 'continuous.notice.startError',
};

const reasonMessageKeys: Record<ContinuousReportReason, MessageKey> = {
  'window-complete': 'continuous.reason.window',
  stopped: 'continuous.reason.stopped',
  interrupted: 'continuous.reason.interrupted',
  exited: 'continuous.reason.exited',
};

const recommendationMessageKeys: Record<RecommendationCode, MessageKey> = {
  'too-close-now': 'recommendation.tooCloseNow',
  'too-close-session': 'recommendation.tooCloseSession',
  'low-blink': 'recommendation.lowBlink',
  'long-session': 'recommendation.longSession',
  'poor-acuity': 'recommendation.poorAcuity',
  'demo-mode': 'recommendation.demoMode',
  'collecting-data': 'recommendation.collectingData',
  'no-risk-signals': 'recommendation.none',
};

function readStoredReports(): ContinuousMonitoringReport[] {
  const value = readStorage<unknown>(STORAGE_KEYS.continuousReports, []);
  if (!Array.isArray(value)) return [];
  return value
    .map(sanitizeContinuousMonitoringReport)
    .filter((report): report is ContinuousMonitoringReport => report !== null)
    .slice(0, 50);
}

function removeStoredReports(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEYS.continuousReports);
  } catch {
    // Storage may be blocked; the in-memory controls remain available.
  }
}

function formatDuration(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, '0')).join(':');
}

function reportId(): string {
  return globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function ContinuousMonitoringPanel({
  engineStatus,
  metrics,
  cameraConsentReady,
  persistenceConsent,
  hasDistanceCalibration,
  resetSignal,
  onRequestConsent,
  onStartCamera,
  onPauseCamera,
  onResumeCamera,
  onStopCamera,
  onExit,
}: ContinuousMonitoringPanelProps) {
  const { formatDateTime, formatNumber, t } = useI18n();
  const [desktopRuntime] = useState(detectDesktopMonitoringRuntime);
  const [pageHidden, setPageHidden] = useState(
    () => typeof document !== 'undefined' && document.visibilityState !== 'visible',
  );
  const [modeStatus, setModeStatusState] = useState<ContinuousModeStatus>('idle');
  const [notice, setNotice] = useState<MonitoringNotice>(null);
  const [activeSeconds, setActiveSeconds] = useState(0);
  const [windowElapsedSeconds, setWindowElapsedSeconds] = useState(0);
  const [reports, setReports] = useState<ContinuousMonitoringReport[]>(() =>
    persistenceConsent ? readStoredReports() : [],
  );

  const modeStatusRef = useRef(modeStatus);
  const reportsRef = useRef(reports);
  const persistenceConsentRef = useRef(persistenceConsent);
  const engineStatusRef = useRef(engineStatus);
  const latestMetricsRef = useRef(metrics);
  const lastLiveMetricsRef = useRef(metrics);
  const windowBaselineRef = useRef<ContinuousMonitoringBaseline | null>(null);
  const windowStartedAtRef = useRef<string | null>(null);
  const windowActiveMsRef = useRef(0);
  const sessionActiveMsRef = useRef(0);
  const sessionTrackedBaselineRef = useRef(0);
  const activeSegmentStartedAtRef = useRef<number | null>(null);
  const lastTimerTickAtRef = useRef<number | null>(null);
  const pendingFreshStartRef = useRef(false);
  const resumeStartsNewWindowRef = useRef(false);
  const previousResetSignalRef = useRef(resetSignal);

  const setModeStatus = useCallback((next: ContinuousModeStatus) => {
    modeStatusRef.current = next;
    setModeStatusState(next);
  }, []);

  useEffect(() => {
    reportsRef.current = reports;
  }, [reports]);

  useEffect(() => {
    persistenceConsentRef.current = persistenceConsent;
    if (persistenceConsent) {
      writeStorage(STORAGE_KEYS.continuousReports, reportsRef.current);
    } else {
      removeStoredReports();
    }
  }, [persistenceConsent]);

  useEffect(() => {
    if (previousResetSignalRef.current === resetSignal) return;
    previousResetSignalRef.current = resetSignal;
    modeStatusRef.current = 'idle';
    setModeStatusState('idle');
    setNotice(null);
    windowBaselineRef.current = null;
    windowStartedAtRef.current = null;
    windowActiveMsRef.current = 0;
    sessionActiveMsRef.current = 0;
    sessionTrackedBaselineRef.current = 0;
    activeSegmentStartedAtRef.current = null;
    lastTimerTickAtRef.current = null;
    pendingFreshStartRef.current = false;
    setActiveSeconds(0);
    setWindowElapsedSeconds(0);
    reportsRef.current = [];
    setReports([]);
    removeStoredReports();
  }, [resetSignal]);

  useEffect(() => {
    engineStatusRef.current = engineStatus;
    latestMetricsRef.current = metrics;
    if (engineStatus === 'running') lastLiveMetricsRef.current = metrics;
  }, [engineStatus, metrics]);

  useEffect(() => {
    const monitoringActive = modeStatus === 'active' && engineStatus === 'running';
    desktopRuntime.setMonitoringActive(monitoringActive);
    return () => {
      if (monitoringActive) desktopRuntime.setMonitoringActive(false);
    };
  }, [desktopRuntime, engineStatus, modeStatus]);

  const appendReport = useCallback((report: ContinuousMonitoringReport) => {
    const safeReport = sanitizeContinuousMonitoringReport(report);
    if (!safeReport) return;
    const next = [safeReport, ...reportsRef.current].slice(0, 50);
    reportsRef.current = next;
    setReports(next);
    if (persistenceConsentRef.current) {
      writeStorage(STORAGE_KEYS.continuousReports, next);
    }
  }, []);

  const closeActiveSegment = useCallback((now: number) => {
    const segmentStartedAt = activeSegmentStartedAtRef.current;
    if (segmentStartedAt === null) return;
    const elapsed = Math.max(0, now - segmentStartedAt);
    windowActiveMsRef.current += elapsed;
    sessionActiveMsRef.current += elapsed;
    activeSegmentStartedAtRef.current = null;
    lastTimerTickAtRef.current = null;
    setActiveSeconds(Math.floor(sessionActiveMsRef.current / 1000));
    setWindowElapsedSeconds(Math.floor(windowActiveMsRef.current / 1000));
  }, []);

  const beginActiveSegment = useCallback((now: number) => {
    if (activeSegmentStartedAtRef.current === null) {
      activeSegmentStartedAtRef.current = now;
      lastTimerTickAtRef.current = now;
    }
  }, []);

  const beginWindow = useCallback(
    (sourceMetrics: VisionMetrics, now: number) => {
      windowBaselineRef.current = createContinuousBaseline(sourceMetrics);
      windowStartedAtRef.current = new Date(now).toISOString();
      windowActiveMsRef.current = 0;
      setWindowElapsedSeconds(0);
      beginActiveSegment(now);
    },
    [beginActiveSegment],
  );

  const finalizeWindow = useCallback(
    (
      reason: ContinuousReportReason,
      now: number,
      sourceMetrics: VisionMetrics = lastLiveMetricsRef.current,
    ) => {
      closeActiveSegment(now);
      const baseline = windowBaselineRef.current;
      const startedAt = windowStartedAtRef.current;
      if (!baseline || !startedAt) return;
      const elapsedSeconds = Math.max(0, Math.round(windowActiveMsRef.current / 1000));
      const trackedDelta = Math.max(0, sourceMetrics.trackedSeconds - baseline.trackedSeconds);
      if (elapsedSeconds > 0 || trackedDelta > 0) {
        appendReport(
          createContinuousMonitoringReport({
            id: reportId(),
            startedAt,
            endedAt: new Date(now).toISOString(),
            reason,
            activeSeconds: elapsedSeconds,
            baseline,
            metrics: sourceMetrics,
          }),
        );
      }
      windowBaselineRef.current = null;
      windowStartedAtRef.current = null;
      windowActiveMsRef.current = 0;
      setWindowElapsedSeconds(0);
    },
    [appendReport, closeActiveSegment],
  );

  const activateFreshSession = useCallback(
    (sourceMetrics: VisionMetrics) => {
      const now = Date.now();
      sessionActiveMsRef.current = 0;
      sessionTrackedBaselineRef.current = sourceMetrics.trackedSeconds;
      activeSegmentStartedAtRef.current = null;
      setActiveSeconds(0);
      beginWindow(sourceMetrics, now);
      pendingFreshStartRef.current = false;
      resumeStartsNewWindowRef.current = false;
      setNotice(null);
      setModeStatus('active');
    },
    [beginWindow, setModeStatus],
  );

  useEffect(() => {
    if (engineStatus === 'running') {
      if (pendingFreshStartRef.current || modeStatusRef.current === 'starting') {
        activateFreshSession(metrics);
      } else if (
        modeStatusRef.current === 'paused' ||
        modeStatusRef.current === 'interrupted'
      ) {
        const now = Date.now();
        if (resumeStartsNewWindowRef.current || windowBaselineRef.current === null) {
          beginWindow(metrics, now);
        } else {
          beginActiveSegment(now);
        }
        resumeStartsNewWindowRef.current = false;
        setNotice(null);
        setModeStatus('active');
      }
      return;
    }

    if (engineStatus === 'paused' && modeStatusRef.current === 'active') {
      closeActiveSegment(Date.now());
      setNotice('manual-pause');
      setModeStatus('paused');
      return;
    }

    if (
      (engineStatus === 'idle' || engineStatus === 'error' || engineStatus === 'demo') &&
      (modeStatusRef.current === 'active' ||
        modeStatusRef.current === 'paused' ||
        modeStatusRef.current === 'starting')
    ) {
      if (
        modeStatusRef.current === 'starting' &&
        pendingFreshStartRef.current &&
        engineStatus !== 'error'
      ) {
        return;
      }
      if (windowBaselineRef.current) {
        finalizeWindow('interrupted', Date.now(), lastLiveMetricsRef.current);
      }
      pendingFreshStartRef.current = false;
      setNotice('stream-ended');
      setModeStatus(engineStatus === 'error' ? 'error' : 'interrupted');
    }
  }, [
    activateFreshSession,
    beginActiveSegment,
    beginWindow,
    closeActiveSegment,
    engineStatus,
    finalizeWindow,
    metrics,
    setModeStatus,
  ]);

  useEffect(() => {
    if (modeStatus !== 'active') return undefined;
    const tick = () => {
      const now = Date.now();
      const previousTick = lastTimerTickAtRef.current;
      if (previousTick !== null && now - previousTick > 5_000) {
        // A long timer gap means the page was frozen, the device slept, or the
        // browser heavily throttled it. None of that time is claimed as active.
        finalizeWindow('interrupted', previousTick, lastLiveMetricsRef.current);
        resumeStartsNewWindowRef.current = true;
        setNotice('page-frozen');
        setModeStatus('interrupted');
        onPauseCamera();
        return;
      }
      lastTimerTickAtRef.current = now;
      const currentSegment = activeSegmentStartedAtRef.current;
      const currentSegmentMs = currentSegment === null ? 0 : Math.max(0, now - currentSegment);
      const currentWindowMs = windowActiveMsRef.current + currentSegmentMs;
      const currentSessionMs = sessionActiveMsRef.current + currentSegmentMs;
      setWindowElapsedSeconds(Math.floor(currentWindowMs / 1000));
      setActiveSeconds(Math.floor(currentSessionMs / 1000));

      if (currentWindowMs >= CONTINUOUS_WINDOW_SECONDS * 1000) {
        finalizeWindow('window-complete', now, lastLiveMetricsRef.current);
        if (
          modeStatusRef.current === 'active' &&
          engineStatusRef.current === 'running' &&
          (document.visibilityState === 'visible' ||
            desktopRuntime.allowsHiddenWindowMonitoring)
        ) {
          beginWindow(lastLiveMetricsRef.current, now);
        }
      }
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [
    beginWindow,
    desktopRuntime.allowsHiddenWindowMonitoring,
    finalizeWindow,
    modeStatus,
    onPauseCamera,
    setModeStatus,
  ]);

  useEffect(() => {
    const interrupt = (kind: Exclude<MonitoringNotice, null>) => {
      if (modeStatusRef.current !== 'active') return;
      const now = Date.now();
      finalizeWindow('interrupted', now, lastLiveMetricsRef.current);
      resumeStartsNewWindowRef.current = true;
      setNotice(kind);
      setModeStatus('interrupted');
      onPauseCamera();
    };

    const onVisibilityChange = () => {
      const hidden = document.visibilityState !== 'visible';
      setPageHidden(hidden);
      if (hidden) {
        if (!desktopRuntime.allowsHiddenWindowMonitoring) {
          interrupt('page-hidden');
        }
      } else if (
        modeStatusRef.current === 'interrupted' &&
        engineStatusRef.current === 'running'
      ) {
        onPauseCamera();
      }
    };
    const onFreeze = () => interrupt('page-frozen');
    const onPageHide = () => interrupt('page-left');

    document.addEventListener('visibilitychange', onVisibilityChange);
    document.addEventListener('freeze', onFreeze as EventListener);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      document.removeEventListener('freeze', onFreeze as EventListener);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, [
    desktopRuntime.allowsHiddenWindowMonitoring,
    finalizeWindow,
    onPauseCamera,
    setModeStatus,
  ]);

  const start = async () => {
    if (
      document.visibilityState !== 'visible' &&
      !desktopRuntime.allowsHiddenWindowMonitoring
    ) {
      setNotice('page-hidden');
      return;
    }
    if (!cameraConsentReady) {
      setNotice('consent-required');
      onRequestConsent();
      return;
    }

    pendingFreshStartRef.current = true;
    setNotice(null);
    setModeStatus('starting');
    if (engineStatus === 'running') {
      activateFreshSession(metrics);
      return;
    }
    try {
      await onStartCamera();
      if (engineStatusRef.current === 'error') {
        pendingFreshStartRef.current = false;
        setNotice('start-error');
        setModeStatus('error');
      }
    } catch {
      pendingFreshStartRef.current = false;
      setNotice('start-error');
      setModeStatus('error');
    }
  };

  const pause = () => {
    if (modeStatusRef.current !== 'active') return;
    closeActiveSegment(Date.now());
    setNotice('manual-pause');
    setModeStatus('paused');
    onPauseCamera();
  };

  const resume = async () => {
    if (
      document.visibilityState !== 'visible' &&
      !desktopRuntime.allowsHiddenWindowMonitoring
    ) {
      setNotice('page-hidden');
      return;
    }
    resumeStartsNewWindowRef.current = modeStatusRef.current === 'interrupted';
    try {
      await onResumeCamera();
    } catch {
      setNotice('start-error');
      setModeStatus('error');
    }
  };

  const stop = () => {
    const now = Date.now();
    if (windowBaselineRef.current) {
      finalizeWindow('stopped', now, lastLiveMetricsRef.current);
    }
    pendingFreshStartRef.current = false;
    setModeStatus('idle');
    setNotice(null);
    onStopCamera();
  };

  const exit = () => {
    const now = Date.now();
    if (windowBaselineRef.current) {
      finalizeWindow('exited', now, lastLiveMetricsRef.current);
    }
    pendingFreshStartRef.current = false;
    setModeStatus('idle');
    setNotice(null);
    onExit();
  };

  const clearReports = () => {
    if (!window.confirm(t('continuous.clearConfirm'))) return;
    reportsRef.current = [];
    setReports([]);
    removeStoredReports();
  };

  const windowRemainingSeconds = Math.max(
    0,
    CONTINUOUS_WINDOW_SECONDS - windowElapsedSeconds,
  );
  const currentCoverage =
    calculateContinuousTrackingCoverage(
      metrics.trackedSeconds,
      sessionTrackedBaselineRef.current,
      activeSeconds,
    );
  const canPause = modeStatus === 'active';
  const canResume =
    (modeStatus === 'paused' || modeStatus === 'interrupted') &&
    engineStatus === 'paused';
  const canStop = modeStatus !== 'idle';
  const startDisabled =
    modeStatus === 'starting' ||
    modeStatus === 'active' ||
    modeStatus === 'paused' ||
    engineStatus === 'requesting-camera' ||
    engineStatus === 'loading-model';

  const reportCountLabel = useMemo(
    () => t('continuous.reportCount', { count: reports.length }),
    [reports.length, t],
  );
  const desktopBackgroundActive =
    desktopRuntime.allowsHiddenWindowMonitoring &&
    pageHidden &&
    modeStatus === 'active';
  const visibleStatusLabel = desktopBackgroundActive
    ? t('continuous.status.activeDesktopBackground')
    : t(statusMessageKeys[modeStatus]);

  return (
    <section
      className="continuous-monitoring panel"
      id="continuous-monitoring"
      aria-labelledby="continuous-monitoring-title"
      data-status={modeStatus}
      data-runtime={desktopRuntime.kind}
    >
      <div className="continuous-monitoring__heading">
        <div>
          <span className="eyebrow">{t('continuous.eyebrow')}</span>
          <h2 id="continuous-monitoring-title">{t('continuous.title')}</h2>
          <p>{t('continuous.intro')}</p>
        </div>
        <span className={`status-pill status-${modeStatus}`} role="status" aria-live="polite">
          <span className="status-dot" />
          {visibleStatusLabel}
        </span>
      </div>

      <aside className="continuous-monitoring__boundary" role="note">
        <strong>
          {t(
            desktopRuntime.allowsHiddenWindowMonitoring
              ? 'continuous.boundaryTitleDesktop'
              : 'continuous.boundaryTitle',
          )}
        </strong>
        <span>
          {t(
            desktopRuntime.allowsHiddenWindowMonitoring
              ? 'continuous.boundaryBodyDesktop'
              : 'continuous.boundaryBody',
          )}
        </span>
      </aside>

      {notice && (
        <div className="inline-alert continuous-monitoring__notice" role="alert">
          <strong>{t('continuous.interruptionTitle')}</strong>
          <span>{t(noticeMessageKeys[notice])}</span>
        </div>
      )}

      <div className="continuous-monitoring__stats" aria-label={t('continuous.statsAria')}>
        <article>
          <span>{t('continuous.activeDuration')}</span>
          <strong>{formatDuration(activeSeconds)}</strong>
        </article>
        <article>
          <span>{t('continuous.windowRemaining')}</span>
          <strong>{formatDuration(windowRemainingSeconds)}</strong>
        </article>
        <article>
          <span>{t('continuous.trackingCoverage')}</span>
          <strong>{Math.round(currentCoverage * 100)}%</strong>
        </article>
        <article>
          <span>{t('continuous.distanceReadiness')}</span>
          <strong>
            {t(
              hasDistanceCalibration
                ? 'continuous.distanceReady'
                : 'continuous.distanceNeedsCalibration',
            )}
          </strong>
        </article>
      </div>

      <div className="continuous-monitoring__controls" aria-label={t('continuous.controlsAria')}>
        <button
          className="button button-primary"
          type="button"
          disabled={startDisabled}
          onClick={() => void start()}
        >
          {t('continuous.start')}
        </button>
        {canPause && (
          <button className="button button-secondary" type="button" onClick={pause}>
            {t('continuous.pause')}
          </button>
        )}
        {(modeStatus === 'paused' || modeStatus === 'interrupted') && (
          <button
            className="button button-primary"
            type="button"
            disabled={!canResume}
            onClick={() => void resume()}
          >
            {t('continuous.resume')}
          </button>
        )}
        <button
          className="button button-ghost"
          type="button"
          disabled={!canStop}
          onClick={stop}
        >
          {t('continuous.stop')}
        </button>
        <button
          className="text-button danger"
          type="button"
          disabled={!canStop}
          onClick={exit}
        >
          {t('continuous.exit')}
        </button>
      </div>

      <p className="continuous-monitoring__privacy">
        {t(
          persistenceConsent
            ? 'continuous.persistenceOn'
            : 'continuous.persistenceOff',
        )}
      </p>

      <div className="continuous-monitoring__reports">
        <div className="continuous-monitoring__reports-heading">
          <div>
            <h3>{t('continuous.reportsTitle')}</h3>
            <span>{reportCountLabel}</span>
          </div>
          <button
            className="text-button danger"
            type="button"
            disabled={reports.length === 0}
            onClick={clearReports}
          >
            {t('continuous.clearReports')}
          </button>
        </div>

        {reports.length === 0 ? (
          <p className="continuous-monitoring__empty">{t('continuous.reportsEmpty')}</p>
        ) : (
          <div className="continuous-monitoring__report-list">
            {reports.slice(0, 8).map((report) => (
              <article key={report.id} className="continuous-monitoring__report">
                <header>
                  <strong>{t(reasonMessageKeys[report.reason])}</strong>
                  <time dateTime={report.endedAt}>
                    {formatDateTime(report.endedAt, {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </time>
                </header>
                <dl>
                  <div>
                    <dt>{t('continuous.reportActive')}</dt>
                    <dd>{formatDuration(report.activeSeconds)}</dd>
                  </div>
                  <div>
                    <dt>{t('continuous.reportTracked')}</dt>
                    <dd>{formatDuration(report.trackedSeconds)}</dd>
                  </div>
                  <div>
                    <dt>{t('continuous.reportBlink')}</dt>
                    <dd>
                      {report.blinkRatePerMinute === null
                        ? t('explanation.unavailable')
                        : t('metrics.blinksPerMinute', {
                            value: formatNumber(report.blinkRatePerMinute, {
                              maximumFractionDigits: 1,
                            }),
                          })}
                    </dd>
                  </div>
                  <div>
                    <dt>{t('continuous.reportDistance')}</dt>
                    <dd>
                      {report.distanceCm === null
                        ? t('explanation.unavailable')
                        : `${formatNumber(report.distanceCm, {
                            maximumFractionDigits: 1,
                          })} cm`}
                    </dd>
                  </div>
                  <div>
                    <dt>{t('continuous.reportFatigue')}</dt>
                    <dd>{report.fatigueScore}/100</dd>
                  </div>
                </dl>
                <div className="continuous-monitoring__recommendations">
                  <strong>{t('continuous.nextSteps')}</strong>
                  <ul>
                    {report.recommendations.map((code) => (
                      <li key={code}>{t(recommendationMessageKeys[code])}</li>
                    ))}
                  </ul>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
