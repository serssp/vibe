import {
  defaultAppearance,
  validAppearance,
  type ReaderAppearance,
} from '../../domain/settings/reader-appearance';
import type { ReaderPreferencesRepository } from '../ports/reader-preferences';

export function createReaderPreferences(repository: ReaderPreferencesRepository) {
  return {
    load(): ReaderAppearance {
      try {
        const appearance = repository.loadAppearance();
        return validAppearance(appearance) ? appearance : { ...defaultAppearance };
      } catch {
        return { ...defaultAppearance };
      }
    },
    save(appearance: ReaderAppearance) {
      if (!validAppearance(appearance)) throw new Error('Некорректные настройки чтения.');
      repository.saveAppearance(appearance);
    },
  };
}

export type ReaderPreferences = ReturnType<typeof createReaderPreferences>;
