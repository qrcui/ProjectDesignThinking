import { DEFAULT_LOCALE, isLocale, type Locale } from './messages';

/**
 * Maps the browser's primary UI language to one of the languages the app ships.
 * Generic Chinese and Hans locales use Simplified Chinese; Hant and the common
 * Traditional-Chinese regions use Traditional Chinese. Unsupported or missing
 * device languages deliberately fall back to English so the language picker is
 * discoverable to users who cannot read Chinese.
 */
export function mapDeviceLanguage(language: string | null | undefined): Locale {
  if (!language?.trim()) return DEFAULT_LOCALE;

  const normalized = language.trim().replaceAll('_', '-').toLowerCase();

  if (normalized === 'zh' || normalized.startsWith('zh-')) {
    const parts = normalized.split('-');
    const usesTraditionalChinese = parts.some((part) =>
      ['hant', 'tw', 'hk', 'mo'].includes(part),
    );
    return usesTraditionalChinese ? 'zh-TW' : 'zh-CN';
  }

  if (normalized === 'en' || normalized.startsWith('en-')) return 'en';
  return DEFAULT_LOCALE;
}

export function detectDeviceLocale(
  languages: readonly string[] | null | undefined,
  language: string | null | undefined,
): Locale {
  const primaryLanguage = languages?.find((candidate) => candidate.trim()) ?? language;
  return mapDeviceLanguage(primaryLanguage);
}

/** A valid saved user choice always wins over device-language detection. */
export function resolveInitialLocale(
  savedLocale: unknown,
  languages: readonly string[] | null | undefined,
  language: string | null | undefined,
): Locale {
  return isLocale(savedLocale)
    ? savedLocale
    : detectDeviceLocale(languages, language);
}
