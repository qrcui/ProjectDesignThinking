import { useId } from 'react';
import '../enhancements.css';

export const JOURNEY_STAGE_IDS = [
  'access',
  'consent',
  'calibrate',
  'screen',
  'explain',
  'guide',
] as const;

export type JourneyStageId = (typeof JOURNEY_STAGE_IDS)[number];

export interface JourneyProgressCopy {
  eyebrow: string;
  title: string;
  ariaLabel: string;
  progressLabel: string;
  elapsedLabel: string;
  timeGoalLabel: string;
  completedLabel: string;
  currentLabel: string;
  upcomingLabel: string;
  stageLabels: Record<JourneyStageId, string>;
  formatElapsed?: (elapsedSeconds: number) => string;
}

export interface JourneyProgressProps {
  currentStage: JourneyStageId;
  elapsedSeconds: number;
  copy: JourneyProgressCopy;
  className?: string;
}

function formatClock(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const seconds = Math.floor(totalSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}

export function JourneyProgress({
  currentStage,
  elapsedSeconds,
  copy,
  className = '',
}: JourneyProgressProps) {
  const headingId = useId();
  const currentIndex = Math.max(0, JOURNEY_STAGE_IDS.indexOf(currentStage));
  const safeElapsedSeconds = Number.isFinite(elapsedSeconds)
    ? Math.max(0, Math.floor(elapsedSeconds))
    : 0;
  const elapsedText = copy.formatElapsed?.(safeElapsedSeconds) ?? formatClock(safeElapsedSeconds);
  const progressPercent = (currentIndex / (JOURNEY_STAGE_IDS.length - 1)) * 100;

  return (
    <section
      className={`vg-journey ${className}`.trim()}
      aria-labelledby={headingId}
    >
      <div className="vg-journey__heading">
        <div>
          <span className="vg-kicker">{copy.eyebrow}</span>
          <h2 id={headingId}>{copy.title}</h2>
        </div>
        <div className="vg-journey__timing">
          <span>{copy.elapsedLabel}</span>
          <strong>
            <time dateTime={`PT${safeElapsedSeconds}S`}>{elapsedText}</time>
          </strong>
          <small className={safeElapsedSeconds <= 300 ? 'is-on-target' : ''}>
            {copy.timeGoalLabel}
          </small>
        </div>
      </div>

      <div
        className="vg-journey__track"
        role="progressbar"
        aria-label={copy.progressLabel}
        aria-valuemin={1}
        aria-valuemax={JOURNEY_STAGE_IDS.length}
        aria-valuenow={currentIndex + 1}
        aria-valuetext={`${copy.stageLabels[currentStage]} · ${copy.currentLabel}`}
      >
        <span style={{ width: `${progressPercent}%` }} />
      </div>

      <ol className="vg-journey__stages" aria-label={copy.ariaLabel}>
        {JOURNEY_STAGE_IDS.map((stage, index) => {
          const state = index < currentIndex ? 'completed' : index === currentIndex ? 'current' : 'upcoming';
          const stateLabel =
            state === 'completed'
              ? copy.completedLabel
              : state === 'current'
                ? copy.currentLabel
                : copy.upcomingLabel;

          return (
            <li key={stage} data-state={state} aria-current={state === 'current' ? 'step' : undefined}>
              <span className="vg-journey__index" aria-hidden="true">
                {state === 'completed' ? '✓' : index + 1}
              </span>
              <span className="vg-journey__stage-copy">
                <strong>{copy.stageLabels[stage]}</strong>
                <small>{stateLabel}</small>
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
