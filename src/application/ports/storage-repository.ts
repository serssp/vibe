import type { ModelPreferences } from '../../domain/settings/model-preferences';

export interface ConnectionSettings extends ModelPreferences {
  apiKey: string;
}

export interface SettingsSnapshot extends ConnectionSettings {
  storageAvailable: boolean;
}

export interface StorageRepository {
  loadSettings(): ConnectionSettings;
  saveSettings(settings: ConnectionSettings): void;
}
