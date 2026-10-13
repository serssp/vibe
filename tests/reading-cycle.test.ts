import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it, vi } from 'vitest';
import { IndexedDbLearningRepository } from '../src/infrastructure/storage/indexeddb-learning';
import { createBackupActions } from '../src/application/use-cases/backup';
import { createReadingActions } from '../src/application/use-cases/reading';
import { createGenerationActions } from '../src/application/use-cases/generate-text';
import { createWordActions } from '../src/application/use-cases/lookup-word';
import { confirmedVocabulary } from '../src/domain/learning/occurrences';
import { completeReading } from '../src/domain/learning/completion';
import {
  vocabularyEntry,
  readingSession,
  textDocument,
  startedAt,
  completedAt,
} from './fixtures/learning';
import { mockProvider } from './fixtures/provider';

function setup() {
  const factory = new IDBFactory();
  const options = { getFactory: () => factory };
  const repository = new IndexedDbLearningRepository(options);
  const provider = mockProvider();
  let next = 0;
  let now = startedAt;
  const runtime = { id: () => `cycle-${++next}`, now: () => now };
  const reading = createReadingActions(repository, runtime);
  const generation = createGenerationActions(provider, repository, runtime);
  const words = createWordActions(provider, repository, runtime);
  const request = {
    apiKey: 'test-credential',
    model: 'test-model',
    cefrLevel: 'A1' as const,
    targetDuration: 3 as const,
    signal: new AbortController().signal,
  };
  return {
    repository,
    provider,
    reading,
    generation,
    words,
    request,
    options,
    clock: (timestamp: string) => {
      now = timestamp;
    },
  };
}

describe('Adaptive reading completion', () => {
  it('learns only confirmed untapped candidates, keeps new/absent/marked words unknown and stores evidence once', async () => {
    const { repository, reading, clock } = setup();
    const old = {
      ...vocabularyEntry(),
      createdAt: '2026-10-12T10:00:00.000Z',
      lastMarkedAt: '2026-10-12T10:00:00.000Z',
    };
    const marked = { ...old, id: 'marked', senseKey: 'marked' };
    const absent = { ...old, id: 'absent', senseKey: 'absent' };
    const fresh = { ...vocabularyEntry('fresh', 'fresh') };
    const text = {
      ...textDocument(),
      targetVocabularyIds: [old.id, marked.id, absent.id],
      includedVocabularyIds: [old.id, marked.id],
    };
    const session = { ...readingSession(), reviewCandidateIds: [old.id, marked.id, absent.id] };
    const interaction = (id: string) => ({
      id: `mark-${id}`,
      sessionId: session.id,
      textId: text.id,
      vocabularyEntryId: id,
      surfaceForm: 'gehe',
      sentenceId: text.sentences[0]!.id,
      action: 'MarkUnknown' as const,
      undoesInteractionId: null,
      timestamp: startedAt,
    });
    await repository.commit({
      texts: [text],
      sessions: [session],
      vocabulary: [old, marked, absent, fresh],
      interactions: [interaction(marked.id), interaction(fresh.id)],
    });
    clock(completedAt);
    await reading.complete(session.id);
    const snapshot = await repository.snapshot();
    expect(snapshot.vocabulary.find((word) => word.id === old.id)).toMatchObject({
      status: 'Learned',
      exposureCount: 1,
    });
    for (const id of ['marked', 'absent', 'fresh'])
      expect(snapshot.vocabulary.find((word) => word.id === id)?.status).toBe('Unknown');
    expect(snapshot.exposures).toHaveLength(2);
    expect(
      snapshot.exposures.find((item) => item.vocabularyEntryId === marked.id)?.markedUnknown,
    ).toBe(true);
    await reading.complete(session.id);
    expect(await repository.snapshot()).toEqual(snapshot);
    await repository.close();
  });

  it('uses undo evidence and protects first-session words even when their marks were undone', () => {
    const word = vocabularyEntry();
    const text = textDocument();
    const session = readingSession();
    const mark = {
      id: 'mark',
      sessionId: session.id,
      textId: text.id,
      vocabularyEntryId: word.id,
      sentenceId: text.sentences[0]!.id,
      surfaceForm: 'gehe',
      action: 'MarkUnknown' as const,
      undoesInteractionId: null,
      timestamp: startedAt,
    };
    const undo = {
      ...mark,
      id: 'undo',
      action: 'UndoMarkUnknown' as const,
      undoesInteractionId: mark.id,
    };
    const result = completeReading(
      session,
      text,
      [word],
      [mark, undo],
      completedAt,
      () => 'exposure',
    );
    expect(result.vocabulary![0]!.status).toBe('Unknown');
    expect(result.exposures![0]!.markedUnknown).toBe(false);
    const prior = { ...word, createdAt: '2026-10-12T10:00:00.000Z' };
    expect(
      completeReading(session, text, [prior], [mark, undo], completedAt, () => 'exposure')
        .vocabulary![0]!.status,
    ).toBe('Learned');
  });

  it('does not erase a later mark from another interrupted session', () => {
    const word = {
      ...vocabularyEntry(),
      createdAt: '2026-10-12T10:00:00.000Z',
      lastMarkedAt: '2026-10-13T10:01:00.000Z',
    };
    expect(
      completeReading(readingSession(), textDocument(), [word], [], completedAt, () => 'exposure')
        .vocabulary![0]!.status,
    ).toBe('Unknown');
  });

  it('serializes concurrent completion and position updates across database connections', async () => {
    const { repository, options, reading, clock } = setup();
    const other = new IndexedDbLearningRepository(options);
    await repository.commit({
      vocabulary: [vocabularyEntry()],
      texts: [textDocument()],
      sessions: [readingSession()],
    });
    clock(completedAt);
    await Promise.all([
      reading.complete('session-1'),
      other.completeReading('session-1', completedAt, () => 'competing-exposure'),
      reading.savePosition('session-1', { sentenceId: 'text-1:2', scrollOffset: 50 }),
    ]);
    expect(await repository.getWordExposures('session-1')).toHaveLength(1);
    expect(await repository.getVocabularyEntry('word-1')).toMatchObject({ exposureCount: 1 });
    const completed = await repository.getSession('session-1');
    await reading.savePosition('session-1', { sentenceId: null, scrollOffset: 0 });
    expect(await repository.getSession('session-1')).toEqual(completed);
    await other.close();
    await repository.close();
  });

  it('rolls back completion, exposures and vocabulary on a conflicting exposure ID', async () => {
    const { repository } = setup();
    const first = readingSession();
    await repository.commit({
      vocabulary: [vocabularyEntry()],
      texts: [textDocument()],
      sessions: [first],
    });
    await repository.completeReading(first.id, completedAt, () => 'one-exposure');
    await repository.commit({
      vocabulary: [{ ...(await repository.getVocabularyEntry('word-1'))!, status: 'Unknown' }],
    });
    const next = await repository.startReading(
      first.textId,
      'next-session',
      '2026-10-13T10:05:00.000Z',
    );

    const before = await repository.snapshot();
    await expect(
      repository.completeReading(next.id, '2026-10-13T10:10:00.000Z', () => 'one-exposure'),
    ).rejects.toThrow();
    expect(await repository.snapshot()).toEqual(before);
    await repository.close();
  });

  it('blocks unresolved word intents, persists them after reopening, and completes after cancellation', async () => {
    const { repository, generation, words, request, provider, reading, clock } = setup();
    const result = await generation.generate(request);
    vi.mocked(provider.translate).mockRejectedValueOnce(new Error('network'));
    const selection = {
      sessionId: result.session.id,
      textId: result.text.id,
      sentenceId: result.text.sentences[0]!.id,
      surfaceForm: 'ging',
      start: 4,
      end: 8,
    };
    await expect(words.lookup({ ...request, selection })).rejects.toThrow();
    await repository.close();
    const pending = await words.pending(result.session.id);
    expect(pending).toHaveLength(1);
    await expect(reading.complete(result.session.id)).rejects.toMatchObject({
      code: 'pending-lookups',
    });
    expect((await repository.getSession(result.session.id))?.status).toBe('InProgress');
    clock(completedAt);
    await words.undo(pending[0]!.id);
    await reading.complete(result.session.id);
    expect((await repository.getSession(result.session.id))?.status).toBe('Completed');
    await repository.close();
  });

  it('sends active vocabulary only, freezes candidates, rejects hallucinations and verifies literal occurrence', async () => {
    const { repository, provider, generation, request, clock } = setup();
    await repository.commit({
      vocabulary: [
        vocabularyEntry(),
        { ...vocabularyEntry('learned', 'learned'), lemma: 'lernen', status: 'Learned' },
        { ...vocabularyEntry('undone', 'undone'), lemma: 'schön', unknownCount: 0 },
      ],
    });
    vi.mocked(provider.generate).mockResolvedValueOnce({
      title: 'Lesen',
      sentences: ['Wir gehen nach Hause.'],
      occurrences: [
        { vocabularyId: 'word-1', sentenceIndex: 0, surfaceForm: 'gehen', sameMeaning: true },
      ],
    });
    clock(completedAt);
    const result = await generation.generate(request);
    expect(provider.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        reviewVocabulary: [{ id: 'word-1', lemma: 'gehen', meaningRu: 'идти' }],
      }),
    );
    expect(result.text.targetVocabularyIds).toEqual(['word-1']);
    expect(result.text.includedVocabularyIds).toEqual(['word-1']);
    vi.mocked(provider.generate).mockResolvedValueOnce({
      title: 'Absent',
      sentences: ['Wir lesen.'],
      occurrences: [
        { vocabularyId: 'word-1', sentenceIndex: 0, surfaceForm: 'gehen', sameMeaning: true },
      ],
    });
    expect((await generation.generate(request)).text.includedVocabularyIds).toEqual([]);
    await repository.close();
  });

  it('exposes interaction and repetition facts locally and prevents undoing completed learning', async () => {
    const { repository, generation, words, request, reading, clock } = setup();
    const result = await generation.generate(request);
    const selection = {
      sessionId: result.session.id,
      textId: result.text.id,
      sentenceId: result.text.sentences[0]!.id,
      surfaceForm: 'ging',
      start: 4,
      end: 8,
    };
    const marked = await words.lookup({ ...request, selection });
    clock(completedAt);
    await reading.complete(result.session.id);
    const before = await repository.snapshot();
    const facts = await reading.wordHistory(marked.entry.id);
    expect(facts.interactions).toHaveLength(1);
    expect(facts.exposures).toEqual([]);
    await expect(
      repository.undoWordLookup(marked.lookup.id, 'late-undo', completedAt),
    ).rejects.toThrow();
    expect(await repository.snapshot()).toEqual(before);
    await repository.close();
  });

  it('undoing an older session mark preserves a newer explicit mark from another session', async () => {
    const { repository, provider, generation, words, reading, request, clock } = setup();
    await repository.commit({
      vocabulary: [
        { ...vocabularyEntry(), status: 'Learned', createdAt: '2026-10-12T10:00:00.000Z' },
      ],
    });
    const card = (
      await provider.translate({
        ...request,
        sentence: 'Wir gingen.',
        surfaceForm: 'gingen',
        start: 4,
        end: 10,
        knownVocabulary: [],
      })
    ).card;
    vi.mocked(provider.translate).mockResolvedValue({
      card: { ...card, matchedVocabularyId: 'word-1' },
    });
    const first = await generation.generate(request);
    const select = (result: typeof first) => ({
      sessionId: result.session.id,
      textId: result.text.id,
      sentenceId: result.text.sentences[0]!.id,
      surfaceForm: 'ging',
      start: 4,
      end: 8,
    });
    const firstMark = await words.lookup({ ...request, selection: select(first) });
    clock('2026-10-13T10:01:00.000Z');
    const second = await generation.generate(request);
    await words.lookup({ ...request, selection: select(second) });
    await words.undo(firstMark.lookup.id);
    expect(await repository.getVocabularyEntry('word-1')).toMatchObject({
      status: 'Unknown',
      unknownCount: 2,
      lastMarkedAt: '2026-10-13T10:01:00.000Z',
    });
    expect((await reading.wordHistory('word-1')).interactions).toHaveLength(3);
    await repository.close();
  });

  it('uses verified contextual cards when rereading a text generated before the word was known', async () => {
    const { repository, generation, words, request, reading, clock } = setup();
    const first = await generation.generate(request);
    expect(first.text.includedVocabularyIds).toEqual([]);
    const mark = await words.lookup({
      ...request,
      selection: {
        sessionId: first.session.id,
        textId: first.text.id,
        sentenceId: first.text.sentences[0]!.id,
        surfaceForm: 'ging',
        start: 4,
        end: 8,
      },
    });
    clock(completedAt);
    await reading.complete(first.session.id);
    expect((await repository.getVocabularyEntry(mark.entry.id))?.status).toBe('Unknown');
    clock('2026-10-13T10:05:00.000Z');
    const reread = await reading.start(first.text.id);
    expect(reread.session.reviewCandidateIds).toEqual([mark.entry.id]);
    clock('2026-10-13T10:10:00.000Z');
    await reading.complete(reread.session.id);
    expect((await repository.getVocabularyEntry(mark.entry.id))?.status).toBe('Learned');
    expect(await repository.getWordExposures(reread.session.id)).toHaveLength(1);
    expect(await repository.getText(first.text.id)).toEqual(first.text);
    const backups = createBackupActions(repository, {
      id: () => 'backup',
      now: () => '2026-10-13T12:00:00.000Z',
    });
    const snapshot = backups.preview(await backups.exportData());
    await backups.restore(snapshot);
    expect((await repository.getVocabularyEntry(mark.entry.id))?.status).toBe('Learned');
    await repository.close();
  });

  it('requires literal boundaries, supplied senses and certainty; never guesses inflection or separated parts', () => {
    const word = vocabularyEntry();
    const match = {
      vocabularyId: word.id,
      sentenceIndex: 0,
      surfaceForm: 'gehen',
      sameMeaning: true,
    };
    expect(confirmedVocabulary(['Wir gehen.'], [word], [match, match])).toEqual([word.id]);
    for (const sentence of ['Wir ausgehen.', 'Wir gingen.', 'Wir gehenlos.'])
      expect(confirmedVocabulary([sentence], [word], [match])).toEqual([]);
    expect(
      confirmedVocabulary(
        ['Wir gehen.'],
        [word],
        [
          { ...match, sameMeaning: false },
          { ...match, vocabularyId: 'invented' },
        ],
      ),
    ).toEqual([]);
    expect(
      confirmedVocabulary(['Wir gehen.'], [word, vocabularyEntry('other', 'other-sense')], [match]),
    ).toEqual([]);
    expect(
      confirmedVocabulary(
        ['Er steht auf.'],
        [{ ...word, lemma: 'aufstehen' }],
        [{ ...match, surfaceForm: 'steht' }],
      ),
    ).toEqual([]);
  });

  it('recovers earlier unfinished texts after the newest is completed, preserves view history, and starts rereading explicitly', async () => {
    const { repository, generation, request, reading, clock } = setup();
    const first = await generation.generate(request);
    await reading.savePosition(first.session.id, {
      sentenceId: first.text.sentences[1]!.id,
      scrollOffset: 40,
    });
    clock(completedAt);
    const second = await generation.generate(request);
    await reading.complete(second.session.id);
    expect((await generation.restore())?.session.id).toBe(second.session.id);
    await reading.resume(first.text.id);
    expect((await generation.restore())?.session.id).toBe(first.session.id);
    const before = await repository.getWordExposures(second.session.id);
    expect((await reading.resume(second.text.id)).session.status).toBe('Completed');
    expect(await repository.getWordExposures(second.session.id)).toEqual(before);
    const [a, b] = await Promise.all([
      reading.start(second.text.id),
      reading.start(second.text.id),
    ]);
    expect(a.session.id).toBe(b.session.id);
    expect(
      (await reading.history()).find((item) => item.text.id === second.text.id)?.sessions,
    ).toHaveLength(2);
    await repository.close();
  });
});
