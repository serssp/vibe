import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { createBackupActions } from '../src/application/use-cases/backup';
import { IndexedDbLearningRepository } from '../src/infrastructure/storage/indexeddb-learning';
import {
  learningFixture,
  textDocument,
  readingSession,
  vocabularyEntry,
} from './fixtures/learning';

function setup() {
  const repository = new IndexedDbLearningRepository({ getFactory: () => new IDBFactory() });
  const backups = createBackupActions(repository, {
    id: () => 'backup',
    now: () => '2026-10-13T12:00:00.000Z',
  });
  return { repository, backups };
}

describe('Versioned learning backups', () => {
  it('round trips all primary data, keeps IDs, and excludes credentials', async () => {
    const { repository, backups } = setup();
    await repository.commit(learningFixture());
    const content = await backups.exportData();
    const preview = backups.preview(content);
    expect(content).not.toMatch(/apiKey|test-credential|vibe.openai-api-key/);
    expect(JSON.parse(content)).toMatchObject({ format: 'vibe-learning', version: 1 });
    await repository.commit({ texts: [textDocument('extra-text')] });
    await backups.restore(preview);
    expect(await repository.getText('extra-text')).toBeUndefined();
    expect(await repository.snapshot()).toEqual(preview);
    await repository.close();
  });
  it.each(['legacy', 'dictionary'])(
    'round trips %s word cards without a migration',
    async (kind) => {
      const { repository, backups } = setup();
      const card = {
        lemma: 'gehen',
        partOfSpeech: 'verb' as const,
        article: null,
        gender: null,
        meaningRu: 'идти',
        formRu: 'Настоящее время.',
        expression: 'gehe',
        matchedVocabularyId: null,
        ...(kind === 'dictionary'
          ? {
              nounPlural: null,
              irregularVerb: { preterite: 'ging', perfect: 'ist gegangen' },
            }
          : {}),
      };
      await repository.commit({
        ...learningFixture(),
        wordTranslations: [
          {
            id: 'translation-1',
            textId: 'text-1',
            sentenceId: 'text-1:1',
            start: 4,
            end: 8,
            aiModel: 'test-model',
            promptVersion: kind === 'dictionary' ? '2' : '1',
            vocabularyEntryId: 'word-1',
            card,
          },
        ],
      });
      const content = await backups.exportData();
      const preview = backups.preview(content);
      await backups.restore(preview);
      expect((await repository.snapshot()).wordTranslations[0]!.card).toEqual(card);
      const invalid = JSON.parse(content);
      invalid.data.wordTranslations[0].card.irregularVerb = {
        preterite: 'ging',
        perfect: 'ist gegangen',
        apiKey: 'test-credential',
      };
      expect(() => backups.preview(JSON.stringify(invalid))).toThrow('некорректен');
      expect((await repository.snapshot()).wordTranslations[0]!.card).toEqual(card);
      await repository.close();
    },
  );
  it('preserves valid UTC timestamps with and without milliseconds', async () => {
    const { repository, backups } = setup();
    const fixture = learningFixture();
    fixture.sessions![0]!.startedAt = '2026-10-13T10:00:00Z';
    fixture.interactions![0]!.timestamp = '2026-10-13T10:00:00.001Z';
    await repository.commit(fixture);
    const preview = backups.preview(await backups.exportData());
    expect(preview.sessions[0]!.startedAt).toBe('2026-10-13T10:00:00Z');
    await backups.restore(preview);
    await repository.close();
  });
  it('exports and restores an empty database', async () => {
    const { repository, backups } = setup();
    const preview = backups.preview(await backups.exportData());
    await backups.restore(preview);
    expect(preview.texts).toEqual([]);
    await repository.close();
  });
  it.each([
    'version',
    'format',
    'unknown-fields',
    'references',
    'duplicates',
    'missing-store',
    'secret',
    'sentence',
    'exposure',
    'active-sessions',
    'grammar-fragment',
  ])('rejects invalid %s before replacement and preserves the current database', async (kind) => {
    const { repository, backups } = setup();
    await repository.commit(learningFixture());
    const before = await repository.snapshot();
    const envelope = JSON.parse(await backups.exportData());
    if (kind === 'version') envelope.version = 999;
    if (kind === 'format') envelope.format = 'foreign';
    if (kind === 'unknown-fields') envelope.extra = true;
    if (kind === 'references') envelope.data.sessions[0].textId = 'missing';
    if (kind === 'duplicates') envelope.data.vocabulary.push(envelope.data.vocabulary[0]);
    if (kind === 'missing-store') delete envelope.data.wordLookups;
    if (kind === 'secret') envelope.data.appSettings.apiKey = 'test-credential';
    if (kind === 'sentence') envelope.data.sessions[0].readingPosition.sentenceId = 'missing';
    if (kind === 'exposure') envelope.data.exposures[0].occurredAt = '2026-10-13T10:00:00.000Z';
    if (kind === 'active-sessions')
      envelope.data.sessions.push(readingSession(), { ...readingSession(), id: 'second-active' });
    if (kind === 'grammar-fragment')
      envelope.data.explanations[0].explanation.rules[0].fragments = ['invented'];
    expect(() => backups.preview(JSON.stringify(envelope))).toThrow('некорректен');
    expect(await repository.snapshot()).toEqual(before);
    await repository.close();
  });
  it('rolls back clears and partially written imports after a simulated capacity failure', async () => {
    const { repository, backups } = setup();
    await repository.commit(learningFixture());
    const before = await repository.snapshot();
    const incoming = backups.preview(await backups.exportData());
    incoming.texts.push(textDocument('extra-text'));
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === 'sessions') throw new Error('Synthetic capacity failure');
      return original.apply(this, args);
    };
    try {
      await expect(backups.restore(incoming)).rejects.toThrow('Не удалось сохранить');
    } finally {
      IDBObjectStore.prototype.put = original;
    }
    expect(await repository.snapshot()).toEqual(before);
    await repository.close();
  });
  it('revalidates mutable preview data at restore time, so changed references cannot bypass validation', async () => {
    const { repository, backups } = setup();
    await repository.commit(learningFixture());
    const before = await repository.snapshot();
    const preview = backups.preview(await backups.exportData());
    preview.texts[0]!.targetVocabularyIds.push('missing');
    await expect(backups.restore(preview)).rejects.toMatchObject({ code: 'invalid-data' });
    expect(await repository.snapshot()).toEqual(before);
    await repository.close();
  });
  it('loads 2000 retained documents with distinct session history without truncating storage', async () => {
    const { repository } = setup();
    const texts = Array.from({ length: 2000 }, (_, index) => textDocument(`history-${index}`));
    const sessions = texts.map((text, index) => ({
      ...readingSession('Completed'),
      id: `session-${index}`,
      textId: text.id,
      readingPosition: { sentenceId: text.sentences[0]!.id, scrollOffset: 0 },
    }));
    await repository.commit({ texts, sessions, vocabulary: [vocabularyEntry()] });
    const history = await repository.listHistory();
    expect(history).toHaveLength(2000);
    expect(history.every((item) => item.sessions.length === 1)).toBe(true);
    expect((await repository.snapshot()).texts).toHaveLength(2000);
    await repository.close();
  });
});
