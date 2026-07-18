import { describe, expect, it } from 'vitest';
import {
  CAMPAIGN_PARAMETER_LIMITS,
  parseCampaignDeploymentConfig,
} from './campaign';

describe('campaign deployment URL configuration', () => {
  it('reads and normalizes all supported deployment parameters', () => {
    const url = new URL('https://screening.example.edu/');
    url.searchParams.set('campus', '  North   Campus  ');
    url.searchParams.set('campaign', ' Healthy Eyes Week ');
    url.searchParams.set('code', ' EYE-2026 ');
    url.searchParams.set(
      'referral',
      'https://health.example.edu/eye-care?source=visionguard',
    );

    expect(parseCampaignDeploymentConfig(url.href)).toEqual({
      campusName: 'North Campus',
      campaignName: 'Healthy Eyes Week',
      accessCode: 'EYE-2026',
      referralUrl: 'https://health.example.edu/eye-care?source=visionguard',
    });
  });

  it.each([
    ['https', 'https://health.example.edu/appointments', 'https://health.example.edu/appointments'],
    ['http', 'http://health.example.edu/contact', 'http://health.example.edu/contact'],
    ['mailto', 'mailto:health@example.edu?subject=Eye%20screening', 'mailto:health@example.edu?subject=Eye%20screening'],
  ])('accepts a valid %s referral destination', (_name, value, expected) => {
    const url = new URL('https://screening.example.edu/');
    url.searchParams.set('referral', value);
    expect(parseCampaignDeploymentConfig(url.href).referralUrl).toBe(expected);
  });

  it.each([
    'javascript:alert(1)',
    'data:text/html,bad',
    '/relative/referral',
    'https://user:password@health.example.edu/',
    'mailto:',
    'mailto:health@example.edu?body=%0d%0aBcc:someone@example.com',
  ])('ignores unsafe referral value %s', (referral) => {
    const url = new URL('https://screening.example.edu/');
    url.searchParams.set('referral', referral);
    expect(parseCampaignDeploymentConfig(url.href).referralUrl).toBeUndefined();
  });

  it('keeps values at their limits and ignores values beyond them', () => {
    const atLimit = new URL('https://screening.example.edu/');
    atLimit.searchParams.set('campus', '学'.repeat(CAMPAIGN_PARAMETER_LIMITS.campus));
    atLimit.searchParams.set('campaign', 'c'.repeat(CAMPAIGN_PARAMETER_LIMITS.campaign));
    atLimit.searchParams.set('code', 'x'.repeat(CAMPAIGN_PARAMETER_LIMITS.code));
    expect(parseCampaignDeploymentConfig(atLimit.href)).toMatchObject({
      campusName: '学'.repeat(CAMPAIGN_PARAMETER_LIMITS.campus),
      campaignName: 'c'.repeat(CAMPAIGN_PARAMETER_LIMITS.campaign),
      accessCode: 'x'.repeat(CAMPAIGN_PARAMETER_LIMITS.code),
    });

    const overLimit = new URL('https://screening.example.edu/');
    overLimit.searchParams.set('campus', 'c'.repeat(CAMPAIGN_PARAMETER_LIMITS.campus + 1));
    overLimit.searchParams.set('campaign', 'c'.repeat(CAMPAIGN_PARAMETER_LIMITS.campaign + 1));
    overLimit.searchParams.set('code', 'c'.repeat(CAMPAIGN_PARAMETER_LIMITS.code + 1));
    overLimit.searchParams.set('referral', `https://example.edu/${'r'.repeat(CAMPAIGN_PARAMETER_LIMITS.referral)}`);
    expect(parseCampaignDeploymentConfig(overLimit.href)).toEqual({
      campusName: undefined,
      campaignName: undefined,
      accessCode: undefined,
      referralUrl: undefined,
    });
  });

  it('returns an empty configuration for malformed URLs and ignores control characters', () => {
    expect(parseCampaignDeploymentConfig('not a URL')).toEqual({});

    const url = new URL('https://screening.example.edu/');
    url.searchParams.set('campus', 'Campus\u0000Name');
    url.searchParams.set('code', '\nCODE');
    expect(parseCampaignDeploymentConfig(url.href)).toMatchObject({
      campusName: undefined,
      accessCode: undefined,
    });
  });
});
