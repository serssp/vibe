import { describe, expect, it } from 'vitest';
import { LocalSettingsRepository } from '../src/infrastructure/storage/local-settings';
import { createReaderPreferences } from '../src/application/use-cases/reader-preferences';
import { defaultAppearance } from '../src/domain/settings/reader-appearance';

describe('Reader preferences compatibility', () => {
  it('uses safe defaults for missing, malformed and unsupported preferences', () => {
    for (const raw of [
      null,
      '{',
      '{}',
      JSON.stringify({ ...defaultAppearance, size: 50 }),
      JSON.stringify({ ...defaultAppearance, size: null }),
      JSON.stringify({ ...defaultAppearance, extra: true }),
    ]) {
      const repository = new LocalSettingsRepository(() => ({
        getItem: () => raw,
        setItem: () => {},
        removeItem: () => {},
      }));
      expect(createReaderPreferences(repository).load()).toEqual(defaultAppearance);
    }
    const repository = new LocalSettingsRepository(() => {
      throw new Error('Storage blocked');
    });
    expect(createReaderPreferences(repository).load()).toEqual(defaultAppearance);
  });

  it('persists appearance independently of the original connection keys and rejects invalid writes', () => {
    const data = new Map([
      ['vibe.openai-api-key', 'test-credential'],
      ['vibe.openai-model', 'test-model'],
    ]);
    const repository = new LocalSettingsRepository(() => ({
      getItem: (key) => data.get(key) ?? null,
      setItem: (key, value) => {
        data.set(key, value);
      },
      removeItem: (key) => {
        data.delete(key);
      },
    }));
    const preferences = createReaderPreferences(repository);
    const appearance = {
      ...defaultAppearance,
      family: 'sans' as const,
      size: 1.8,
      sentencePerLine: true,
    };
    preferences.save(appearance);
    expect(preferences.load()).toEqual(appearance);
    expect(repository.loadSettings()).toEqual({ apiKey: 'test-credential', model: 'test-model' });
    const before = new Map(data);
    expect(() => preferences.save({ ...appearance, size: Number.NaN })).toThrow();
    expect(data).toEqual(before);
  });
});
