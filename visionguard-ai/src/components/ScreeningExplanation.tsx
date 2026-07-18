import { useEffect, useId, useMemo, useState } from 'react';
import type {
  RiskAssessment,
  RiskBand,
  RiskConfidence,
  RiskIndicatorCode,
  RiskLimitationCode,
  RiskNextStepCode,
} from '../lib/risk';
import type { VisionMetrics, VisionTestResult } from '../types';
import '../screening-explanation.css';

export const RETEST_DELAY_MINUTES = 20 as const;

export type ScreeningMetricState = 'flagged' | 'notFlagged' | 'unavailable';

export type ScreeningExplanationActionTarget =
  | {
      href: string;
      onActivate?: never;
      openInNewTab?: boolean;
    }
  | {
      href?: never;
      onActivate: () => void;
      openInNewTab?: never;
    };

/**
 * All visible and assistive copy used by the explanation. Semantic result codes
 * stay in the domain layer and are translated only through these exhaustive maps.
 */
export interface ScreeningExplanationCopy {
  eyebrow: string;
  title: string;
  introduction: string;
  blocksAriaLabel: string;
  resultTitle: string;
  mainIndicatorsTitle: string;
  confidenceAndLimitationsTitle: string;
  recommendedNextStepTitle: string;
  riskBandLabel: string;
  riskBandLabels: Record<RiskBand, string>;
  riskBandDescriptions: Record<RiskBand, string>;
  screeningNotDiagnosisNotice: string;
  professionalCareCue: string;
  demoWarningTitle: string;
  demoWarningBody: string;
  metricCardsAriaLabel: string;
  acuityMetricTitle: string;
  blinkMetricTitle: string;
  distanceMetricTitle: string;
  unavailableValue: string;
  blinkRateUnit: string;
  distanceUnit: string;
  metricStateLabels: Record<ScreeningMetricState, string>;
  indicatorListLabel: string;
  indicatorLabels: Record<RiskIndicatorCode, string>;
  noIndicators: string;
  confidenceLabel: string;
  confidenceLabels: Record<RiskConfidence, string>;
  limitationsLabel: string;
  limitationLabels: Record<RiskLimitationCode, string>;
  noLimitations: string;
  nextStepLabel: string;
  nextStepLabels: Record<RiskNextStepCode, string>;
  actionGroupAriaLabel: string;
  scheduleRetestLabel: string;
  scheduleRetestHint: string;
  retestActionStatus: string;
  careReferralActionLabel: string;
  careReferralHint: string;
  summaryActionsAriaLabel: string;
  copySummaryLabel: string;
  shareSummaryLabel: string;
  printSummaryLabel: string;
  summaryTitle: string;
  summaryRiskLabel: string;
  summaryAcuityLabel: string;
  summaryBlinkLabel: string;
  summaryDistanceLabel: string;
  summaryIndicatorsLabel: string;
  summaryConfidenceLabel: string;
  summaryLimitationsLabel: string;
  summaryNextStepLabel: string;
  summaryLabelSeparator: string;
  summaryListSeparator: string;
  summaryCopiedStatus: string;
  summaryCopyFailedStatus: string;
  summarySharedStatus: string;
  summaryPrintStatus: string;
}

export interface ScreeningExplanationProps {
  assessment: RiskAssessment;
  latestResult: VisionTestResult | null;
  metrics: VisionMetrics;
  copy: ScreeningExplanationCopy;
  onScheduleRetest: (delayMinutes: typeof RETEST_DELAY_MINUTES) => void;
  careReferralAction: ScreeningExplanationActionTarget;
  className?: string;
}

interface MetricCard {
  key: 'acuity' | 'blink' | 'distance';
  title: string;
  value: string;
  state: ScreeningMetricState;
}

type StatusMessageCode =
  | 'summaryCopied'
  | 'summaryCopyFailed'
  | 'summaryShared'
  | 'summaryPrint'
  | 'retestScheduled';

function finiteValue(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function formatNumber(value: number, maximumFractionDigits: number): string {
  const locale =
    typeof document === 'undefined' ? undefined : document.documentElement.lang || undefined;
  return new Intl.NumberFormat(locale, { maximumFractionDigits }).format(value);
}

async function writeToClipboard(value: string): Promise<boolean> {
  if (!value || typeof navigator === 'undefined') return false;

  let textArea: HTMLTextAreaElement | null = null;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }

    if (typeof document === 'undefined') return false;
    textArea = document.createElement('textarea');
    textArea.value = value;
    textArea.setAttribute('readonly', '');
    textArea.style.position = 'fixed';
    textArea.style.opacity = '0';
    document.body.appendChild(textArea);
    textArea.select();
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    textArea?.remove();
  }
}

export function ScreeningExplanation({
  assessment,
  latestResult,
  metrics,
  copy,
  onScheduleRetest,
  careReferralAction,
  className = '',
}: ScreeningExplanationProps) {
  const headingId = useId();
  const introductionId = useId();
  const statusId = useId();
  const [statusMessageCode, setStatusMessageCode] = useState<StatusMessageCode | null>(null);
  const [printing, setPrinting] = useState(false);

  const hasIndicator = (code: RiskIndicatorCode) =>
    assessment.mainIndicators.includes(code);
  const distanceValue = finiteValue(latestResult?.averageDistanceCm)
    ? latestResult.averageDistanceCm
    : metrics.distanceCm;
  const acuityValue = latestResult?.snellen ?? copy.unavailableValue;
  const blinkValue = finiteValue(metrics.blinkRatePerMinute)
    ? `${formatNumber(metrics.blinkRatePerMinute, 1)} ${copy.blinkRateUnit}`
    : copy.unavailableValue;
  const formattedDistanceValue = finiteValue(distanceValue)
    ? `${formatNumber(distanceValue, 1)} ${copy.distanceUnit}`
    : copy.unavailableValue;
  const statusMessages: Record<StatusMessageCode, string> = {
    summaryCopied: copy.summaryCopiedStatus,
    summaryCopyFailed: copy.summaryCopyFailedStatus,
    summaryShared: copy.summarySharedStatus,
    summaryPrint: copy.summaryPrintStatus,
    retestScheduled: copy.retestActionStatus,
  };
  const statusMessage = statusMessageCode === null ? '' : statusMessages[statusMessageCode];

  const metricCards: MetricCard[] = [
    {
      key: 'acuity',
      title: copy.acuityMetricTitle,
      value: acuityValue,
      state:
        latestResult === null
          ? 'unavailable'
          : hasIndicator('acuityWorseThan20_40')
            ? 'flagged'
            : 'notFlagged',
    },
    {
      key: 'blink',
      title: copy.blinkMetricTitle,
      value: blinkValue,
      state: !finiteValue(metrics.blinkRatePerMinute)
        ? 'unavailable'
        : hasIndicator('blinkRateLow')
          ? 'flagged'
          : 'notFlagged',
    },
    {
      key: 'distance',
      title: copy.distanceMetricTitle,
      value: formattedDistanceValue,
      state: !finiteValue(distanceValue)
        ? 'unavailable'
        : hasIndicator('viewingDistanceUnsafe')
          ? 'flagged'
          : 'notFlagged',
    },
  ];

  const indicatorSummary =
    assessment.mainIndicators.length > 0
      ? assessment.mainIndicators
          .map((indicator) => copy.indicatorLabels[indicator])
          .join(copy.summaryListSeparator)
      : copy.noIndicators;
  const limitationSummary =
    assessment.limitations.length > 0
      ? assessment.limitations
          .map((limitation) => copy.limitationLabels[limitation])
          .join(copy.summaryListSeparator)
      : copy.noLimitations;
  const summaryLine = (label: string, value: string) =>
    `${label}${copy.summaryLabelSeparator}${value}`;

  const summary = useMemo(() => {
    const lines = [
      copy.summaryTitle,
      summaryLine(copy.summaryRiskLabel, copy.riskBandLabels[assessment.riskBand]),
      summaryLine(copy.summaryAcuityLabel, acuityValue),
      summaryLine(copy.summaryBlinkLabel, blinkValue),
      summaryLine(copy.summaryDistanceLabel, formattedDistanceValue),
      summaryLine(copy.summaryIndicatorsLabel, indicatorSummary),
      summaryLine(copy.summaryConfidenceLabel, copy.confidenceLabels[assessment.confidence]),
      summaryLine(copy.summaryLimitationsLabel, limitationSummary),
      summaryLine(copy.summaryNextStepLabel, copy.nextStepLabels[assessment.nextStep]),
    ];

    if (latestResult?.demo || assessment.limitations.includes('demoMode')) {
      lines.push(`${copy.demoWarningTitle}${copy.summaryLabelSeparator}${copy.demoWarningBody}`);
    }

    lines.push(copy.screeningNotDiagnosisNotice, copy.professionalCareCue);
    return lines.join('\n');
  }, [
    assessment.confidence,
    assessment.limitations,
    assessment.nextStep,
    assessment.riskBand,
    acuityValue,
    blinkValue,
    copy,
    formattedDistanceValue,
    indicatorSummary,
    latestResult?.demo,
    limitationSummary,
  ]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const finishPrinting = () => setPrinting(false);
    window.addEventListener('afterprint', finishPrinting);
    return () => window.removeEventListener('afterprint', finishPrinting);
  }, []);

  const copySummary = async () => {
    const copied = await writeToClipboard(summary);
    setStatusMessageCode(copied ? 'summaryCopied' : 'summaryCopyFailed');
    return copied;
  };

  const shareSummary = async () => {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: copy.summaryTitle, text: summary });
        setStatusMessageCode('summaryShared');
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
      }
    }

    await copySummary();
  };

  const printSummary = () => {
    if (typeof window === 'undefined') return;
    setPrinting(true);
    setStatusMessageCode('summaryPrint');
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => window.print());
    });
  };

  const scheduleRetest = () => {
    onScheduleRetest(RETEST_DELAY_MINUTES);
    setStatusMessageCode('retestScheduled');
  };

  const renderCareReferralAction = (prominence: 'primary' | 'secondary' = 'secondary') => {
    const actionClassName =
      `vg-screening-explanation__action vg-screening-explanation__action--${prominence}`;
    if (careReferralAction.href !== undefined) {
      return (
        <a
          className={actionClassName}
          href={careReferralAction.href}
          target={careReferralAction.openInNewTab ? '_blank' : undefined}
          rel={careReferralAction.openInNewTab ? 'noopener noreferrer' : undefined}
        >
          {copy.careReferralActionLabel}
        </a>
      );
    }

    return (
      <button
        className={actionClassName}
        type="button"
        onClick={careReferralAction.onActivate}
      >
        {copy.careReferralActionLabel}
      </button>
    );
  };

  const renderRetestAction = (prominence: 'primary' | 'secondary' = 'primary') => (
    <button
      className={`vg-screening-explanation__action vg-screening-explanation__action--${prominence}`}
      type="button"
      onClick={scheduleRetest}
    >
      {copy.scheduleRetestLabel}
    </button>
  );

  const showDemoWarning =
    latestResult?.demo === true || assessment.limitations.includes('demoMode');
  const isDemoOnly = assessment.nextStep === 'demoOnly';
  const referralIsPrimary = assessment.riskBand === 'concern';

  return (
    <section
      className={`vg-screening-explanation ${className}`.trim()}
      aria-labelledby={headingId}
      aria-describedby={introductionId}
      data-band={assessment.riskBand}
      data-printing={printing ? 'true' : 'false'}
    >
      <header className="vg-screening-explanation__header">
        <div>
          <span className="vg-screening-explanation__eyebrow">{copy.eyebrow}</span>
          <h2 id={headingId}>{copy.title}</h2>
        </div>
        <p id={introductionId}>{copy.introduction}</p>
      </header>

      <ol className="vg-screening-explanation__blocks" aria-label={copy.blocksAriaLabel}>
        <li className="vg-screening-explanation__block vg-screening-explanation__block--result">
          <span className="vg-screening-explanation__number" aria-hidden="true">01</span>
          <div className="vg-screening-explanation__block-content">
            <h3>{copy.resultTitle}</h3>
            <div
              className="vg-screening-explanation__band"
              role="status"
              aria-live="polite"
              aria-atomic="true"
            >
              <span>{copy.riskBandLabel}</span>
              <strong>{copy.riskBandLabels[assessment.riskBand]}</strong>
            </div>
            <p className="vg-screening-explanation__band-description">
              {copy.riskBandDescriptions[assessment.riskBand]}
            </p>

            <div className="vg-screening-explanation__key-next-step">
              <div className="vg-screening-explanation__next-step">
                <span>{copy.nextStepLabel}</span>
                <strong>{copy.nextStepLabels[assessment.nextStep]}</strong>
              </div>
              {!isDemoOnly && (
                <div
                  className="vg-screening-explanation__key-action vg-screening-explanation__print-hidden"
                  role="group"
                  aria-label={copy.actionGroupAriaLabel}
                >
                  {referralIsPrimary
                    ? renderCareReferralAction('primary')
                    : renderRetestAction('primary')}
                  <small>
                    {referralIsPrimary ? copy.careReferralHint : copy.scheduleRetestHint}
                  </small>
                </div>
              )}
            </div>

            {showDemoWarning && (
              <aside className="vg-screening-explanation__demo-warning">
                <strong>{copy.demoWarningTitle}</strong>
                <span>{copy.demoWarningBody}</span>
              </aside>
            )}

            <div className="vg-screening-explanation__care-notice">
              <strong>{copy.screeningNotDiagnosisNotice}</strong>
              <span>{copy.professionalCareCue}</span>
            </div>
          </div>
        </li>

        <li className="vg-screening-explanation__block vg-screening-explanation__block--indicators">
          <span className="vg-screening-explanation__number" aria-hidden="true">02</span>
          <div className="vg-screening-explanation__block-content">
            <h3>{copy.mainIndicatorsTitle}</h3>
            <ul
              className="vg-screening-explanation__metric-cards"
              aria-label={copy.metricCardsAriaLabel}
            >
              {metricCards.map((card) => (
                <li key={card.key} data-state={card.state}>
                  <span>{card.title}</span>
                  <strong>{card.value}</strong>
                  <small>{copy.metricStateLabels[card.state]}</small>
                </li>
              ))}
            </ul>

            <div className="vg-screening-explanation__indicator-list">
              <strong>{copy.indicatorListLabel}</strong>
              {assessment.mainIndicators.length > 0 ? (
                <ul>
                  {assessment.mainIndicators.map((indicator) => (
                    <li key={indicator}>{copy.indicatorLabels[indicator]}</li>
                  ))}
                </ul>
              ) : (
                <p>{copy.noIndicators}</p>
              )}
            </div>
          </div>
        </li>

        <li className="vg-screening-explanation__block vg-screening-explanation__block--confidence">
          <span className="vg-screening-explanation__number" aria-hidden="true">03</span>
          <div className="vg-screening-explanation__block-content">
            <h3>{copy.confidenceAndLimitationsTitle}</h3>
            <dl className="vg-screening-explanation__confidence">
              <div>
                <dt>{copy.confidenceLabel}</dt>
                <dd data-confidence={assessment.confidence}>
                  {copy.confidenceLabels[assessment.confidence]}
                </dd>
              </div>
            </dl>
            <div className="vg-screening-explanation__limitations">
              <strong>{copy.limitationsLabel}</strong>
              {assessment.limitations.length > 0 ? (
                <ul>
                  {assessment.limitations.map((limitation) => (
                    <li key={limitation}>{copy.limitationLabels[limitation]}</li>
                  ))}
                </ul>
              ) : (
                <p>{copy.noLimitations}</p>
              )}
            </div>
          </div>
        </li>

        <li className="vg-screening-explanation__block vg-screening-explanation__block--next-step">
          <span className="vg-screening-explanation__number" aria-hidden="true">04</span>
          <div className="vg-screening-explanation__block-content">
            <h3>{copy.recommendedNextStepTitle}</h3>
            <div className="vg-screening-explanation__next-step">
              <span>{copy.nextStepLabel}</span>
              <strong>{copy.nextStepLabels[assessment.nextStep]}</strong>
            </div>
            {!isDemoOnly && (
              <div
                className="vg-screening-explanation__care-actions vg-screening-explanation__print-hidden"
                role="group"
                aria-label={copy.actionGroupAriaLabel}
              >
                <div>
                  {referralIsPrimary
                    ? renderRetestAction('secondary')
                    : renderCareReferralAction('secondary')}
                  <small>
                    {referralIsPrimary ? copy.scheduleRetestHint : copy.careReferralHint}
                  </small>
                </div>
              </div>
            )}

            <div
              className="vg-screening-explanation__summary-actions vg-screening-explanation__print-hidden"
              role="group"
              aria-label={copy.summaryActionsAriaLabel}
            >
              <button type="button" onClick={() => void copySummary()}>
                {copy.copySummaryLabel}
              </button>
              <button type="button" onClick={() => void shareSummary()}>
                {copy.shareSummaryLabel}
              </button>
              <button type="button" onClick={printSummary}>
                {copy.printSummaryLabel}
              </button>
            </div>
          </div>
        </li>
      </ol>

      <p
        className="vg-screening-explanation__status vg-screening-explanation__print-hidden"
        id={statusId}
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {statusMessage}
      </p>
    </section>
  );
}
