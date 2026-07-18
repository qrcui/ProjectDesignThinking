import type { VisionMetrics, VisionTestResult } from '../types';
import { useI18n } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/messages';
import type { FatigueBand, RecommendationCode } from '../types';
import { buildRecommendations } from '../lib/fatigue';

interface MetricsPanelProps {
  metrics: VisionMetrics;
  latestResult: VisionTestResult | null;
  hasDistanceCalibration: boolean;
  demoMode: boolean;
  onResetSession: () => void;
}

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, '0');
  const remainder = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${minutes}:${remainder}`;
}

const fatigueMessageKeys: Record<FatigueBand, MessageKey> = {
  low: 'metrics.fatigue.low',
  moderate: 'metrics.fatigue.moderate',
  high: 'metrics.fatigue.high',
  collecting: 'metrics.fatigue.collecting',
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

export function MetricsPanel({
  metrics,
  latestResult,
  hasDistanceCalibration,
  demoMode,
  onResetSession,
}: MetricsPanelProps) {
  const { formatNumber, plural, t } = useI18n();
  const recommendations = buildRecommendations(metrics, latestResult, demoMode);
  const distanceLabel = !hasDistanceCalibration
    ? t('metrics.calibrationRequired')
    : metrics.distanceCm === null
      ? '--'
      : `${formatNumber(metrics.distanceCm, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} cm`;
  const blinkLabel =
    metrics.blinkRatePerMinute === null
      ? t('metrics.collecting')
      : t('metrics.blinksPerMinute', {
          value: formatNumber(metrics.blinkRatePerMinute, {
            minimumFractionDigits: 1,
            maximumFractionDigits: 1,
          }),
        });

  return (
    <section className="panel metrics-panel" aria-labelledby="metrics-title">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">{t('metrics.eyebrow')}</span>
          <h2 id="metrics-title">{t('metrics.title')}</h2>
        </div>
        <button className="text-button" type="button" onClick={onResetSession}>
          {t('metrics.reset')}
        </button>
      </div>

      <div className="metrics-grid">
        <article className="metric-card">
          <span className="metric-label">{t('metrics.distance')}</span>
          <strong>{distanceLabel}</strong>
          <span className="metric-caption">
            {t(metrics.distanceCm !== null && metrics.distanceCm < 45 ? 'metrics.tooClose' : 'metrics.distanceTarget')}
          </span>
        </article>
        <article className="metric-card">
          <span className="metric-label">{t('metrics.blinkRate')}</span>
          <strong>{blinkLabel}</strong>
          <span className="metric-caption">
            {plural(
              metrics.blinkCount,
              'metrics.blinksDetectedOne',
              'metrics.blinksDetectedOther',
            )}
          </span>
        </article>
        <article className="metric-card">
          <span className="metric-label">{t('metrics.sessionDuration')}</span>
          <strong>{formatDuration(metrics.sessionSeconds)}</strong>
          <span className="metric-caption">
            {t('metrics.trackedFor', { value: formatDuration(metrics.trackedSeconds) })}
          </span>
        </article>
        <article className="metric-card">
          <span className="metric-label">{t('metrics.timeTooClose')}</span>
          <strong>{Math.round(metrics.tooCloseRatio * 100)}%</strong>
          <span className="metric-caption">{t('metrics.below45')}</span>
        </article>
      </div>

      <div className="fatigue-card">
        <div className="fatigue-score-block">
          <div className="score-ring" style={{ '--score': metrics.fatigueScore } as React.CSSProperties}>
            <span>{metrics.fatigueScore}</span>
            <small>/100</small>
          </div>
          <div>
            <span className="metric-label">{t('metrics.fatigueIndicator')}</span>
            <h3>{t(fatigueMessageKeys[metrics.fatigueBand])}</h3>
            <p>{t('metrics.fatigueBody')}</p>
          </div>
        </div>
        <div className="score-track" aria-label={t('metrics.fatigueAria', { score: metrics.fatigueScore })}>
          <span style={{ width: `${metrics.fatigueScore}%` }} />
        </div>
      </div>

      <div className="recommendation-box">
        <h3>{t('metrics.recommendations')}</h3>
        <ul>
          {recommendations.map((recommendation) => (
            <li key={recommendation}>{t(recommendationMessageKeys[recommendation])}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}
