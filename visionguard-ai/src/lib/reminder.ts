export const RETEST_REMINDER_DELAY_MS = 20 * 60 * 1000;
export const RETEST_REMINDER_STORAGE_KEY = 'visionguard.retestReminder.v1';

export interface ReminderTimestampStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface ReminderPersistenceOptions {
  persistenceConsent: boolean;
  storage?: ReminderTimestampStorage | null;
  storageKey?: string;
}

export interface ReminderCountdown {
  isDue: boolean;
  remainingMs: number;
  totalSeconds: number;
  minutes: number;
  seconds: number;
}

function browserStorage(): ReminderTimestampStorage | null {
  if (typeof window === 'undefined') return null;

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function resolveStorage(
  storage: ReminderTimestampStorage | null | undefined,
): ReminderTimestampStorage | null {
  return storage === undefined ? browserStorage() : storage;
}

function validTimestamp(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

/** Creates the fixed, local 20-minute retest deadline. */
export function createRetestReminderDueAt(
  now = Date.now(),
  delayMs = RETEST_REMINDER_DELAY_MS,
): number {
  if (!Number.isFinite(now) || !Number.isFinite(delayMs) || now < 0 || delayMs <= 0) {
    throw new RangeError('Reminder time and delay must be finite positive values.');
  }

  const dueAt = Math.trunc(now + delayMs);
  if (!validTimestamp(dueAt)) throw new RangeError('Reminder timestamp is out of range.');
  return dueAt;
}

/**
 * Reads a deadline only when the user has granted persistence consent.
 * The stored payload is a timestamp string, never a result, image, or settings object.
 */
export function readReminderTimestamp(options: ReminderPersistenceOptions): number | null {
  if (!options.persistenceConsent) return null;
  const storage = resolveStorage(options.storage);
  if (!storage) return null;

  try {
    const stored = storage.getItem(options.storageKey ?? RETEST_REMINDER_STORAGE_KEY);
    if (stored === null || !/^\d+$/.test(stored)) return null;
    const timestamp = Number(stored);
    return validTimestamp(timestamp) ? timestamp : null;
  } catch {
    return null;
  }
}

/** Persists exactly one timestamp when consent is enabled; otherwise it is a no-op. */
export function writeReminderTimestamp(
  dueAt: number,
  options: ReminderPersistenceOptions,
): boolean {
  if (!validTimestamp(dueAt)) throw new RangeError('Reminder timestamp must be a positive integer.');
  if (!options.persistenceConsent) return false;
  const storage = resolveStorage(options.storage);
  if (!storage) return false;

  try {
    storage.setItem(options.storageKey ?? RETEST_REMINDER_STORAGE_KEY, String(dueAt));
    return true;
  } catch {
    return false;
  }
}

/** Removes an old deadline, including when consent has just been withdrawn. */
export function removeReminderTimestamp(
  options: Pick<ReminderPersistenceOptions, 'storage' | 'storageKey'> = {},
): boolean {
  const storage = resolveStorage(options.storage);
  if (!storage) return false;

  try {
    storage.removeItem(options.storageKey ?? RETEST_REMINDER_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

export function getReminderCountdown(dueAt: number, now = Date.now()): ReminderCountdown {
  const remainingMs = Math.max(0, dueAt - now);
  const totalSeconds = Math.ceil(remainingMs / 1000);

  return {
    isDue: remainingMs === 0,
    remainingMs,
    totalSeconds,
    minutes: Math.floor(totalSeconds / 60),
    seconds: totalSeconds % 60,
  };
}
