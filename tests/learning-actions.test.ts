import { IDBFactory } from 'fake-indexeddb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGenerationActions } from '../src/application/use-cases/generate-text';
import { createWordActions, WordLookupError } from '../src/application/use-cases/lookup-word';
import { createGrammarActions } from '../src/application/use-cases/explain-grammar';
import { IndexedDbLearningRepository } from '../src/infrastructure/storage/indexeddb-learning';
import { tokenize } from '../src/domain/reading/tokens';
import { mockProvider } from './fixtures/provider';
import type { WordSelection } from '../src/domain/vocabulary/lookups';

const repositories: IndexedDbLearningRepository[] = [];
afterEach(async () => {
  await Promise.all(repositories.splice(0).map((repository) => repository.close()));
});

async function setup() {
  const factory = new IDBFactory();
  const repository = new IndexedDbLearningRepository({ getFactory: () => factory });
  repositories.push(repository);
  const provider = mockProvider();
  let id = 0;
  let time = 0;
  const runtime = {
    id: () => `id-${++id}`,
    now: () => new Date(Date.parse('2026-10-13T10:00:00Z') + time++).toISOString(),
  };
  const request = {
    apiKey: 'test-credential',
    model: 'test-model',
    signal: new AbortController().signal,
  };
  const generated = await createGenerationActions(provider, repository, runtime).generate({
    ...request,
    cefrLevel: 'A1',
    targetDuration: 3,
  });
  const selection: WordSelection = {
    sessionId: generated.session.id,
    textId: generated.text.id,
    sentenceId: generated.text.sentences[0]!.id,
    surfaceForm: 'ging',
    start: 4,
    end: 8,
  };
  const words = createWordActions(provider, repository, runtime);
  const grammar = createGrammarActions(provider, repository, runtime);
  return { factory, repository, provider, request, generated, selection, words, grammar };
}

describe('Contextual vocabulary learning', () => {
  it('undoes a newer winning lookup when an older request resolves after it', async () => {
    const { factory, provider, request, selection, words, repository } = await setup();
    const success = await provider.translate({
      ...request,
      sentence: 'Ich ging nach Hause.',
      surfaceForm: 'ging',
      start: 4,
      end: 8,
      knownVocabulary: [],
    });
    let finish!: (value: typeof success) => void;
    vi.mocked(provider.translate).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const first = words.lookup({ ...request, selection });
    await vi.waitFor(() => expect(finish).toBeDefined());
    const secondRepository = new IndexedDbLearningRepository({ getFactory: () => factory });
    repositories.push(secondRepository);
    const other = createWordActions(provider, secondRepository, {
      id: () => crypto.randomUUID(),
      now: () => '2026-10-13T10:00:01.000Z',
    });
    const newer = await other.lookup({ ...request, selection });
    finish(success);
    const older = await first;
    expect(older.entry.id).toBe(newer.entry.id);
    await other.undo(newer.lookup.id);
    expect((await repository.listVocabulary())[0]).toMatchObject({
      unknownCount: 1,
      status: 'Unknown',
    });
    await other.undo(older.lookup.id);
    expect((await repository.listVocabulary())[0]?.unknownCount).toBe(0);
  });
  it('serializes uncached resolution across two connections without duplicate vocabulary or lost marks', async () => {
    const { factory, repository, provider, request, selection, words } = await setup();
    const second = new IndexedDbLearningRepository({ getFactory: () => factory });
    repositories.push(second);
    const other = createWordActions(provider, second, {
      id: () => crypto.randomUUID(),
      now: () => '2026-10-13T10:00:01.000Z',
    });
    await Promise.all([
      words.lookup({ ...request, selection }),
      other.lookup({ ...request, selection }),
    ]);
    expect(await repository.listVocabulary()).toHaveLength(1);
    expect((await repository.listVocabulary())[0]?.unknownCount).toBe(2);
    expect(await repository.getWordInteractions(selection.sessionId)).toHaveLength(2);
  });
  it('persists an unfamiliar inflected word, caches the card, and records each repeated tap', async () => {
    const { repository, provider, request, selection, words } = await setup();
    const first = await words.lookup({ ...request, selection });
    expect(first.entry).toMatchObject({ lemma: 'gehen', status: 'Unknown', unknownCount: 1 });
    await repository.close();
    const second = await words.lookup({ ...request, selection });
    expect(second.cached).toBe(true);
    expect(second.entry.unknownCount).toBe(2);
    expect(provider.translate).toHaveBeenCalledTimes(1);
    expect(await repository.getWordInteractions(selection.sessionId)).toHaveLength(2);
    expect((await repository.getWordInteractions(selection.sessionId))[0]).toMatchObject({
      surfaceForm: 'ging',
      sentenceId: selection.sentenceId,
    });
    expect(await words.pending(selection.sessionId)).toEqual([]);
  });

  it('links ging and gehe to one verified lemma/sense across different contexts', async () => {
    const { provider, request, selection, words, generated } = await setup();
    const first = await words.lookup({ ...request, selection });
    vi.mocked(provider.translate).mockResolvedValueOnce({
      card: {
        ...first.translation.card,
        expression: 'gehe',
        formRu: 'Настоящее время.',
        matchedVocabularyId: first.entry.id,
      },
    });
    const second = await words.lookup({
      ...request,
      selection: {
        ...selection,
        sentenceId: generated.text.sentences[1]!.id,
        surfaceForm: 'gehe',
        start: 6,
        end: 10,
      },
    });
    expect(second.entry.id).toBe(first.entry.id);
    expect(second.entry.unknownCount).toBe(2);
    expect(await words.vocabulary()).toHaveLength(1);
  });

  it('keeps different unverified senses separate even for the same lemma', async () => {
    const { request, selection, words, generated } = await setup();
    const first = await words.lookup({ ...request, selection });
    const second = await words.lookup({
      ...request,
      selection: {
        ...selection,
        sentenceId: generated.text.sentences[1]!.id,
        surfaceForm: 'gehe',
        start: 6,
        end: 10,
      },
    });
    expect(first.entry.id).not.toBe(second.entry.id);
    expect(await words.vocabulary()).toHaveLength(2);
  });

  it('preserves a failed lookup across reopening and retries that same intent exactly once', async () => {
    const { repository, provider, request, selection, words } = await setup();
    vi.mocked(provider.translate).mockRejectedValueOnce(new Error('test-credential'));
    let failure: WordLookupError | undefined;
    try {
      await words.lookup({ ...request, selection });
    } catch (error) {
      failure = error as WordLookupError;
    }
    expect(failure).toBeInstanceOf(WordLookupError);
    expect(failure!.message).not.toContain('test-credential');
    await repository.close();
    expect((await words.pending(selection.sessionId))[0]?.id).toBe(failure!.lookupId);
    expect(await words.vocabulary()).toHaveLength(0);
    const result = await words.lookup({ ...request, selection, lookupId: failure!.lookupId });
    expect(result.lookup.id).toBe(failure!.lookupId);
    expect(await repository.getWordInteractions(selection.sessionId)).toHaveLength(1);
  });

  it('cancels pending marks and prevents a cancelled late response from recording vocabulary', async () => {
    const { repository, provider, request, selection, words } = await setup();
    let finish!: (value: Awaited<ReturnType<typeof provider.translate>>) => void;
    const success = await provider.translate({
      ...request,
      sentence: 'Ich ging nach Hause.',
      surfaceForm: 'ging',
      start: 4,
      end: 8,
      knownVocabulary: [],
    });
    vi.mocked(provider.translate).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const pending = words.lookup({ ...request, selection });
    const rejected = expect(pending).rejects.toBeInstanceOf(WordLookupError);
    await vi.waitFor(() => expect(finish).toBeDefined());
    const queued = (await words.pending(selection.sessionId))[0]!;
    await words.undo(queued.id);
    finish(success);
    await rejected;
    expect(await words.pending(selection.sessionId)).toHaveLength(0);
    expect(await repository.getWordInteractions(selection.sessionId)).toHaveLength(0);
    expect(await words.vocabulary()).toHaveLength(0);
  });

  it('undoes repeated marks out of order and remains safe to repeat', async () => {
    const { repository, request, selection, words } = await setup();
    const first = await words.lookup({ ...request, selection });
    const second = await words.lookup({ ...request, selection });
    await words.undo(first.lookup.id);
    expect((await words.vocabulary())[0]).toMatchObject({ unknownCount: 1, status: 'Unknown' });
    await words.undo(second.lookup.id);
    await words.undo(second.lookup.id);
    expect((await words.vocabulary())[0]?.unknownCount).toBe(0);
    expect(await repository.getWordInteractions(selection.sessionId)).toHaveLength(4);
  });

  it('restores a previously learned word when its accidental mark is undone', async () => {
    const { repository, request, selection, words } = await setup();
    const first = await words.lookup({ ...request, selection });
    await words.undo(first.lookup.id);
    await repository.commit({
      vocabulary: [{ ...first.entry, status: 'Learned', unknownCount: 2 }],
    });
    const session = (await repository.getSession(selection.sessionId))!;
    const newSession = { ...session, id: 'new-session' };
    await repository.commit({ sessions: [newSession] });
    const next = await words.lookup({
      ...request,
      selection: { ...selection, sessionId: newSession.id },
    });
    expect(next.entry.status).toBe('Unknown');
    await words.undo(next.lookup.id);
    expect((await words.vocabulary())[0]).toMatchObject({ status: 'Learned', unknownCount: 2 });
  });

  it('rejects unknown candidate IDs without corrupting vocabulary and leaves an intent to retry', async () => {
    const { provider, request, selection, words } = await setup();
    const result = await provider.translate({
      ...request,
      sentence: 'Ich ging nach Hause.',
      surfaceForm: 'ging',
      start: 4,
      end: 8,
      knownVocabulary: [],
    });
    vi.mocked(provider.translate).mockResolvedValueOnce({
      ...result,
      card: { ...result.card, matchedVocabularyId: 'invented' },
    });
    await expect(words.lookup({ ...request, selection })).rejects.toThrow('подтвердить значение');
    expect(await words.vocabulary()).toEqual([]);
    expect(await words.pending(selection.sessionId)).toHaveLength(1);
  });

  it('caches by model and records distinct marks without concurrent counter loss across adapters', async () => {
    const { provider, request, selection, words, repository } = await setup();
    const first = await words.lookup({ ...request, selection });
    vi.mocked(provider.translate).mockResolvedValueOnce({
      card: { ...first.translation.card, matchedVocabularyId: first.entry.id },
    });
    await words.lookup({ ...request, model: 'other-model', selection });
    expect(provider.translate).toHaveBeenCalledTimes(2);
    const other = createWordActions(provider, repository, {
      id: () => crypto.randomUUID(),
      now: () => '2026-10-13T10:00:01.000Z',
    });
    await Promise.all([
      words.lookup({ ...request, selection }),
      other.lookup({ ...request, selection }),
    ]);
    expect((await words.vocabulary())[0]?.unknownCount).toBe(4);
    expect(await repository.getWordInteractions(selection.sessionId)).toHaveLength(4);
  });
});

describe('Sentence grammar', () => {
  it('retains vocabulary and interaction history when grammar AI fails', async () => {
    const { provider, request, selection, words, grammar, repository } = await setup();
    await words.lookup({ ...request, selection });
    const before = await repository.listVocabulary();
    const interactions = await repository.getWordInteractions(selection.sessionId);
    vi.mocked(provider.explain).mockRejectedValueOnce(new Error('network'));
    await expect(
      grammar.explain({
        ...request,
        textId: selection.textId,
        sentenceId: selection.sentenceId,
        cefrLevel: 'A1',
      }),
    ).rejects.toThrow();
    expect(await repository.listVocabulary()).toEqual(before);
    expect(await repository.getWordInteractions(selection.sessionId)).toEqual(interactions);
  });
  it('caches by sentence, level, model and prompt version without vocabulary changes', async () => {
    const { provider, request, selection, grammar, repository } = await setup();
    const input = {
      ...request,
      textId: selection.textId,
      sentenceId: selection.sentenceId,
      cefrLevel: 'A1' as const,
    };
    const first = await grammar.explain(input);
    expect((await grammar.explain(input)).cached).toBe(true);
    expect(provider.explain).toHaveBeenCalledTimes(1);
    await grammar.explain({ ...input, cefrLevel: 'A2' });
    await grammar.explain({ ...input, model: 'other-model' });
    provider.promptVersions.grammar = '2';
    await grammar.explain(input);
    expect(provider.explain).toHaveBeenCalledTimes(4);
    expect(first.explanation.promptVersion).toBe('1');
    expect(await repository.listVocabulary()).toEqual([]);
    expect(await repository.getWordInteractions(selection.sessionId)).toEqual([]);
  });
  it('rejects explanation fragments absent from the sentence and caches no invalid result', async () => {
    const { provider, request, selection, grammar, repository } = await setup();
    vi.mocked(provider.explain).mockResolvedValueOnce({
      rules: [{ titleRu: 'bad', explanationRu: 'bad', fragments: ['absent'], examples: [] }],
    });
    await expect(
      grammar.explain({
        ...request,
        textId: selection.textId,
        sentenceId: selection.sentenceId,
        cefrLevel: 'A1',
      }),
    ).rejects.toThrow('не соответствует');
    expect(
      await repository.findGrammarExplanation({
        textId: selection.textId,
        sentenceId: selection.sentenceId,
        cefrLevel: 'A1',
        aiModel: request.model,
        promptVersion: '1',
      }),
    ).toBeUndefined();
  });
});

describe('German word tokens', () => {
  it('preserves punctuation and UTF-16 offsets with umlauts, compounds, apostrophes and emoji', () => {
    const sentence = '🙂 „Grüße!“, E-Mail, geht’s — 3,5.';
    const tokens = tokenize(sentence);
    expect(tokens.map((token) => token.content).join('')).toBe(sentence);
    expect(tokens.filter((token) => token.word).map((token) => token.content)).toEqual([
      'Grüße',
      'E-Mail',
      'geht’s',
      '3,5',
    ]);
    for (const token of tokens) expect(sentence.slice(token.start, token.end)).toBe(token.content);
  });
});
