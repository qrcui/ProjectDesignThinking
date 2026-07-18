import type { VisionTestResult } from '../types';
import { useI18n } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/messages';
import { downloadJson } from '../lib/storage';

interface ResultsHistoryProps {
  results: VisionTestResult[];
  onClear: () => void;
}

const eyeLabel = {
  binocular: 'vision.eye.binocular',
  left: 'vision.eye.left',
  right: 'vision.eye.right',
} satisfies Record<VisionTestResult['eyeMode'], MessageKey>;

export function ResultsHistory({ results, onClear }: ResultsHistoryProps) {
  const { formatDateTime, formatNumber, t } = useI18n();

  return (
    <section className="history-section" aria-labelledby="history-title">
      <div className="section-heading compact">
        <div>
          <span className="eyebrow">{t('history.eyebrow')}</span>
          <h2 id="history-title">{t('history.title')}</h2>
        </div>
        <div className="button-row">
          <button
            className="button button-ghost"
            type="button"
            disabled={results.length === 0}
            onClick={() => downloadJson('visionguard-results.json', results)}
          >
            {t('history.export')}
          </button>
          <button className="text-button danger" type="button" disabled={results.length === 0} onClick={onClear}>
            {t('history.clear')}
          </button>
        </div>
      </div>

      {results.length === 0 ? (
        <div className="empty-history panel">
          <span>VG</span>
          <p>{t('history.empty')}</p>
        </div>
      ) : (
        <div className="history-list">
          {results.map((result) => (
            <article className="history-item panel" key={result.id}>
              <div className="history-date">
                <strong>
                  {formatDateTime(result.completedAt, {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  })}
                </strong>
                <span>
                  {formatDateTime(result.completedAt, { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <div>
                <span className="metric-label">{t('history.eye')}</span>
                <strong>{t(eyeLabel[result.eyeMode])}</strong>
              </div>
              <div>
                <span className="metric-label">{t('history.estimatedAcuity')}</span>
                <strong>{result.snellen}</strong>
              </div>
              <div>
                <span className="metric-label">{t('history.accuracy')}</span>
                <strong>{Math.round(result.accuracy * 100)}%</strong>
              </div>
              <div>
                <span className="metric-label">{t('history.averageDistance')}</span>
                <strong>
                  {result.averageDistanceCm === null
                    ? '--'
                    : formatNumber(result.averageDistanceCm, {
                        minimumFractionDigits: 1,
                        maximumFractionDigits: 1,
                      })}{' '}
                  cm
                </strong>
              </div>
              {result.demo && <span className="demo-badge">{t('history.demo')}</span>}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
