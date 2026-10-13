import { IDBFactory } from 'fake-indexeddb';
import { afterEach, describe, expect, it } from 'vitest';
import { IndexedDbLearningRepository } from '../src/infrastructure/storage/indexeddb-learning';
import { LearningStorageError } from '../src/application/ports/learning-repository';
import {
  learningFixture,
  readingSession,
  textDocument,
  vocabularyEntry,
} from './fixtures/learning';

const repositories: IndexedDbLearningRepository[] = [];
function setup(factory = new IDBFactory()) {
  const options = { getFactory: () => factory, name: 'test-learning' };
  const repository = new IndexedDbLearningRepository(options);
  repositories.push(repository);
  return { factory, options, repository };
}
afterEach(async () => {
  await Promise.all(repositories.splice(0).map((repository) => repository.close()));
});

describe('IndexedDB learning repository', () => {
  it('atomically saves and retrieves every entity and missing records', async () => {
    const { repository } = setup();
    const data = learningFixture();
    await repository.commit(data);
    expect(await repository.getText('text-1')).toEqual(data.texts![0]);
    expect(await repository.getSession('session-1')).toEqual(data.sessions![0]);
    expect(await repository.getVocabularyEntry('word-1')).toEqual(data.vocabulary![0]);
    expect(await repository.getGrammarExplanation('grammar-1')).toEqual(data.explanations![0]);
    expect(await repository.getWordInteractions('session-1')).toEqual(data.interactions);
    expect(await repository.getWordExposures('session-1')).toEqual(data.exposures);
    expect(await repository.getAppSettings()).toEqual(data.appSettings);
    expect(await repository.getText('missing')).toBeUndefined();
    expect(await repository.getSession('missing')).toBeUndefined();
    expect(await repository.getVocabularyEntry('missing')).toBeUndefined();
    expect(await repository.getGrammarExplanation('missing')).toBeUndefined();
    expect(await repository.getWordInteractions('missing')).toEqual([]);
    expect(await repository.getWordExposures('missing')).toEqual([]);
  });

  it('preserves data and sentence IDs after closing and reopening the database', async () => {
    const { repository, options } = setup();
    await repository.commit(learningFixture());
    await repository.close();
    const reopened = new IndexedDbLearningRepository(options);
    repositories.push(reopened);
    expect(await reopened.getText('text-1')).toEqual(textDocument());
    expect(await reopened.getSession('session-1')).toEqual(readingSession('Completed'));
  });

  it('repeated and concurrent identical writes produce one interaction and exposure', async () => {
    const { repository, options } = setup();
    const second = new IndexedDbLearningRepository(options);
    repositories.push(second);
    await Promise.all([repository.commit(learningFixture()), second.commit(learningFixture())]);
    await repository.commit(learningFixture());
    expect(await repository.getWordInteractions('session-1')).toHaveLength(1);
    expect(await repository.getWordExposures('session-1')).toHaveLength(1);
  });

  it('copies the write before async IO and returns independent read snapshots', async () => {
    const { repository } = setup();
    const data = learningFixture();
    const writing = repository.commit(data);
    data.texts![0]!.sentences[0]!.content = 'mutated';
    await writing;
    const saved = await repository.getText('text-1');
    saved!.sentences[0]!.content = 'mutated again';
    expect(await repository.getText('text-1')).toEqual(textDocument());
  });

  it('allows vocabulary with identical spelling but different senses', async () => {
    const { repository } = setup();
    await repository.commit({
      vocabulary: [vocabularyEntry(), vocabularyEntry('word-2', 'gehen:work')],
    });
    expect(await repository.getVocabularyEntry('word-2')).toMatchObject({ senseKey: 'gehen:work' });
  });

  it('updates session position, vocabulary state and settings without replacing history', async () => {
    const { repository } = setup();
    await repository.commit({
      vocabulary: [vocabularyEntry()],
      texts: [textDocument()],
      sessions: [readingSession()],
    });
    const session = readingSession();
    session.readingPosition = { sentenceId: 'text-1:2', scrollOffset: 300 };
    await repository.commit({
      sessions: [session],
      vocabulary: [{ ...vocabularyEntry(), status: 'Learned', exposureCount: 1 }],
      appSettings: learningFixture().appSettings,
    });
    expect(await repository.getSession('session-1')).toEqual(session);
    expect(await repository.getVocabularyEntry('word-1')).toMatchObject({
      status: 'Learned',
      exposureCount: 1,
    });
    expect(await repository.getText('text-1')).toEqual(textDocument());
  });

  it.each([
    [
      'text vocabulary',
      (d: ReturnType<typeof learningFixture>) => {
        d.vocabulary = [];
      },
    ],
    [
      'session text',
      (d: ReturnType<typeof learningFixture>) => {
        d.sessions![0]!.textId = 'missing';
      },
    ],
    [
      'session sentence',
      (d: ReturnType<typeof learningFixture>) => {
        d.sessions![0]!.readingPosition.sentenceId = 'missing';
      },
    ],
    [
      'review candidate',
      (d: ReturnType<typeof learningFixture>) => {
        d.sessions![0]!.reviewCandidateIds.push('missing');
      },
    ],
    [
      'interaction session',
      (d: ReturnType<typeof learningFixture>) => {
        d.interactions![0]!.sessionId = 'missing';
      },
    ],
    [
      'interaction vocabulary',
      (d: ReturnType<typeof learningFixture>) => {
        d.interactions![0]!.vocabularyEntryId = 'missing';
      },
    ],
    [
      'interaction sentence',
      (d: ReturnType<typeof learningFixture>) => {
        d.interactions![0]!.sentenceId = 'missing';
      },
    ],
    [
      'interaction text/session mismatch',
      (d: ReturnType<typeof learningFixture>) => {
        d.texts!.push(textDocument('text-2'));
        d.interactions![0]!.textId = 'text-2';
        d.interactions![0]!.sentenceId = 'text-2:1';
      },
    ],
    [
      'exposure before completion',
      (d: ReturnType<typeof learningFixture>) => {
        d.sessions = [readingSession()];
      },
    ],
    [
      'unconfirmed exposure',
      (d: ReturnType<typeof learningFixture>) => {
        d.texts![0]!.includedVocabularyIds = [];
      },
    ],
    [
      'exposure outside review candidates',
      (d: ReturnType<typeof learningFixture>) => {
        d.sessions![0]!.reviewCandidateIds = [];
      },
    ],
    [
      'exposure with wrong completion time',
      (d: ReturnType<typeof learningFixture>) => {
        d.exposures![0]!.occurredAt = d.sessions![0]!.startedAt!;
      },
    ],
    [
      'grammar sentence',
      (d: ReturnType<typeof learningFixture>) => {
        d.explanations![0]!.sentenceId = 'missing';
      },
    ],
  ])('rolls back the whole batch for an invalid %s reference', async (_name, mutate) => {
    const { repository } = setup();
    const data = learningFixture();
    mutate(data);
    await expect(repository.commit(data)).rejects.toMatchObject({ code: 'invalid-data' });
    expect(await repository.getText('text-1')).toBeUndefined();
    expect(await repository.getVocabularyEntry('word-1')).toBeUndefined();
    expect(await repository.getAppSettings()).toBeUndefined();
  });

  it.each(['texts', 'interactions', 'exposures', 'explanations'] as const)(
    'prevents rewriting immutable %s records',
    async (store) => {
      const { repository } = setup();
      const data = learningFixture();
      await repository.commit(data);
      if (store === 'texts') data.texts![0]!.title = 'changed';
      if (store === 'interactions') data.interactions![0]!.surfaceForm = 'changed';
      if (store === 'exposures') data.exposures![0]!.markedUnknown = false;
      if (store === 'explanations') data.explanations![0]!.aiModel = 'changed';
      await expect(repository.commit(data)).rejects.toMatchObject({ code: 'invalid-data' });
      expect(await repository.getText('text-1')).toEqual(textDocument());
      expect(await repository.getWordInteractions('session-1')).toEqual(
        learningFixture().interactions,
      );
    },
  );

  it('prevents reopening or modifying a completed session', async () => {
    const { repository } = setup();
    await repository.commit(learningFixture());
    await expect(repository.commit({ sessions: [readingSession()] })).rejects.toMatchObject({
      code: 'invalid-data',
    });
    const changed = readingSession('Completed');
    changed.readingPosition.scrollOffset = 200;
    await expect(repository.commit({ sessions: [changed] })).rejects.toMatchObject({
      code: 'invalid-data',
    });
    expect(await repository.getSession('session-1')).toEqual(readingSession('Completed'));
  });

  it('rolls back session and vocabulary changes if an exposure violates a unique index', async () => {
    const { repository } = setup();
    await repository.commit(learningFixture());
    await expect(
      repository.commit({
        vocabulary: [{ ...vocabularyEntry(), status: 'Learned' }],
        exposures: [{ ...learningFixture().exposures![0]!, id: 'duplicate' }],
      }),
    ).rejects.toBeInstanceOf(LearningStorageError);
    expect(await repository.getVocabularyEntry('word-1')).toEqual(vocabularyEntry());
    expect(await repository.getWordExposures('session-1')).toHaveLength(1);
  });

  it('serializes competing exposure writes so only one succeeds', async () => {
    const { repository, options } = setup();
    const other = new IndexedDbLearningRepository(options);
    repositories.push(other);
    const data = learningFixture();
    await repository.commit({ ...data, exposures: [] });
    const results = await Promise.allSettled([
      repository.commit({ exposures: data.exposures }),
      other.commit({ exposures: [{ ...data.exposures![0]!, id: 'other-exposure' }] }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected']);
    expect(await repository.getWordExposures('session-1')).toHaveLength(1);
  });

  it('enforces unique vocabulary senses and grammar cache keys without losing existing data', async () => {
    const { repository } = setup();
    await repository.commit(learningFixture());
    await expect(
      repository.commit({ vocabulary: [vocabularyEntry('duplicate')] }),
    ).rejects.toMatchObject({ code: 'write' });
    await expect(
      repository.commit({
        explanations: [{ ...learningFixture().explanations![0]!, id: 'duplicate' }],
      }),
    ).rejects.toMatchObject({ code: 'write' });
    expect(await repository.getVocabularyEntry('duplicate')).toBeUndefined();
    expect(await repository.getGrammarExplanation('grammar-1')).toEqual(
      learningFixture().explanations![0],
    );
  });

  it('records an undo with an explicit valid target and prevents duplicate undos', async () => {
    const { repository } = setup();
    const data = learningFixture();
    const undo = {
      ...data.interactions![0]!,
      id: 'undo-1',
      action: 'UndoMarkUnknown' as const,
      undoesInteractionId: 'interaction-1',
    };
    await repository.commit({ ...data, interactions: [...data.interactions!, undo] });
    expect(await repository.getWordInteractions('session-1')).toHaveLength(2);
    await expect(
      repository.commit({ interactions: [{ ...undo, id: 'undo-2' }] }),
    ).rejects.toMatchObject({ code: 'write' });
    await expect(
      repository.commit({
        interactions: [{ ...undo, id: 'undo-3', undoesInteractionId: 'missing' }],
      }),
    ).rejects.toMatchObject({ code: 'invalid-data' });
    expect(await repository.getWordInteractions('session-1')).toHaveLength(2);
  });

  it('rejects secrets and malformed records before opening a database', async () => {
    let opens = 0;
    const repository = new IndexedDbLearningRepository({
      getFactory: () => {
        opens++;
        return new IDBFactory();
      },
    });
    repositories.push(repository);
    const data = learningFixture();
    Object.assign(data.appSettings!, { apiKey: 'test-credential' });
    await expect(repository.commit(data)).rejects.toMatchObject({ code: 'invalid-data' });
    expect(opens).toBe(0);
  });
});
