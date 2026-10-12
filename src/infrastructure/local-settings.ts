export const KEY_STORAGE = 'vibe.openai-api-key';
const MODEL_STORAGE = 'vibe.openai-model';

export function loadSettings() {
  try {
    return {
      apiKey: localStorage.getItem(KEY_STORAGE) ?? '',
      model: localStorage.getItem(MODEL_STORAGE) ?? 'gpt-4.1-mini',
      storageAvailable: true,
    };
  } catch {
    return { apiKey: '', model: 'gpt-4.1-mini', storageAvailable: false };
  }
}

export function saveSettings(apiKey: string, model: string): void {
  if (apiKey) localStorage.setItem(KEY_STORAGE, apiKey);
  else localStorage.removeItem(KEY_STORAGE);
  localStorage.setItem(MODEL_STORAGE, model);
}
