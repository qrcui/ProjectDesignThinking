export const CAMPAIGN_PARAMETER_LIMITS = {
  campus: 80,
  campaign: 120,
  code: 32,
  referral: 2_048,
} as const;

export interface CampaignDeploymentConfig {
  campusName?: string;
  campaignName?: string;
  accessCode?: string;
  referralUrl?: string;
}

const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/u;
const MAILTO_LINE_BREAK = /%(?:0a|0d)/iu;
const ALLOWED_REFERRAL_PROTOCOLS = new Set(['https:', 'http:', 'mailto:']);

function readTextParameter(
  params: URLSearchParams,
  name: string,
  maximumLength: number,
): string | undefined {
  const rawValue = params.get(name);
  if (rawValue === null || CONTROL_CHARACTERS.test(rawValue)) return undefined;

  const normalized = rawValue.trim().replace(/\s+/gu, ' ');
  if (!normalized || Array.from(normalized).length > maximumLength) return undefined;
  return normalized;
}

function readReferralParameter(params: URLSearchParams): string | undefined {
  const rawValue = params.get('referral');
  if (
    rawValue === null ||
    CONTROL_CHARACTERS.test(rawValue) ||
    Array.from(rawValue).length > CAMPAIGN_PARAMETER_LIMITS.referral
  ) {
    return undefined;
  }

  const candidate = rawValue.trim();
  if (!candidate) return undefined;

  try {
    const url = new URL(candidate);
    if (!ALLOWED_REFERRAL_PROTOCOLS.has(url.protocol)) return undefined;

    if (url.protocol === 'mailto:') {
      if (!url.pathname.trim() || MAILTO_LINE_BREAK.test(candidate)) return undefined;
    } else if (!url.hostname || url.username || url.password) {
      return undefined;
    }

    return url.href;
  } catch {
    return undefined;
  }
}

/**
 * Reads optional deployment values from a page URL. Invalid or excessive values
 * are ignored so callers can safely retain their localized defaults.
 */
export function parseCampaignDeploymentConfig(pageUrl: string): CampaignDeploymentConfig {
  try {
    const params = new URL(pageUrl).searchParams;
    return {
      campusName: readTextParameter(
        params,
        'campus',
        CAMPAIGN_PARAMETER_LIMITS.campus,
      ),
      campaignName: readTextParameter(
        params,
        'campaign',
        CAMPAIGN_PARAMETER_LIMITS.campaign,
      ),
      accessCode: readTextParameter(params, 'code', CAMPAIGN_PARAMETER_LIMITS.code),
      referralUrl: readReferralParameter(params),
    };
  } catch {
    return {};
  }
}
