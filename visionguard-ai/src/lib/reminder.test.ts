import { describe, expect, it } from 'vitest';
import {
  RETEST_REMINDER_DELAY_MS,
  createRetestReminderDueAt,
  getReminderCountdown,
  readReminderTimestamp,
  removeReminderTimestamp,
  writeReminderTimestamp,
  type ReminderTimestampStorage,
} from './reminder';

class MemoryStorage implements ReminderTimestampStorage {
  values = new Map<string, string>();
  reads = 0;
  writes = 0;
  removals = 0;

  getItem(key: string) {
    this.reads += 1;
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.writes += 1;
    this.values.set(key, value);
  }

  removeItem(key: string) {
    this.removals += 1;
    this.values.delete(key);
  }
}

describe('retest reminder time helpers', () => {
  it('creates a deadline exactly 20 minutes in the future', () => {
    expect(createRetestReminderDueAt(1_000)).toBe(1_000 + RETEST_REMINDER_DELAY_MS);
  });

  it('returns a live minute/second countdown and a due state', () => {
    expect(getReminderCountdown(121_250, 1_000)).toEqual({
      isDue: false,
      remainingMs: 120_250,
      totalSeconds: 121,
      minutes: 2,
      seconds: 1,
    });
    expect(getReminderCountdown(1_000, 1_001)).toEqual({
      isDue: true,
      remainingMs: 0,
      totalSeconds: 0,
      minutes: 0,
      seconds: 0,
    });
  });
});

describe('consent-aware reminder persistence', () => {
  it('does not read or write storage without persistence consent', () => {
    const storage = new MemoryStorage();
    storage.values.set('test-key', '12345');

    expect(readReminderTimestamp({ persistenceConsent: false, storage, storageKey: 'test-key' })).toBeNull();
    expect(writeReminderTimestamp(99_999, { persistenceConsent: false, storage, storageKey: 'test-key' })).toBe(false);
    expect(storage.reads).toBe(0);
    expect(storage.writes).toBe(0);
    expect(storage.values.get('test-key')).toBe('12345');
  });

  it('stores only the raw timestamp and restores it with consent', () => {
    const storage = new MemoryStorage();
    const options = { persistenceConsent: true, storage, storageKey: 'test-key' };

    expect(writeReminderTimestamp(1_234_567, options)).toBe(true);
    expect(storage.values.get('test-key')).toBe('1234567');
    expect(readReminderTimestamp(options)).toBe(1_234_567);
  });

  it('rejects malformed stored data and can clear an old timestamp', () => {
    const storage = new MemoryStorage();
    storage.values.set('test-key', '{"dueAt":123}');
    expect(
      readReminderTimestamp({ persistenceConsent: true, storage, storageKey: 'test-key' }),
    ).toBeNull();

    expect(removeReminderTimestamp({ storage, storageKey: 'test-key' })).toBe(true);
    expect(storage.values.has('test-key')).toBe(false);
  });
});
