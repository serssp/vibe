import { describe, expect, it, vi } from 'vitest';
import { ConnectionError, type AIProvider } from '../src/application/ports/ai-provider';
import type { StorageRepository } from '../src/application/ports/storage-repository';
import { createSettingsActions } from '../src/application/use-cases/settings';
import { LocalSettingsRepository } from '../src/infrastructure/storage/local-settings';

function setup() {
  const provider: AIProvider = { check: vi.fn().mockResolvedValue({ text: 'Hallo!' }) };
  const storage: StorageRepository = {
    loadSettings: vi.fn().mockReturnValue({ apiKey: 'saved-credential', model: 'saved-model' }),
    saveSettings: vi.fn(),
  };
  return { provider, storage, settings: createSettingsActions(provider, storage) };
}

describe('Settings application scenarios', () => {
  it('loads existing settings without calling AI', () => {
    const { settings, provider } = setup();
    expect(settings.load()).toEqual({
      apiKey: 'saved-credential',
      model: 'saved-model',
      storageAvailable: true,
    });
    expect(provider.check).not.toHaveBeenCalled();
  });

  it('allows an in-memory connection check when storage is unavailable', async () => {
    const { settings, storage, provider } = setup();
    vi.mocked(storage.loadSettings).mockImplementation(() => {
      throw new Error('storage unavailable');
    });
    expect(settings.load()).toMatchObject({ apiKey: '', storageAvailable: false });
    await expect(
      settings.check({
        apiKey: 'temporary-credential',
        model: 'test-model',
        signal: new AbortController().signal,
      }),
    ).resolves.toEqual({ text: 'Hallo!' });
    expect(provider.check).toHaveBeenCalledTimes(1);
    expect(storage.saveSettings).not.toHaveBeenCalled();
  });

  it('saves a replacement credential through the repository with normalized values', () => {
    const { settings, storage, provider } = setup();
    settings.save(' replacement-credential ', ' replacement-model ');
    expect(storage.saveSettings).toHaveBeenCalledWith({
      apiKey: 'replacement-credential',
      model: 'replacement-model',
    });
    expect(provider.check).not.toHaveBeenCalled();
  });

  it('removes the key through the repository while keeping the selected model', () => {
    const { settings, storage } = setup();
    settings.removeKey(' test-model ');
    expect(storage.saveSettings).toHaveBeenCalledWith({ apiKey: '', model: 'test-model' });
  });

  it('propagates save failure instead of reporting a successful save', () => {
    const { settings, storage } = setup();
    vi.mocked(storage.saveSettings).mockImplementation(() => {
      throw new Error('storage unavailable');
    });
    expect(() => settings.save('test-credential', 'test-model')).toThrow();
  });

  it('does not change persisted settings when AI fails', async () => {
    const { settings, storage, provider } = setup();
    vi.mocked(provider.check).mockRejectedValue(
      new ConnectionError('Не удалось связаться с OpenAI.'),
    );
    await expect(
      settings.check({
        apiKey: 'test-credential',
        model: 'test-model',
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow(ConnectionError);
    expect(storage.saveSettings).not.toHaveBeenCalled();
    expect(settings.load()).toMatchObject({ apiKey: 'saved-credential', model: 'saved-model' });
  });
});

describe('Local settings repository compatibility', () => {
  it('reads the original stage 0 storage keys and supports replacement and deletion', () => {
    const data = new Map([
      ['vibe.openai-api-key', 'existing-credential'],
      ['vibe.openai-model', 'existing-model'],
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
    expect(repository.loadSettings()).toEqual({
      apiKey: 'existing-credential',
      model: 'existing-model',
    });
    repository.saveSettings({ apiKey: 'replacement-credential', model: 'new-model' });
    expect(repository.loadSettings()).toEqual({
      apiKey: 'replacement-credential',
      model: 'new-model',
    });
    repository.saveSettings({ apiKey: '', model: 'new-model' });
    expect(data.has('vibe.openai-api-key')).toBe(false);
    expect(repository.loadSettings()).toEqual({ apiKey: '', model: 'new-model' });
  });

  it('does not access browser storage until an application action is run', () => {
    const getStorage = vi.fn().mockImplementation(() => {
      throw new Error('storage unavailable');
    });
    const repository = new LocalSettingsRepository(getStorage);
    expect(getStorage).not.toHaveBeenCalled();
    expect(() => repository.loadSettings()).toThrow('storage unavailable');
  });
});
