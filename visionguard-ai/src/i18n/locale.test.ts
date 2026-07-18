import { describe, expect, it } from 'vitest';
import {
  detectDeviceLocale,
  mapDeviceLanguage,
  resolveInitialLocale,
} from './locale';

describe('device locale detection', () => {
  it.each([
    ['zh', 'zh-CN'],
    ['zh-CN', 'zh-CN'],
    ['zh-SG', 'zh-CN'],
    ['zh-Hans-CN', 'zh-CN'],
    ['zh_TW', 'zh-TW'],
    ['zh-HK', 'zh-TW'],
    ['zh-MO', 'zh-TW'],
    ['zh-Hant', 'zh-TW'],
    ['zh-Hant-HK', 'zh-TW'],
    ['en', 'en'],
    ['en-US', 'en'],
    ['EN_gb', 'en'],
  ] as const)('maps %s to %s', (deviceLanguage, expectedLocale) => {
    expect(mapDeviceLanguage(deviceLanguage)).toBe(expectedLocale);
  });

  it.each(['fr-FR', 'ja-JP', 'ko-KR', 'es', '', '  '])(
    'falls back to English for unsupported or empty device language %j',
    (deviceLanguage) => {
      expect(mapDeviceLanguage(deviceLanguage)).toBe('en');
    },
  );

  it('uses navigator.languages primary entry, then navigator.language', () => {
    expect(detectDeviceLocale(['zh-Hant-TW', 'en-US'], 'en-US')).toBe('zh-TW');
    expect(detectDeviceLocale([], 'zh-CN')).toBe('zh-CN');
    expect(detectDeviceLocale(undefined, undefined)).toBe('en');
  });

  it('keeps a valid saved choice ahead of the device language', () => {
    expect(resolveInitialLocale('zh-TW', ['en-GB'], 'en-GB')).toBe('zh-TW');
    expect(resolveInitialLocale('invalid', ['zh-CN'], 'zh-CN')).toBe('zh-CN');
  });
});
