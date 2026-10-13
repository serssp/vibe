import { createSettingsActions } from '../application/use-cases/settings';
import { OpenAIConnectionProvider } from '../infrastructure/ai/openai-connection';
import { LocalSettingsRepository } from '../infrastructure/storage/local-settings';

export function createServices() {
  return {
    settings: createSettingsActions(new OpenAIConnectionProvider(), new LocalSettingsRepository()),
  };
}
