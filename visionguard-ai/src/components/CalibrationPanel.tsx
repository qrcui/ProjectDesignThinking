import { useEffect, useState } from 'react';
import {
  MIN_ACCEPTABLE_LIGHTING_LEVEL,
  TARGET_DISTANCE_CM,
} from '../constants';
import { useI18n } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/messages';
import {
  createPhysicalScreenCalibration,
  estimateScreenCalibrationFromDiagonal,
  getCalibrationReferenceType,
  PHYSICAL_CALIBRATION_REFERENCES,
} from '../lib/screenCalibration';
import type {
  CalibrationMessageCode,
  DistanceCalibration,
  ScreenCalibration,
  ScreenCalibrationReference,
} from '../types';

interface CalibrationPanelProps {
  distanceCalibration: DistanceCalibration | null;
  screenCalibration: ScreenCalibration;
  lightingLevel: number | null;
  lightingOk: boolean;
  isDistanceCalibrating: boolean;
  calibrationProgress: number;
  calibrationMessage: CalibrationMessageCode | null;
  onStartDistanceCalibration: () => void;
  onResetDistanceCalibration: () => void;
  onSaveScreenCalibration: (calibration: ScreenCalibration) => void;
}

export function CalibrationPanel({
  distanceCalibration,
  screenCalibration,
  lightingLevel,
  lightingOk,
  isDistanceCalibrating,
  calibrationProgress,
  calibrationMessage,
  onStartDistanceCalibration,
  onResetDistanceCalibration,
  onSaveScreenCalibration,
}: CalibrationPanelProps) {
  const { formatNumber, t } = useI18n();
  const [referenceType, setReferenceType] = useState<ScreenCalibrationReference>(() =>
    getCalibrationReferenceType(screenCalibration),
  );
  const [draftReferenceWidth, setDraftReferenceWidth] = useState(
    screenCalibration.cardWidthPx,
  );
  const [draftDiagonalInches, setDraftDiagonalInches] = useState(() =>
    String(screenCalibration.screenDiagonalInches ?? 15.6),
  );

  const calibrationMessageKeys: Record<CalibrationMessageCode, MessageKey> = {
    complete: 'calibration.message.complete',
    'not-enough-samples': 'calibration.message.notEnough',
    demo: 'calibration.message.demo',
    'start-camera': 'calibration.message.startCamera',
    'hold-still': 'calibration.message.holdStill',
    cleared: 'calibration.message.cleared',
  };

  useEffect(() => {
    setReferenceType(getCalibrationReferenceType(screenCalibration));
    setDraftReferenceWidth(screenCalibration.cardWidthPx);
    if (screenCalibration.screenDiagonalInches) {
      setDraftDiagonalInches(String(screenCalibration.screenDiagonalInches));
    }
  }, [screenCalibration]);

  const isPhysicalReference = referenceType !== 'screen-diagonal';
  const physicalReference = isPhysicalReference
    ? PHYSICAL_CALIBRATION_REFERENCES[referenceType]
    : null;
  const physicalReferenceName =
    referenceType === 'passport-td3'
      ? t('calibration.reference.passport')
      : t('calibration.reference.standardCard');
  const draftDiagonalValue = Number(draftDiagonalInches);
  const diagonalIsValid =
    Number.isFinite(draftDiagonalValue) &&
    draftDiagonalValue >= 3 &&
    draftDiagonalValue <= 120;

  const selectReference = (nextReference: ScreenCalibrationReference) => {
    setReferenceType(nextReference);
    if (nextReference !== 'screen-diagonal') {
      const dimensions = PHYSICAL_CALIBRATION_REFERENCES[nextReference];
      setDraftReferenceWidth(Math.round(screenCalibration.pxPerMm * dimensions.widthMm));
    }
  };

  const saveScreenCalibration = () => {
    const calibratedAt = new Date().toISOString();
    if (referenceType === 'screen-diagonal') {
      const estimate = estimateScreenCalibrationFromDiagonal(
        draftDiagonalValue,
        window.screen.width,
        window.screen.height,
        calibratedAt,
      );
      if (estimate) onSaveScreenCalibration(estimate);
      return;
    }

    onSaveScreenCalibration(
      createPhysicalScreenCalibration(referenceType, draftReferenceWidth, calibratedAt),
    );
  };

  const lightingStatus =
    lightingLevel === null
      ? t('calibration.lightingWaiting')
      : lightingOk
        ? t('calibration.lightingGood')
        : lightingLevel < MIN_ACCEPTABLE_LIGHTING_LEVEL
          ? t('calibration.lightingDark')
          : t('calibration.lightingBright');

  return (
    <section className="calibration-section" id="calibration" aria-labelledby="calibration-title">
      <div className="section-heading">
        <div>
          <span className="eyebrow">{t('calibration.eyebrow')}</span>
          <h2 id="calibration-title">{t('calibration.title')}</h2>
        </div>
        <p>{t('calibration.body')}</p>
      </div>

      <div className="calibration-grid">
        <article className="panel calibration-card">
          <div className="calibration-number">A</div>
          <div>
            <h3>{t('calibration.distanceTitle')}</h3>
            <p>{t('calibration.distanceBody', { distance: TARGET_DISTANCE_CM })}</p>
          </div>

          <div className={`calibration-status ${distanceCalibration ? 'is-complete' : ''}`}>
            <span className="status-dot" />
            {distanceCalibration
              ? t('calibration.distanceComplete', {
                  distance: formatNumber(distanceCalibration.referenceDistanceCm),
                  pixels: formatNumber(distanceCalibration.referenceEyePx, {
                    minimumFractionDigits: 1,
                    maximumFractionDigits: 1,
                  }),
                })
              : t('calibration.notCalibrated')}
          </div>

          {isDistanceCalibrating && (
            <div className="progress-block">
              <div className="progress-label">
                <span>{t('calibration.sampling')}</span>
                <span>{calibrationProgress}%</span>
              </div>
              <div className="progress-track">
                <span style={{ width: `${calibrationProgress}%` }} />
              </div>
            </div>
          )}

          {calibrationMessage && (
            <p className="calibration-message">{t(calibrationMessageKeys[calibrationMessage])}</p>
          )}

          <div className="button-row">
            <button
              className="button button-primary"
              type="button"
              onClick={onStartDistanceCalibration}
              disabled={isDistanceCalibrating}
            >
              {t(
                isDistanceCalibrating
                  ? 'calibration.calibrating'
                  : distanceCalibration
                    ? 'calibration.recalibrate'
                    : 'calibration.startDistance',
              )}
            </button>
            {distanceCalibration && distanceCalibration.calibratedAt !== 'demo' && (
              <button className="button button-ghost" type="button" onClick={onResetDistanceCalibration}>
                {t('calibration.clear')}
              </button>
            )}
          </div>
        </article>

        <article className="panel calibration-card screen-calibration-card">
          <div className="calibration-number">B</div>
          <div>
            <h3>{t('calibration.screenTitle')}</h3>
            <p>{t('calibration.screenBody')}</p>
          </div>

          <label className="calibration-reference-picker">
            <span>{t('calibration.referenceChoice')}</span>
            <select
              value={referenceType}
              onChange={(event) =>
                selectReference(event.target.value as ScreenCalibrationReference)
              }
            >
              <option value="standard-card">
                {t('calibration.reference.standardCard')}
              </option>
              <option value="passport-td3">
                {t('calibration.reference.passport')}
              </option>
              <option value="screen-diagonal">
                {t('calibration.reference.diagonal')}
              </option>
            </select>
          </label>

          {physicalReference ? (
            <>
              <p className="calibration-reference-help">
                {referenceType === 'passport-td3'
                  ? t('calibration.passportBody')
                  : t('calibration.standardCardBody')}
              </p>
              <p className="calibration-reference-warning">
                {t('calibration.standardSizeWarning')}
              </p>
              <p className="calibration-mobile-fit-tip">
                {t('calibration.mobileFitTip')}
              </p>

              <div className="card-ruler-viewport">
                <div
                  className={`physical-card ${
                    referenceType === 'passport-td3' ? 'is-passport' : ''
                  }`}
                  style={{
                    width: `${draftReferenceWidth}px`,
                    height: `${Math.round(
                      draftReferenceWidth *
                        (physicalReference.heightMm / physicalReference.widthMm),
                    )}px`,
                  }}
                >
                  <span>
                    {formatNumber(physicalReference.widthMm, {
                      minimumFractionDigits: referenceType === 'passport-td3' ? 0 : 2,
                      maximumFractionDigits: 2,
                    })}{' '}
                    ×{' '}
                    {formatNumber(physicalReference.heightMm, {
                      minimumFractionDigits: referenceType === 'passport-td3' ? 0 : 2,
                      maximumFractionDigits: 2,
                    })}{' '}
                    mm
                  </span>
                  <small>
                    {t('calibration.referenceMatch', { reference: physicalReferenceName })}
                  </small>
                </div>
              </div>

              <label className="range-control">
                <span>
                  {t('calibration.displayedWidth', { width: draftReferenceWidth })}
                </span>
                <input
                  type="range"
                  min={Math.round(physicalReference.widthMm * 2.5)}
                  max={Math.round(physicalReference.widthMm * 7.25)}
                  step="1"
                  value={draftReferenceWidth}
                  onChange={(event) =>
                    setDraftReferenceWidth(Number(event.target.value))
                  }
                />
              </label>
            </>
          ) : (
            <div className="diagonal-calibration">
              <label>
                <span>{t('calibration.diagonalLabel')}</span>
                <span className="diagonal-input-row">
                  <input
                    type="number"
                    min="3"
                    max="120"
                    step="0.1"
                    inputMode="decimal"
                    value={draftDiagonalInches}
                    onChange={(event) => setDraftDiagonalInches(event.target.value)}
                  />
                  <span>{t('calibration.inches')}</span>
                </span>
              </label>
              <p>{t('calibration.diagonalBody')}</p>
              <p className="calibration-reference-warning">
                {t('calibration.diagonalWarning', {
                  width: window.screen.width,
                  height: window.screen.height,
                })}
              </p>
              {!diagonalIsValid && (
                <p className="calibration-input-error" role="alert">
                  {t('calibration.diagonalInvalid')}
                </p>
              )}
            </div>
          )}

          <div className={`calibration-status ${screenCalibration.confirmed ? 'is-complete' : ''}`}>
            <span className="status-dot" />
            {screenCalibration.confirmed
              ? t(
                  screenCalibration.estimated
                    ? 'calibration.screenCompleteEstimated'
                    : 'calibration.screenComplete',
                  {
                    value: formatNumber(screenCalibration.pxPerMm, {
                      minimumFractionDigits: 3,
                      maximumFractionDigits: 3,
                    }),
                  },
                )
              : t('calibration.screenNominal')}
          </div>

          <button
            className="button button-primary"
            type="button"
            onClick={saveScreenCalibration}
            disabled={referenceType === 'screen-diagonal' && !diagonalIsValid}
          >
            {t(
              referenceType === 'screen-diagonal'
                ? 'calibration.saveEstimate'
                : 'calibration.saveScreen',
            )}
          </button>
          {physicalReference && (
            <span className="fine-print">
              {t('calibration.referenceDimensions', {
                width: formatNumber(physicalReference.widthMm, {
                  minimumFractionDigits: referenceType === 'passport-td3' ? 0 : 2,
                  maximumFractionDigits: 2,
                }),
                height: formatNumber(physicalReference.heightMm, {
                  minimumFractionDigits: referenceType === 'passport-td3' ? 0 : 2,
                  maximumFractionDigits: 2,
                }),
              })}
            </span>
          )}
        </article>

        <article className="panel calibration-card lighting-calibration-card">
          <div className="calibration-number">C</div>
          <div>
            <h3>{t('calibration.lightingTitle')}</h3>
            <p>{t('calibration.lightingBody')}</p>
          </div>

          <div
            className={`calibration-status ${lightingOk ? 'is-complete' : ''}`}
            role="status"
            aria-live="polite"
          >
            <span className="status-dot" />
            {lightingStatus}
          </div>

          <div className="lighting-meter" aria-label={lightingStatus}>
            <span style={{ width: `${Math.round((lightingLevel ?? 0) * 100)}%` }} />
          </div>

          <span className="fine-print">
            {lightingLevel === null
              ? t('calibration.lightingWaiting')
              : t('calibration.lightingValue', {
                  value: formatNumber(Math.round(lightingLevel * 100)),
                })}
          </span>
        </article>
      </div>
    </section>
  );
}
