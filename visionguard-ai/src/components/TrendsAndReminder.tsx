import { useEffect, useId, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { EyeMode, VisionTestResult } from '../types';
import {
  createRetestReminderDueAt,
  getReminderCountdown,
  readReminderTimestamp,
  removeReminderTimestamp,
  writeReminderTimestamp,
  type ReminderTimestampStorage,
} from '../lib/reminder';
import '../trends-reminder.css';

const EYE_MODES: readonly EyeMode[] = ['binocular', 'left', 'right'];
const CHART_HEIGHT = 248;
const CHART_PADDING_X = 42;
const CHART_PADDING_TOP = 24;
const CHART_PADDING_BOTTOM = 30;
const BEST_CHART_DENOMINATOR = 20;
const BELOW_CHART_DENOMINATOR = 250;

export interface TrendPoint {
  id: string;
  completedAt: string;
  eyeMode: EyeMode;
  snellen: string;
  denominator: number | null;
  sourceIndex: number;
}

export type TrendChange = 'improved' | 'worsened' | 'unchanged';

export interface TrendComparison {
  latest: TrendPoint;
  previous: TrendPoint | null;
  change: TrendChange | null;
}

export interface TrendModel {
  points: TrendPoint[];
  excludedDemoCount: number;
  comparison: TrendComparison | null;
}

export interface TrendChartSummaryCopyData {
  count: number;
  firstDate: string;
  lastDate: string;
  excludedDemoCount: number;
}

export interface TrendPointCopyData {
  position: number;
  date: string;
  eye: string;
  snellen: string;
}

export interface TrendChangeCopyData {
  previous: string;
  latest: string;
}

export interface ReminderCountdownCopyData {
  minutes: number;
  seconds: number;
}

/** All visible and assistive UI language is supplied here by the app's locale layer. */
export interface TrendsAndReminderCopy {
  eyebrow: string;
  title: string;
  description: string;
  formatDateTime: (value: string | number) => string;
  trend: {
    title: string;
    realResultsOnly: string;
    empty: string;
    singleResult: string;
    resultCount: (count: number) => string;
    demoExcluded: (count: number) => string;
    chartAriaLabel: (count: number) => string;
    chartSummary: (data: TrendChartSummaryCopyData) => string;
    chartScaleHint: string;
    accessibleDataTitle: string;
    pointLabel: (data: TrendPointCopyData) => string;
    eyeLabels: Record<EyeMode, string>;
    comparisonTitle: string;
    comparisonScope: (eye: string) => string;
    latestLabel: string;
    previousLabel: string;
    changeLabel: string;
    noPrevious: string;
    noComparison: string;
    improved: (data: TrendChangeCopyData) => string;
    worsened: (data: TrendChangeCopyData) => string;
    unchanged: (data: TrendChangeCopyData) => string;
  };
  reminder: {
    title: string;
    description: string;
    persisted: string;
    memoryOnly: string;
    inactive: string;
    set: string;
    reset: string;
    cancel: string;
    scheduledFor: (date: string) => string;
    countdown: (data: ReminderCountdownCopyData) => string;
    due: string;
  };
}

export interface TrendsAndReminderProps {
  results: readonly VisionTestResult[];
  copy: TrendsAndReminderCopy;
  persistenceConsent: boolean;
  /** Omit for component-owned memory; pass null or a timestamp for controlled state. */
  reminderDueAt?: number | null;
  onReminderChange?: (dueAt: number | null) => void;
  reminderStorage?: ReminderTimestampStorage | null;
  reminderStorageKey?: string;
  now?: () => number;
  className?: string;
}

function parsedTime(value: string): number {
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : Number.MAX_SAFE_INTEGER;
}

function compareAcuity(latest: TrendPoint, previous: TrendPoint): TrendChange {
  const latestValue = latest.denominator ?? Number.POSITIVE_INFINITY;
  const previousValue = previous.denominator ?? Number.POSITIVE_INFINITY;
  if (latestValue < previousValue) return 'improved';
  if (latestValue > previousValue) return 'worsened';
  return 'unchanged';
}

export function buildTrendModel(results: readonly VisionTestResult[]): TrendModel {
  const points = results
    .map((result, sourceIndex) => ({ result, sourceIndex }))
    .filter(({ result }) => !result.demo)
    .sort((left, right) => {
      const timeDifference = parsedTime(left.result.completedAt) - parsedTime(right.result.completedAt);
      return timeDifference === 0 ? left.sourceIndex - right.sourceIndex : timeDifference;
    })
    .map(({ result, sourceIndex }) => ({
      id: result.id,
      completedAt: result.completedAt,
      eyeMode: result.eyeMode,
      snellen: result.snellen,
      denominator: result.denominator,
      sourceIndex,
    }));

  const latest = points.at(-1) ?? null;
  let comparison: TrendComparison | null = null;
  if (latest) {
    const previous = points
      .slice(0, -1)
      .reverse()
      .find((point) => point.eyeMode === latest.eyeMode) ?? null;
    comparison = {
      latest,
      previous,
      change: previous ? compareAcuity(latest, previous) : null,
    };
  }

  return {
    points,
    excludedDemoCount: results.length - points.length,
    comparison,
  };
}

function chartValue(point: TrendPoint): number {
  return Math.min(
    BELOW_CHART_DENOMINATOR,
    Math.max(BEST_CHART_DENOMINATOR, point.denominator ?? BELOW_CHART_DENOMINATOR),
  );
}

function chartY(point: TrendPoint): number {
  const usableHeight = CHART_HEIGHT - CHART_PADDING_TOP - CHART_PADDING_BOTTOM;
  const lower = Math.log10(BEST_CHART_DENOMINATOR);
  const range = Math.log10(BELOW_CHART_DENOMINATOR) - lower;
  const position = (Math.log10(chartValue(point)) - lower) / range;
  return CHART_PADDING_TOP + position * usableHeight;
}

function trendChangeText(comparison: TrendComparison, copy: TrendsAndReminderCopy): string {
  if (!comparison.previous || !comparison.change) return copy.trend.noComparison;
  const data = { previous: comparison.previous.snellen, latest: comparison.latest.snellen };
  if (comparison.change === 'improved') return copy.trend.improved(data);
  if (comparison.change === 'worsened') return copy.trend.worsened(data);
  return copy.trend.unchanged(data);
}

function markerFor(
  point: TrendPoint,
  x: number,
  y: number,
  label: string,
) {
  if (point.eyeMode === 'left') {
    return (
      <rect className="vg-trend-marker" data-eye={point.eyeMode} x={x - 5} y={y - 5} width="10" height="10">
        <title>{label}</title>
      </rect>
    );
  }
  if (point.eyeMode === 'right') {
    return (
      <path
        className="vg-trend-marker"
        data-eye={point.eyeMode}
        d={`M ${x} ${y - 6} L ${x + 6} ${y} L ${x} ${y + 6} L ${x - 6} ${y} Z`}
      >
        <title>{label}</title>
      </path>
    );
  }
  return (
    <circle className="vg-trend-marker" data-eye={point.eyeMode} cx={x} cy={y} r="5.5">
      <title>{label}</title>
    </circle>
  );
}

export function TrendsAndReminder({
  results,
  copy,
  persistenceConsent,
  reminderDueAt,
  onReminderChange,
  reminderStorage,
  reminderStorageKey,
  now,
  className,
}: TrendsAndReminderProps) {
  const model = buildTrendModel(results);
  const isControlled = reminderDueAt !== undefined;
  const nowRef = useRef(now);
  nowRef.current = now;
  const currentTime = () => nowRef.current?.() ?? Date.now();
  const [memoryDueAt, setMemoryDueAt] = useState<number | null>(() =>
    isControlled
      ? null
      : readReminderTimestamp({
          persistenceConsent,
          storage: reminderStorage,
          storageKey: reminderStorageKey,
        }),
  );
  const activeDueAt = isControlled ? reminderDueAt : memoryDueAt;
  const [clock, setClock] = useState(currentTime);
  const chartTitleId = useId();
  const chartDescriptionId = useId();

  useEffect(() => {
    const persistence = { storage: reminderStorage, storageKey: reminderStorageKey };
    if (!persistenceConsent) {
      removeReminderTimestamp(persistence);
    } else if (activeDueAt === null) {
      removeReminderTimestamp(persistence);
    } else {
      writeReminderTimestamp(activeDueAt, { ...persistence, persistenceConsent: true });
    }
  }, [activeDueAt, persistenceConsent, reminderStorage, reminderStorageKey]);

  useEffect(() => {
    setClock(currentTime());
    if (activeDueAt === null) return undefined;

    const interval = window.setInterval(() => {
      const next = currentTime();
      setClock(next);
      if (next >= activeDueAt) window.clearInterval(interval);
    }, 1000);

    return () => window.clearInterval(interval);
  }, [activeDueAt]);

  const updateReminder = (next: number | null) => {
    if (!isControlled) setMemoryDueAt(next);
    onReminderChange?.(next);
  };

  const setReminder = () => {
    const timestamp = currentTime();
    setClock(timestamp);
    updateReminder(createRetestReminderDueAt(timestamp));
  };

  const countdown = activeDueAt === null ? null : getReminderCountdown(activeDueAt, clock);
  const chartWidth = Math.max(680, model.points.length * 48);
  const usableWidth = chartWidth - CHART_PADDING_X * 2;
  const positionedPoints = model.points.map((point, index) => ({
    point,
    x:
      model.points.length === 1
        ? chartWidth / 2
        : CHART_PADDING_X + (index / (model.points.length - 1)) * usableWidth,
    y: chartY(point),
  }));
  const presentEyeModes = EYE_MODES.filter((mode) =>
    model.points.some((point) => point.eyeMode === mode),
  );
  const classNames = ['vg-trends-reminder', className].filter(Boolean).join(' ');
  const chartStyle = { '--vg-trend-chart-width': `${chartWidth}px` } as CSSProperties;

  return (
    <section className={classNames} aria-labelledby={`${chartTitleId}-section-title`}>
      <div className="vg-trends-reminder__heading">
        <div>
          <span className="vg-trends-reminder__eyebrow">{copy.eyebrow}</span>
          <h2 id={`${chartTitleId}-section-title`}>{copy.title}</h2>
        </div>
        <p>{copy.description}</p>
      </div>

      <div className="vg-trends-reminder__grid">
        <article className="vg-trend-card">
          <header className="vg-trend-card__heading">
            <div>
              <h3>{copy.trend.title}</h3>
              <p>{copy.trend.realResultsOnly}</p>
            </div>
            <span className="vg-trend-count">{copy.trend.resultCount(model.points.length)}</span>
          </header>

          {model.excludedDemoCount > 0 && (
            <p className="vg-trend-demo-note" role="note">
              {copy.trend.demoExcluded(model.excludedDemoCount)}
            </p>
          )}

          {model.points.length === 0 ? (
            <p className="vg-trend-empty">{copy.trend.empty}</p>
          ) : (
            <>
              {model.points.length === 1 && <p className="vg-trend-single">{copy.trend.singleResult}</p>}
              <div className="vg-trend-chart-wrap" style={chartStyle}>
                <svg
                  className="vg-trend-chart"
                  viewBox={`0 0 ${chartWidth} ${CHART_HEIGHT}`}
                  role="img"
                  aria-labelledby={`${chartTitleId} ${chartDescriptionId}`}
                >
                  <title id={chartTitleId}>{copy.trend.chartAriaLabel(model.points.length)}</title>
                  <desc id={chartDescriptionId}>
                    {copy.trend.chartSummary({
                      count: model.points.length,
                      firstDate: copy.formatDateTime(model.points[0].completedAt),
                      lastDate: copy.formatDateTime(model.points.at(-1)?.completedAt ?? model.points[0].completedAt),
                      excludedDemoCount: model.excludedDemoCount,
                    })}
                  </desc>
                  {[0, 0.25, 0.5, 0.75, 1].map((fraction) => {
                    const y = CHART_PADDING_TOP + fraction * (CHART_HEIGHT - CHART_PADDING_TOP - CHART_PADDING_BOTTOM);
                    return <line className="vg-trend-gridline" key={fraction} x1="0" x2={chartWidth} y1={y} y2={y} />;
                  })}
                  {presentEyeModes.map((mode) => {
                    const modePoints = positionedPoints.filter(({ point }) => point.eyeMode === mode);
                    return modePoints.length > 1 ? (
                      <polyline
                        className="vg-trend-line"
                        data-eye={mode}
                        key={mode}
                        points={modePoints.map(({ x, y }) => `${x},${y}`).join(' ')}
                      />
                    ) : null;
                  })}
                  {positionedPoints.map(({ point, x, y }, index) => {
                    const pointLabel = copy.trend.pointLabel({
                      position: index + 1,
                      date: copy.formatDateTime(point.completedAt),
                      eye: copy.trend.eyeLabels[point.eyeMode],
                      snellen: point.snellen,
                    });
                    return <g key={`${point.id}-${point.sourceIndex}`}>{markerFor(point, x, y, pointLabel)}</g>;
                  })}
                </svg>
              </div>
              <div className="vg-trend-legend">
                <span>{copy.trend.chartScaleHint}</span>
                {presentEyeModes.map((mode) => (
                  <span className="vg-trend-legend__eye" data-eye={mode} key={mode}>
                    <i aria-hidden="true" />
                    {copy.trend.eyeLabels[mode]}
                  </span>
                ))}
              </div>
              <div className="vg-trend-sr-only">
                <h4>{copy.trend.accessibleDataTitle}</h4>
                <ol>
                  {model.points.map((point, index) => (
                    <li key={`${point.id}-${point.sourceIndex}`}>
                      {copy.trend.pointLabel({
                        position: index + 1,
                        date: copy.formatDateTime(point.completedAt),
                        eye: copy.trend.eyeLabels[point.eyeMode],
                        snellen: point.snellen,
                      })}
                    </li>
                  ))}
                </ol>
              </div>
            </>
          )}

          <div className="vg-trend-comparison">
            <div>
              <h3>{copy.trend.comparisonTitle}</h3>
              {model.comparison && (
                <p>{copy.trend.comparisonScope(copy.trend.eyeLabels[model.comparison.latest.eyeMode])}</p>
              )}
            </div>
            {model.comparison ? (
              <dl>
                <div>
                  <dt>{copy.trend.latestLabel}</dt>
                  <dd>
                    <strong>{model.comparison.latest.snellen}</strong>
                    <span>{copy.formatDateTime(model.comparison.latest.completedAt)}</span>
                  </dd>
                </div>
                <div>
                  <dt>{copy.trend.previousLabel}</dt>
                  <dd>
                    {model.comparison.previous ? (
                      <>
                        <strong>{model.comparison.previous.snellen}</strong>
                        <span>{copy.formatDateTime(model.comparison.previous.completedAt)}</span>
                      </>
                    ) : (
                      <strong>{copy.trend.noPrevious}</strong>
                    )}
                  </dd>
                </div>
                <div data-change={model.comparison.change ?? 'none'}>
                  <dt>{copy.trend.changeLabel}</dt>
                  <dd><strong>{trendChangeText(model.comparison, copy)}</strong></dd>
                </div>
              </dl>
            ) : (
              <p className="vg-trend-empty">{copy.trend.noComparison}</p>
            )}
          </div>
        </article>

        <article className="vg-reminder-card">
          <div>
            <h3>{copy.reminder.title}</h3>
            <p>{copy.reminder.description}</p>
          </div>
          <span className="vg-reminder-privacy" data-persisted={persistenceConsent}>
            <i aria-hidden="true" />
            {persistenceConsent ? copy.reminder.persisted : copy.reminder.memoryOnly}
          </span>

          <div className="vg-reminder-status" aria-live="polite" aria-atomic="true">
            {activeDueAt === null || countdown === null ? (
              <strong>{copy.reminder.inactive}</strong>
            ) : (
              <>
                <span>{copy.reminder.scheduledFor(copy.formatDateTime(activeDueAt))}</span>
                <strong data-due={countdown.isDue}>
                  {countdown.isDue
                    ? copy.reminder.due
                    : copy.reminder.countdown({ minutes: countdown.minutes, seconds: countdown.seconds })}
                </strong>
              </>
            )}
          </div>

          <div className="vg-reminder-actions">
            <button className="vg-reminder-primary" type="button" onClick={setReminder}>
              {activeDueAt === null ? copy.reminder.set : copy.reminder.reset}
            </button>
            {activeDueAt !== null && (
              <button className="vg-reminder-secondary" type="button" onClick={() => updateReminder(null)}>
                {copy.reminder.cancel}
              </button>
            )}
          </div>
        </article>
      </div>
    </section>
  );
}
