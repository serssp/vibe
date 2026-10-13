import { createSettingsActions } from '../application/use-cases/settings';
import { OpenAIConnectionProvider } from '../infrastructure/ai/openai-connection';
import { LocalSettingsRepository } from '../infrastructure/storage/local-settings';
import { IndexedDbLearningRepository } from '../infrastructure/storage/indexeddb-learning';
import { BrowserRuntime } from '../infrastructure/browser-runtime';
import { createGenerationActions } from '../application/use-cases/generate-text';
import { createWordActions } from '../application/use-cases/lookup-word';
import { createGrammarActions } from '../application/use-cases/explain-grammar';

export function createServices() {
  const provider = new OpenAIConnectionProvider();
  const learning = new IndexedDbLearningRepository();
  const runtime = new BrowserRuntime();
  return {
    settings: createSettingsActions(provider, new LocalSettingsRepository()),
    learning,
    generation: createGenerationActions(provider, learning, runtime),
    words: createWordActions(provider, learning, runtime),
    grammar: createGrammarActions(provider, learning, runtime),
  };
}
