import type { LearningWrite } from '../../src/domain/learning/data';
import type { ReadingSession, TextDocument } from '../../src/domain/reading/models';
import type { VocabularyEntry } from '../../src/domain/vocabulary/models';

export const startedAt = '2026-10-13T10:00:00.000Z';
export const completedAt = '2026-10-13T10:04:00.000Z';

export function vocabularyEntry(id = 'word-1', senseKey = 'gehen:move'): VocabularyEntry {
  return {
    id,
    lemma: 'gehen',
    partOfSpeech: 'verb',
    article: null,
    meaningRu: 'идти',
    senseKey,
    status: 'Unknown',
    createdAt: startedAt,
    lastMarkedAt: startedAt,
    unknownCount: 1,
    exposureCount: 0,
  };
}

export function textDocument(id = 'text-1'): TextDocument {
  return {
    id,
    title: 'Ein Spaziergang',
    content: 'Ich gehe nach Hause. Es ist schön.',
    sentences: [
      { id: `${id}:1`, content: 'Ich gehe nach Hause.' },
      { id: `${id}:2`, content: 'Es ist schön.' },
    ],
    cefrLevel: 'A1',
    targetDuration: 3,
    createdAt: startedAt,
    aiModel: 'test-model',
    promptVersion: '1',
    targetVocabularyIds: ['word-1'],
    includedVocabularyIds: ['word-1'],
  };
}

export function readingSession(status: ReadingSession['status'] = 'InProgress'): ReadingSession {
  return {
    id: 'session-1',
    textId: 'text-1',
    status,
    startedAt: status === 'New' ? null : startedAt,
    completedAt: status === 'Completed' ? completedAt : null,
    readingPosition: { sentenceId: 'text-1:1', scrollOffset: 140 },
    reviewCandidateIds: ['word-1'],
  };
}

export function learningFixture(): LearningWrite {
  return {
    texts: [textDocument()],
    sessions: [readingSession('Completed')],
    vocabulary: [vocabularyEntry()],
    interactions: [
      {
        id: 'interaction-1',
        sessionId: 'session-1',
        textId: 'text-1',
        vocabularyEntryId: 'word-1',
        surfaceForm: 'gehe',
        sentenceId: 'text-1:1',
        action: 'MarkUnknown',
        undoesInteractionId: null,
        timestamp: startedAt,
      },
    ],
    exposures: [
      {
        id: 'exposure-1',
        sessionId: 'session-1',
        vocabularyEntryId: 'word-1',
        markedUnknown: true,
        occurredAt: completedAt,
      },
    ],
    explanations: [
      {
        id: 'grammar-1',
        textId: 'text-1',
        sentenceId: 'text-1:1',
        cefrLevel: 'A1',
        explanation: {
          rules: [
            {
              titleRu: 'Настоящее время',
              explanationRu: 'Форма глагола для ich.',
              fragments: ['Ich', 'gehe'],
              examples: [{ de: 'Ich gehe.', ru: 'Я иду.' }],
            },
          ],
        },
        aiModel: 'test-model',
        promptVersion: '1',
        createdAt: startedAt,
      },
    ],
    appSettings: {
      id: 'app',
      activeSessionId: null,
      model: 'test-model',
      cefrLevel: 'A1',
      targetDuration: 3,
      ui: { fontScale: 1 },
    },
  };
}
