import {
  defaultAppearance,
  validAppearance,
  type ReaderAppearance,
} from '../../domain/settings/reader-appearance';
import type { ReaderPreferencesRepository } from '../../application/ports/reader-preferences';
import { DEFAULT_MODEL } from '../../domain/settings/model-preferences';
import type {
  ConnectionSettings,
  StorageRepository,
} from '../../application/ports/storage-repository';

const KEY_STORAGE = 'vibe.openai-api-key';
const MODEL_STORAGE = 'vibe.openai-model';

export class LocalSettingsRepository implements StorageRepository, ReaderPreferencesRepository {
  constructor(
    private readonly getStorage: () => Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> = () =>
      globalThis.localStorage,
  ) {}

  loadAppearance(): ReaderAppearance {
    const raw = this.getStorage().getItem('vibe.reader-appearance');
    if (!raw) return { ...defaultAppearance };
    try {
      const value: unknown = JSON.parse(raw);
      return validAppearance(value) ? value : { ...defaultAppearance };
    } catch {
      return { ...defaultAppearance };
    }
  }

  saveAppearance(appearance: ReaderAppearance): void {
    if (!validAppearance(appearance)) throw new Error('Invalid reader appearance');
    this.getStorage().setItem('vibe.reader-appearance', JSON.stringify(appearance));
  }

  loadSettings(): ConnectionSettings {
    const storage = this.getStorage();
    return {
      apiKey: storage.getItem(KEY_STORAGE) ?? '',
      model: storage.getItem(MODEL_STORAGE) ?? DEFAULT_MODEL,
    };
  }

  saveSettings({ apiKey, model }: ConnectionSettings): void {
    const storage = this.getStorage();
    if (apiKey) storage.setItem(KEY_STORAGE, apiKey);
    else storage.removeItem(KEY_STORAGE);
    storage.setItem(MODEL_STORAGE, model);
  }
}
