import { describe, expect, it, vi } from 'vitest';
import { OpenAIConnectionProvider } from '../src/infrastructure/ai/openai-connection';
import { ConnectionError } from '../src/application/ports/ai-provider';
import { mockProvider } from './fixtures/provider';
import { parseWord } from '../src/infrastructure/ai/structured-outputs';

const dictionaryNoun = () => ({
  lemma: 'Bank',
  partOfSpeech: 'noun',
  article: 'die',
  gender: 'feminine',
  meaningRu: 'скамейка',
  formRu: 'Дательный падеж.',
  expression: 'auf der Bank',
  matchedVocabularyId: null,
  nounPlural: 'Bänke',
  irregularVerb: null,
});

const request = () => ({
  apiKey: 'test-credential',
  model: 'test-model',
  signal: new AbortController().signal,
});
const generation = () => ({
  ...request(),
  cefrLevel: 'B1' as const,
  targetDuration: 5 as const,
  recentTopics: ['A train journey'],
  reviewVocabulary: [],
});
const response = (value: unknown) =>
  new Response(
    JSON.stringify({
      status: 'completed',
      output: [
        { type: 'message', content: [{ type: 'output_text', text: JSON.stringify(value) }] },
      ],
      usage: { total_tokens: 100 },
    }),
  );

describe('Structured OpenAI transport', () => {
  it('sends strict Responses text.format schemas, separate context and prompt, no credentials in payload', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        response({ title: 'Eine Reise', sentences: ['Ich fahre nach Berlin.'], occurrences: [] }),
      );
    const provider = new OpenAIConnectionProvider(fetcher);
    expect(await provider.generate(generation())).toMatchObject({
      title: 'Eine Reise',
      totalTokens: 100,
    });
    const payload = JSON.parse(fetcher.mock.calls[0]![1]!.body as string);
    expect(payload.text.format).toMatchObject({
      type: 'json_schema',
      name: 'vibe_generation',
      strict: true,
    });
    expect(payload.text.format.schema.additionalProperties).toBe(false);
    expect(payload.instructions).toContain('Version: 2');
    expect(JSON.parse(payload.input)).toMatchObject({
      cefrLevel: 'B1',
      targetDuration: 5,
      targetWords: 550,
      recentTopics: ['A train journey'],
    });
    expect(payload.store).toBe(false);
    expect(JSON.stringify(payload)).not.toContain('test-credential');
  });

  it.each([
    { title: '', sentences: ['Hallo!'] },
    { title: 'bad', sentences: [] },
    { title: 'bad', sentences: [42] },
    { title: 'bad', sentences: ['Hallo!'], apiKey: 'test-credential' },
  ])('rejects malformed generated document %#', async (body) => {
    const provider = new OpenAIConnectionProvider(
      vi.fn<typeof fetch>().mockResolvedValue(response(body)),
    );
    await expect(provider.generate(generation())).rejects.toBeInstanceOf(ConnectionError);
  });

  it('validates noun gender and keeps an explanation of separable/multiword forms', async () => {
    const card = dictionaryNoun();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response(card))
      .mockResolvedValueOnce(response({ ...card, gender: 'masculine' }))
      .mockResolvedValueOnce(
        response({
          lemma: 'aufstehen',
          partOfSpeech: 'verb',
          article: null,
          gender: null,
          meaningRu: 'вставать',
          formRu: 'steht и auf образуют отделяемый глагол.',
          expression: 'steht … auf',
          matchedVocabularyId: null,
          nounPlural: null,
          irregularVerb: { preterite: 'stand auf', perfect: 'ist aufgestanden' },
        }),
      );
    const provider = new OpenAIConnectionProvider(fetcher);
    const input = {
      ...request(),
      sentence: 'Ich sitze auf der Bank.',
      surfaceForm: 'Bank',
      start: 17,
      end: 21,
      knownVocabulary: [],
    };
    expect((await provider.translate(input)).card.gender).toBe('feminine');
    expect(provider.promptVersions.word).toBe('2');
    const payload = JSON.parse(fetcher.mock.calls[0]![1]!.body as string);
    expect(payload.text.format.schema.required).toContain('nounPlural');
    expect(payload.text.format.schema.properties.irregularVerb.anyOf[0].required).toEqual([
      'preterite',
      'perfect',
    ]);
    await expect(provider.translate(input)).rejects.toBeInstanceOf(ConnectionError);
    expect(
      (
        await provider.translate({
          ...input,
          sentence: 'Er steht früh auf.',
          surfaceForm: 'steht',
          start: 3,
          end: 8,
        })
      ).card,
    ).toMatchObject({ lemma: 'aufstehen', expression: 'steht … auf' });
  });

  it('accepts nouns without a plural and regular verbs without principal parts', () => {
    expect(
      parseWord({ ...dictionaryNoun(), lemma: 'Milch', nounPlural: null }).nounPlural,
    ).toBeNull();
    expect(
      parseWord({
        ...dictionaryNoun(),
        lemma: 'spielen',
        partOfSpeech: 'verb',
        article: null,
        gender: null,
        nounPlural: null,
        irregularVerb: null,
      }).irregularVerb,
    ).toBeNull();
  });

  it.each([
    { nounPlural: '' },
    { nounPlural: 12 },
    { nounPlural: undefined },
    { irregularVerb: { preterite: 'ging', perfect: 'ist gegangen' } },
    { partOfSpeech: 'verb', article: null, gender: null, irregularVerb: null },
    { partOfSpeech: 'verb', article: null, gender: null, nounPlural: null, irregularVerb: {} },
    {
      partOfSpeech: 'verb',
      article: null,
      gender: null,
      nounPlural: null,
      irregularVerb: { preterite: '', perfect: 'ist gegangen' },
    },
    {
      partOfSpeech: 'verb',
      article: null,
      gender: null,
      nounPlural: null,
      irregularVerb: { preterite: 'ging', perfect: 'ist gegangen', apiKey: 'test-credential' },
    },
  ])('rejects invalid dictionary fields %#', (fields) => {
    expect(() => parseWord({ ...dictionaryNoun(), ...fields })).toThrow(ConnectionError);
  });

  it('rejects invented or mismatched vocabulary candidate IDs', async () => {
    const mock = mockProvider();
    const card = (
      await mock.translate({
        ...request(),
        sentence: 'Ich ging.',
        surfaceForm: 'ging',
        start: 4,
        end: 8,
        knownVocabulary: [],
      })
    ).card;
    const provider = new OpenAIConnectionProvider(
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(response({ ...card, matchedVocabularyId: 'invented' })),
    );
    await expect(
      provider.translate({
        ...request(),
        sentence: 'Ich ging.',
        surfaceForm: 'ging',
        start: 4,
        end: 8,
        knownVocabulary: [],
      }),
    ).rejects.toThrow('значению слова');
  });

  it('rejects refusals, incomplete responses, and invalid JSON without exposing content', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: 'completed',
            output: [
              { type: 'message', content: [{ type: 'refusal', refusal: 'test-credential' }] },
            ],
          }),
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: 'incomplete', output: [] })))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: 'completed',
            output: [
              {
                type: 'message',
                content: [{ type: 'output_text', text: 'test-credential invalid' }],
              },
            ],
          }),
        ),
      );
    const provider = new OpenAIConnectionProvider(fetcher);
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await provider.generate(generation());
        expect.fail('Must reject');
      } catch (error) {
        expect(error).toBeInstanceOf(ConnectionError);
        expect((error as Error).message).not.toContain('test-credential');
      }
    }
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it('never fetches for a pre-aborted request', async () => {
    const fetcher = vi.fn<typeof fetch>();
    const controller = new AbortController();
    controller.abort();
    await expect(
      new OpenAIConnectionProvider(fetcher).generate({
        ...generation(),
        signal: controller.signal,
      }),
    ).rejects.toThrow('отменена');
    expect(fetcher).not.toHaveBeenCalled();
  });
});
