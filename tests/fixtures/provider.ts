import { vi } from 'vitest';
import type { LearningAIProvider } from '../../src/application/ports/learning-ai-provider';

export function mockProvider(): LearningAIProvider {
  return {
    promptVersions: { generation: '1', word: '1', grammar: '1' },
    check: vi.fn().mockResolvedValue({ text: 'Hallo!' }),
    generate: vi.fn().mockResolvedValue({
      title: 'Der Weg',
      sentences: ['Ich ging nach Hause.', 'Heute gehe ich spazieren.'],
      totalTokens: 80,
    }),
    translate: vi.fn().mockResolvedValue({
      card: {
        lemma: 'gehen',
        partOfSpeech: 'verb',
        article: null,
        gender: null,
        meaningRu: 'идти',
        formRu: 'ging — прошедшее время Präteritum',
        expression: 'ging',
        matchedVocabularyId: null,
      },
      totalTokens: 30,
    }),
    explain: vi.fn().mockResolvedValue({
      rules: [
        {
          titleRu: 'Прошедшее время',
          explanationRu: 'ging — форма Präteritum глагола gehen.',
          fragments: ['ging'],
          examples: [{ de: 'Er ging.', ru: 'Он шёл.' }],
        },
      ],
      totalTokens: 40,
    }),
  };
}
