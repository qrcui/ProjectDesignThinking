import { useEffect, useId, useState } from 'react';
import QRCode from 'qrcode';
import '../enhancements.css';

export type UserSupportActionTarget =
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

export interface UserSupportCopy {
  eyebrow: string;
  title: string;
  introduction: string;
  currentLinkLabel: string;
  copyLinkLabel: string;
  linkCopiedStatus: string;
  copyFailedStatus: string;
  cardAriaLabel: string;
  cardKicker: string;
  cardTitle: string;
  cardBody: string;
  qrAlt: string;
  qrUnavailable: string;
  linkFieldLabel: string;
  cardPrivacyLine: string;
  careTitle: string;
  careBody: string;
  careActionLabel: string;
  summaryTitle: string;
  summaryBody: string;
  summaryActionLabel: string;
  shareTitle: string;
  shareBody: string;
  shareActionLabel: string;
  sharePayloadText: string;
  shareCompleteStatus: string;
}

export interface UserSupportProps {
  currentUrl?: string;
  careAction: UserSupportActionTarget;
  summaryAction: UserSupportActionTarget;
  copy: UserSupportCopy;
}

type StatusCode = 'qrUnavailable' | 'linkCopied' | 'copyFailed' | 'shareComplete' | null;

const PUBLIC_WEB_EXPERIENCE_URL = 'https://projectdesignthinking.pages.dev/';

function shareablePageUrl(value: string): string {
  if (!value) return PUBLIC_WEB_EXPERIENCE_URL;
  try {
    const url = new URL(value);
    const isLocalAddress = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    if (!['http:', 'https:'].includes(url.protocol) || isLocalAddress) {
      return PUBLIC_WEB_EXPERIENCE_URL;
    }
    url.hash = '';
    return url.href;
  } catch {
    return PUBLIC_WEB_EXPERIENCE_URL;
  }
}

async function writeToClipboard(value: string): Promise<boolean> {
  if (!value) return false;

  let textArea: HTMLTextAreaElement | null = null;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }

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

export function UserSupport({ currentUrl, careAction, summaryAction, copy }: UserSupportProps) {
  const headingId = useId();
  const statusId = useId();
  const [statusCode, setStatusCode] = useState<StatusCode>(null);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const resolvedUrl = shareablePageUrl(
    currentUrl?.trim() || (typeof window === 'undefined' ? '' : window.location.href),
  );
  const statusMessage = statusCode === 'qrUnavailable'
    ? copy.qrUnavailable
    : statusCode === 'linkCopied'
      ? copy.linkCopiedStatus
      : statusCode === 'copyFailed'
        ? copy.copyFailedStatus
        : statusCode === 'shareComplete'
          ? copy.shareCompleteStatus
          : '';

  useEffect(() => {
    let cancelled = false;
    setQrDataUrl('');
    setStatusCode((current) => current === 'qrUnavailable' ? null : current);
    if (!resolvedUrl) return () => undefined;

    void QRCode.toDataURL(resolvedUrl, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 220,
      color: { dark: '#071c24', light: '#ffffff' },
    }).then((dataUrl) => {
      if (!cancelled) setQrDataUrl(dataUrl);
    }).catch(() => {
      if (!cancelled) setStatusCode('qrUnavailable');
    });

    return () => {
      cancelled = true;
    };
  }, [resolvedUrl]);

  const copyCurrentLink = async () => {
    const copied = await writeToClipboard(resolvedUrl);
    setStatusCode(copied ? 'linkCopied' : 'copyFailed');
  };

  const shareCurrentLink = async () => {
    if (!resolvedUrl) {
      setStatusCode('copyFailed');
      return;
    }

    if (navigator.share) {
      try {
        await navigator.share({
          title: 'VisionGuard AI',
          text: copy.sharePayloadText,
          url: resolvedUrl,
        });
        setStatusCode('shareComplete');
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
      }
    }

    await copyCurrentLink();
  };

  const renderTarget = (target: UserSupportActionTarget, label: string) => {
    if (target.href) {
      return (
        <a
          className="vg-secondary-action"
          href={target.href}
          target={target.openInNewTab ? '_blank' : undefined}
          rel={target.openInNewTab ? 'noreferrer' : undefined}
        >
          {label}<span aria-hidden="true">{target.openInNewTab ? '↗' : '→'}</span>
        </a>
      );
    }

    return (
      <button className="vg-secondary-action" type="button" onClick={target.onActivate}>
        {label}<span aria-hidden="true">→</span>
      </button>
    );
  };

  return (
    <section
      className="vg-campaign-access vg-enhancement-panel"
      id="share-support"
      aria-labelledby={headingId}
    >
      <div className="vg-enhancement-heading">
        <div>
          <span className="vg-kicker">{copy.eyebrow}</span>
          <h2 id={headingId}>{copy.title}</h2>
        </div>
        <p>{copy.introduction}</p>
      </div>

      <div className="vg-campaign-access__layout">
        <article className="vg-campus-card" aria-label={copy.cardAriaLabel}>
          <div className="vg-campus-card__topline">
            <span className="vg-campus-card__mark" aria-hidden="true"><i /></span>
            <span>{copy.cardKicker}</span>
          </div>
          <h3>{copy.cardTitle}</h3>
          <p>{copy.cardBody}</p>
          <div className="vg-campus-card__details">
            <div className="vg-campus-card__link-detail">
              <span>{copy.linkFieldLabel}</span>
              <code title={resolvedUrl}>{resolvedUrl}</code>
            </div>
            <div className="vg-campus-card__qr">
              {qrDataUrl ? (
                <img src={qrDataUrl} alt={copy.qrAlt} width="148" height="148" />
              ) : (
                <span role="status">{copy.qrUnavailable}</span>
              )}
            </div>
          </div>
          <small>{copy.cardPrivacyLine}</small>
        </article>

        <div className="vg-campaign-access__link">
          <span>{copy.currentLinkLabel}</span>
          <code title={resolvedUrl}>{resolvedUrl}</code>
          <div className="vg-campaign-access__link-actions">
            <button
              className="vg-secondary-action"
              type="button"
              onClick={() => void copyCurrentLink()}
              disabled={!resolvedUrl}
            >
              {copy.copyLinkLabel}
            </button>
          </div>
        </div>
      </div>

      <div className="vg-campaign-actions">
        <article>
          <span className="vg-campaign-actions__number" aria-hidden="true">01</span>
          <h3>{copy.careTitle}</h3>
          <p>{copy.careBody}</p>
          {renderTarget(careAction, copy.careActionLabel)}
        </article>
        <article>
          <span className="vg-campaign-actions__number" aria-hidden="true">02</span>
          <h3>{copy.summaryTitle}</h3>
          <p>{copy.summaryBody}</p>
          {renderTarget(summaryAction, copy.summaryActionLabel)}
        </article>
        <article>
          <span className="vg-campaign-actions__number" aria-hidden="true">03</span>
          <h3>{copy.shareTitle}</h3>
          <p>{copy.shareBody}</p>
          <button
            className="vg-secondary-action"
            type="button"
            onClick={() => void shareCurrentLink()}
            disabled={!resolvedUrl}
          >
            {copy.shareActionLabel}<span aria-hidden="true">↗</span>
          </button>
        </article>
      </div>

      <p
        className="vg-campaign-access__status"
        id={statusId}
        aria-live="polite"
        aria-atomic="true"
      >
        {statusMessage}
      </p>
    </section>
  );
}
