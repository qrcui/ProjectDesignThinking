import { useId } from 'react';
import '../enhancements.css';

export interface ConsentPanelCopy {
  eyebrow: string;
  title: string;
  introduction: string;
  cameraTitle: string;
  cameraDescription: string;
  requiredLabel: string;
  storageTitle: string;
  storageDescription: string;
  optionalLabel: string;
  privacyNoticeTitle: string;
  privacyNoticeBody: string;
  continueLabel: string;
  cameraConsentHint: string;
}

export interface ConsentPanelProps {
  cameraConsent: boolean;
  storageConsent: boolean;
  onCameraConsentChange: (consented: boolean) => void;
  onStorageConsentChange: (consented: boolean) => void;
  onContinue: () => void;
  copy: ConsentPanelCopy;
  disabled?: boolean;
  className?: string;
}

export function ConsentPanel({
  cameraConsent,
  storageConsent,
  onCameraConsentChange,
  onStorageConsentChange,
  onContinue,
  copy,
  disabled = false,
  className = '',
}: ConsentPanelProps) {
  const headingId = useId();
  const cameraDescriptionId = useId();
  const storageDescriptionId = useId();
  const hintId = useId();
  const canContinue = cameraConsent && !disabled;

  return (
    <section className={`vg-consent vg-enhancement-panel ${className}`.trim()} aria-labelledby={headingId}>
      <div className="vg-enhancement-heading">
        <div>
          <span className="vg-kicker">{copy.eyebrow}</span>
          <h2 id={headingId}>{copy.title}</h2>
        </div>
        <p>{copy.introduction}</p>
      </div>

      <div className="vg-consent__choices">
        <label className={`vg-consent-choice ${cameraConsent ? 'is-selected' : ''}`}>
          <input
            type="checkbox"
            checked={cameraConsent}
            required
            disabled={disabled}
            aria-describedby={cameraDescriptionId}
            onChange={(event) => onCameraConsentChange(event.target.checked)}
          />
          <span className="vg-check-control" aria-hidden="true">
            <i />
          </span>
          <span className="vg-consent-choice__copy">
            <span className="vg-consent-choice__title">
              <strong>{copy.cameraTitle}</strong>
              <small className="is-required">{copy.requiredLabel}</small>
            </span>
            <span id={cameraDescriptionId}>{copy.cameraDescription}</span>
          </span>
        </label>

        <label className={`vg-consent-choice ${storageConsent ? 'is-selected' : ''}`}>
          <input
            type="checkbox"
            checked={storageConsent}
            disabled={disabled}
            aria-describedby={storageDescriptionId}
            onChange={(event) => onStorageConsentChange(event.target.checked)}
          />
          <span className="vg-check-control" aria-hidden="true">
            <i />
          </span>
          <span className="vg-consent-choice__copy">
            <span className="vg-consent-choice__title">
              <strong>{copy.storageTitle}</strong>
              <small>{copy.optionalLabel}</small>
            </span>
            <span id={storageDescriptionId}>{copy.storageDescription}</span>
          </span>
        </label>
      </div>

      <aside className="vg-privacy-assurance" role="note">
        <span className="vg-privacy-assurance__icon" aria-hidden="true">
          <i />
        </span>
        <span>
          <strong>{copy.privacyNoticeTitle}</strong>
          <span>{copy.privacyNoticeBody}</span>
        </span>
      </aside>

      <div className="vg-enhancement-actions">
        <button
          className="vg-primary-action"
          type="button"
          onClick={onContinue}
          disabled={!canContinue}
          aria-describedby={!cameraConsent ? hintId : undefined}
        >
          {copy.continueLabel}
          <span aria-hidden="true">→</span>
        </button>
        {!cameraConsent && (
          <p className="vg-action-hint" id={hintId} role="status">
            {copy.cameraConsentHint}
          </p>
        )}
      </div>
    </section>
  );
}
