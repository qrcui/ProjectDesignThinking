import { useEffect, useId, useState } from 'react';
import QRCode from 'qrcode';
import '../enhancements.css';

export type CampaignActionTarget =
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

export interface CampaignAccessCopy {
  eyebrow: string;
  title: string;
  introduction: string;
  currentLinkLabel: string;
  copyLinkLabel: string;
  linkCopiedStatus: string;
  copyFailedStatus: string;
  printCardLabel: string;
  cardAriaLabel: string;
  cardKicker: string;
  cardBody: string;
  qrAlt: string;
  qrUnavailable: string;
  campusFieldLabel: string;
  linkFieldLabel: string;
  accessCodeFieldLabel: string;
  cardPrivacyLine: string;
  careTitle: string;
  careBody: string;
  careActionLabel: string;
  referralTitle: string;
  referralBody: string;
  referralActionLabel: string;
  shareTitle: string;
  shareBody: string;
  shareActionLabel: string;
  sharePayloadText: string;
  shareCompleteStatus: string;
}

export interface CampaignAccessProps {
  campaignName: string;
  campusName: string;
  currentUrl?: string;
  accessCode?: string;
  careAction: CampaignActionTarget;
  referralAction: CampaignActionTarget;
  copy: CampaignAccessCopy;
  className?: string;
}

type CampaignStatusCode =
  | 'qrUnavailable'
  | 'linkCopied'
  | 'copyFailed'
  | 'shareComplete'
  | null;

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

export function CampaignAccess({
  campaignName,
  campusName,
  currentUrl,
  accessCode,
  careAction,
  referralAction,
  copy,
  className = '',
}: CampaignAccessProps) {
  const headingId = useId();
  const statusId = useId();
  const [statusCode, setStatusCode] = useState<CampaignStatusCode>(null);
  const [printing, setPrinting] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const resolvedUrl = currentUrl?.trim() || (typeof window === 'undefined' ? '' : window.location.href);
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
    const finishPrinting = () => setPrinting(false);
    window.addEventListener('afterprint', finishPrinting);
    return () => window.removeEventListener('afterprint', finishPrinting);
  }, []);

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

  const printCard = () => {
    setPrinting(true);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => window.print());
    });
  };

  const shareCurrentLink = async () => {
    if (!resolvedUrl) {
      setStatusCode('copyFailed');
      return;
    }

    if (navigator.share) {
      try {
        await navigator.share({
          title: campaignName,
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

  const renderTarget = (target: CampaignActionTarget, label: string) => {
    if (target.href) {
      return (
        <a
          className="vg-secondary-action"
          href={target.href}
          target={target.openInNewTab ? '_blank' : undefined}
          rel={target.openInNewTab ? 'noreferrer' : undefined}
        >
          {label}
          <span aria-hidden="true">{target.openInNewTab ? '↗' : '→'}</span>
        </a>
      );
    }

    return (
      <button className="vg-secondary-action" type="button" onClick={target.onActivate}>
        {label}
        <span aria-hidden="true">→</span>
      </button>
    );
  };

  return (
    <section
      className={`vg-campaign-access vg-enhancement-panel ${className}`.trim()}
      aria-labelledby={headingId}
      data-printing={printing ? 'true' : 'false'}
    >
      <div className="vg-enhancement-heading vg-print-hidden">
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
          <h3>{campaignName}</h3>
          <p>{copy.cardBody}</p>
          <div className="vg-campus-card__details">
            <dl>
              <div>
                <dt>{copy.campusFieldLabel}</dt>
                <dd>{campusName}</dd>
              </div>
              <div>
                <dt>{copy.linkFieldLabel}</dt>
                <dd className="vg-campus-card__url">{resolvedUrl}</dd>
              </div>
              {accessCode && (
                <div>
                  <dt>{copy.accessCodeFieldLabel}</dt>
                  <dd>{accessCode}</dd>
                </div>
              )}
            </dl>
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

        <div className="vg-campaign-access__link vg-print-hidden">
          <span>{copy.currentLinkLabel}</span>
          <code title={resolvedUrl}>{resolvedUrl}</code>
          <div className="vg-campaign-access__link-actions">
            <button className="vg-secondary-action" type="button" onClick={() => void copyCurrentLink()} disabled={!resolvedUrl}>
              {copy.copyLinkLabel}
            </button>
            <button className="vg-secondary-action" type="button" onClick={printCard}>
              {copy.printCardLabel}
            </button>
          </div>
        </div>
      </div>

      <div className="vg-campaign-actions vg-print-hidden">
        <article>
          <span className="vg-campaign-actions__number" aria-hidden="true">01</span>
          <h3>{copy.careTitle}</h3>
          <p>{copy.careBody}</p>
          {renderTarget(careAction, copy.careActionLabel)}
        </article>
        <article>
          <span className="vg-campaign-actions__number" aria-hidden="true">02</span>
          <h3>{copy.referralTitle}</h3>
          <p>{copy.referralBody}</p>
          {renderTarget(referralAction, copy.referralActionLabel)}
        </article>
        <article>
          <span className="vg-campaign-actions__number" aria-hidden="true">03</span>
          <h3>{copy.shareTitle}</h3>
          <p>{copy.shareBody}</p>
          <button className="vg-secondary-action" type="button" onClick={() => void shareCurrentLink()} disabled={!resolvedUrl}>
            {copy.shareActionLabel}
            <span aria-hidden="true">↗</span>
          </button>
        </article>
      </div>

      <p className="vg-campaign-access__status vg-print-hidden" id={statusId} aria-live="polite" aria-atomic="true">
        {statusMessage}
      </p>
    </section>
  );
}
