import type { ReaderAppearance } from '../../domain/settings/reader-appearance';

export interface ReaderPreferencesRepository {
  loadAppearance(): ReaderAppearance;
  saveAppearance(appearance: ReaderAppearance): void;
}
