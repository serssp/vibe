import { DEFAULT_MODEL } from '../../domain/settings/model-preferences';
import type { AIProvider, ConnectionRequest, ConnectionResult } from '../ports/ai-provider';
import type { StorageRepository, SettingsSnapshot } from '../ports/storage-repository';
import { checkConnection } from './check-connection';

export interface SettingsActions {
  load(): SettingsSnapshot;
  save(apiKey: string, model: string): void;
  removeKey(model: string): void;
  check(request: ConnectionRequest): Promise<ConnectionResult>;
}

export function createSettingsActions(
  provider: AIProvider,
  storage: StorageRepository,
): SettingsActions {
  return {
    load() {
      try {
        return { ...storage.loadSettings(), storageAvailable: true };
      } catch {
        return { apiKey: '', model: DEFAULT_MODEL, storageAvailable: false };
      }
    },
    save(apiKey, model) {
      storage.saveSettings({ apiKey: apiKey.trim(), model: model.trim() });
    },
    removeKey(model) {
      storage.saveSettings({ apiKey: '', model: model.trim() });
    },
    check(request) {
      return checkConnection(provider, request);
    },
  };
}
