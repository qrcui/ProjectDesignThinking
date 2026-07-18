import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { STORAGE_KEYS } from '../constants';
import { readStorage, writeStorage } from '../lib/storage';
import {
  translate,
  type Locale,
  type MessageKey,
  type TranslationParams,
} from './messages';
import { resolveInitialLocale } from './locale';

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: MessageKey, params?: TranslationParams) => string;
  plural: (
    count: number,
    oneKey: MessageKey,
    otherKey: MessageKey,
    params?: TranslationParams,
  ) => string;
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
  formatDateTime: (
    value: Date | number | string,
    options?: Intl.DateTimeFormatOptions,
  ) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

function initialLocale(): Locale {
  const saved = readStorage<unknown>(STORAGE_KEYS.language, null);
  const languages = typeof navigator === 'undefined' ? undefined : navigator.languages;
  const language = typeof navigator === 'undefined' ? undefined : navigator.language;
  const locale = resolveInitialLocale(saved, languages, language);

  // Apply the detected language during the first React render, before effects
  // run, so language-specific typography does not briefly use the wrong rules.
  if (typeof document !== 'undefined') document.documentElement.lang = locale;
  return locale;
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(initialLocale);

  const t = useCallback(
    (key: MessageKey, params?: TranslationParams) => translate(locale, key, params),
    [locale],
  );

  const plural = useCallback(
    (
      count: number,
      oneKey: MessageKey,
      otherKey: MessageKey,
      params: TranslationParams = {},
    ) => {
      const selectedKey = new Intl.PluralRules(locale).select(count) === 'one' ? oneKey : otherKey;
      return translate(locale, selectedKey, { ...params, count });
    },
    [locale],
  );

  const formatNumber = useCallback(
    (value: number, options?: Intl.NumberFormatOptions) =>
      new Intl.NumberFormat(locale, options).format(value),
    [locale],
  );

  const formatDateTime = useCallback(
    (value: Date | number | string, options?: Intl.DateTimeFormatOptions) =>
      new Intl.DateTimeFormat(locale, options).format(
        value instanceof Date ? value : new Date(value),
      ),
    [locale],
  );

  useEffect(() => {
    writeStorage(STORAGE_KEYS.language, locale);
    document.documentElement.lang = locale;
    document.title = translate(locale, 'meta.title');
    document
      .querySelector<HTMLMetaElement>('meta[name="description"]')
      ?.setAttribute('content', translate(locale, 'meta.description'));
  }, [locale]);

  const value = useMemo<I18nContextValue>(
    () => ({ locale, setLocale, t, plural, formatNumber, formatDateTime }),
    [formatDateTime, formatNumber, locale, plural, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) throw new Error('useI18n must be used inside I18nProvider');
  return context;
}
