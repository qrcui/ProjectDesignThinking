import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LOCALE,
  isLocale,
  MESSAGES,
  SUPPORTED_LOCALES,
  translate,
} from './messages';

describe('i18n messages', () => {
  it('falls back to English and accepts only supported locales', () => {
    expect(DEFAULT_LOCALE).toBe('en');
    expect(isLocale('zh-CN')).toBe(true);
    expect(isLocale('zh-TW')).toBe(true);
    expect(isLocale('en')).toBe(true);
    expect(isLocale('en-US')).toBe(false);
  });

  it('contains a non-empty translation for every locale and message', () => {
    for (const message of Object.values(MESSAGES)) {
      for (const locale of SUPPORTED_LOCALES) {
        expect(message[locale].trim()).not.toBe('');
      }
    }
  });

  it('interpolates dynamic values without changing the selected language', () => {
    expect(translate('zh-CN', 'setup.ready', { value: 67 })).toBe('已就绪 67%');
    expect(translate('zh-TW', 'setup.ready', { value: 67 })).toBe('已就緒 67%');
    expect(translate('en', 'setup.ready', { value: 67 })).toBe('67% ready');
  });
});
