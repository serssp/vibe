import { describe, expect, it } from 'vitest';
import { InvalidLearningData, validateLearningWrite } from '../src/domain/learning/validation';
import { learningFixture, readingSession } from './fixtures/learning';

describe('Learning data validation', () => {
  it('accepts the complete model and all session states without browser globals', () => {
    expect(() => validateLearningWrite(learningFixture())).not.toThrow();
    for (const status of ['New', 'InProgress', 'Completed'] as const)
      expect(() => validateLearningWrite({ sessions: [readingSession(status)] })).not.toThrow();
  });

  it('accepts ISO UTC timestamps with or without milliseconds', () => {
    const data = learningFixture();
    data.texts![0]!.createdAt = '2026-10-13T10:00:00Z';
    expect(() => validateLearningWrite(data)).not.toThrow();
  });

  it.each([
    [
      'nonexistent calendar date',
      (d: ReturnType<typeof learningFixture>) => {
        d.texts![0]!.createdAt = '2026-02-30T10:00:00.000Z';
      },
    ],
    [
      'non-UTC date',
      (d: ReturnType<typeof learningFixture>) => {
        d.texts![0]!.createdAt = '2026-10-13T12:00:00+02:00';
      },
    ],
    [
      'duplicate sentence IDs',
      (d: ReturnType<typeof learningFixture>) => {
        d.texts![0]!.sentences[1]!.id = 'text-1:1';
      },
    ],
    [
      'inconsistent full text',
      (d: ReturnType<typeof learningFixture>) => {
        d.texts![0]!.content = 'Another text.';
      },
    ],
    [
      'unrequested included word',
      (d: ReturnType<typeof learningFixture>) => {
        d.texts![0]!.includedVocabularyIds = ['other'];
      },
    ],
    [
      'negative reading position',
      (d: ReturnType<typeof learningFixture>) => {
        d.sessions![0]!.readingPosition.scrollOffset = -1;
      },
    ],
    [
      'incomplete completion metadata',
      (d: ReturnType<typeof learningFixture>) => {
        d.sessions![0]!.completedAt = null;
      },
    ],
    [
      'completion before start',
      (d: ReturnType<typeof learningFixture>) => {
        d.sessions![0]!.completedAt = '2026-10-12T10:00:00.000Z';
      },
    ],
    [
      'fractional counter',
      (d: ReturnType<typeof learningFixture>) => {
        d.vocabulary![0]!.unknownCount = 1.5;
      },
    ],
    [
      'non-finite counter',
      (d: ReturnType<typeof learningFixture>) => {
        d.vocabulary![0]!.exposureCount = Infinity;
      },
    ],
    [
      'invalid CEFR level',
      (d: ReturnType<typeof learningFixture>) => {
        Object.assign(d.appSettings!, { cefrLevel: 'C2' });
      },
    ],
    [
      'invalid duration',
      (d: ReturnType<typeof learningFixture>) => {
        Object.assign(d.appSettings!, { targetDuration: 6 });
      },
    ],
    [
      'missing undo target',
      (d: ReturnType<typeof learningFixture>) => {
        d.interactions![0]!.action = 'UndoMarkUnknown';
      },
    ],
    [
      'empty grammar rules',
      (d: ReturnType<typeof learningFixture>) => {
        d.explanations![0]!.explanation.rules = [];
      },
    ],
    [
      'duplicate IDs within a write',
      (d: ReturnType<typeof learningFixture>) => {
        d.texts!.push(d.texts![0]!);
      },
    ],
    [
      'API key in settings',
      (d: ReturnType<typeof learningFixture>) => {
        Object.assign(d.appSettings!, { apiKey: 'test-credential' });
      },
    ],
    [
      'unknown nested settings field',
      (d: ReturnType<typeof learningFixture>) => {
        Object.assign(d.appSettings!.ui, { credential: 'test-credential' });
      },
    ],
    [
      'unknown top-level field',
      (d: ReturnType<typeof learningFixture>) => {
        Object.assign(d, { apiKey: 'test-credential' });
      },
    ],
    [
      'API key attached to an array',
      (d: ReturnType<typeof learningFixture>) => {
        Object.assign(d.texts![0]!.sentences, { apiKey: 'test-credential' });
      },
    ],
  ])('rejects %s', (_name, mutate) => {
    const data = learningFixture();
    mutate(data);
    expect(() => validateLearningWrite(data)).toThrow(InvalidLearningData);
  });

  it.each([null, [], '', { texts: null }, { appSettings: {} }])(
    'rejects malformed input %#',
    (data) => {
      expect(() => validateLearningWrite(data)).toThrow(InvalidLearningData);
    },
  );
});
