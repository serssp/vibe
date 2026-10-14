import type { VocabularyOccurrence } from '../../domain/learning/occurrences';
import { ConnectionError } from '../../application/ports/ai-provider';
import type { WordCard } from '../../domain/vocabulary/word-card';
import type { GrammarRule } from '../../domain/grammar/models';

const string = { type: 'string' };
const strings = { type: 'array', items: string };
const nullableString = { type: ['string', 'null'] };
const object = (properties: Record<string, unknown>) => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
const example = object({ de: string, ru: string });
const rule = object({
  titleRu: string,
  explanationRu: string,
  fragments: strings,
  examples: { type: 'array', items: example },
});
const parts = [
  'noun',
  'verb',
  'adjective',
  'adverb',
  'pronoun',
  'preposition',
  'conjunction',
  'article',
  'numeral',
  'particle',
  'expression',
  'other',
];

export const schemas = {
  generation: object({
    title: string,
    sentences: strings,
    occurrences: {
      type: 'array',
      items: object({
        vocabularyId: string,
        sentenceIndex: { type: 'integer' },
        surfaceForm: string,
        sameMeaning: { type: 'boolean' },
      }),
    },
  }),
  word: object({
    lemma: string,
    partOfSpeech: { type: 'string', enum: parts },
    article: { ...nullableString, enum: [null, 'der', 'die', 'das'] },
    gender: { ...nullableString, enum: [null, 'masculine', 'feminine', 'neuter'] },
    meaningRu: string,
    formRu: string,
    expression: string,
    matchedVocabularyId: nullableString,
    nounPlural: nullableString,
    irregularVerb: {
      anyOf: [object({ preterite: string, perfect: string }), { type: 'null' }],
    },
  }),
  grammar: object({ rules: { type: 'array', items: rule } }),
};

function valid(condition: unknown): asserts condition {
  if (!condition) throw new ConnectionError('OpenAI вернул некорректный ответ. Повторите попытку.');
}

export function record(value: unknown, keys: string[]): Record<string, unknown> {
  valid(typeof value === 'object' && value !== null && !Array.isArray(value));
  const result = value as Record<string, unknown>;
  valid(
    Object.keys(result).length === keys.length && keys.every((key) => Object.hasOwn(result, key)),
  );
  return result;
}

export function nonempty(value: unknown): asserts value is string {
  valid(typeof value === 'string' && value.trim().length > 0 && value.length <= 20000);
}

export function parseGeneration(value: unknown): {
  title: string;
  sentences: string[];
  occurrences: VocabularyOccurrence[];
} {
  const data = record(value, ['title', 'sentences', 'occurrences']);
  nonempty(data.title);
  valid(Array.isArray(data.sentences) && data.sentences.length > 0 && data.sentences.length <= 300);
  data.sentences.forEach(nonempty);
  valid(data.sentences.join(' ').length <= 60000);
  valid(Array.isArray(data.occurrences) && data.occurrences.length <= 300);
  for (const item of data.occurrences) {
    const occurrence = record(item, [
      'vocabularyId',
      'sentenceIndex',
      'surfaceForm',
      'sameMeaning',
    ]);
    nonempty(occurrence.vocabularyId);
    nonempty(occurrence.surfaceForm);
    valid(
      Number.isSafeInteger(occurrence.sentenceIndex) &&
        (occurrence.sentenceIndex as number) >= 0 &&
        (occurrence.sentenceIndex as number) < data.sentences.length,
    );
    valid(typeof occurrence.sameMeaning === 'boolean');
  }
  return {
    title: data.title,
    sentences: data.sentences as string[],
    occurrences: data.occurrences as VocabularyOccurrence[],
  };
}

export function parseWord(value: unknown): WordCard {
  const data = record(value, [
    'lemma',
    'partOfSpeech',
    'article',
    'gender',
    'meaningRu',
    'formRu',
    'expression',
    'matchedVocabularyId',
    'nounPlural',
    'irregularVerb',
  ]);
  for (const key of ['lemma', 'meaningRu', 'formRu', 'expression']) nonempty(data[key]);
  valid(parts.includes(data.partOfSpeech as string));
  const genders = { der: 'masculine', die: 'feminine', das: 'neuter' };
  valid(
    data.partOfSpeech === 'noun'
      ? typeof data.article === 'string' &&
          Object.hasOwn(genders, data.article) &&
          genders[data.article as keyof typeof genders] === data.gender
      : data.article === null && data.gender === null,
  );
  if (data.matchedVocabularyId !== null) nonempty(data.matchedVocabularyId);
  if (data.nounPlural !== null) {
    valid(data.partOfSpeech === 'noun');
    nonempty(data.nounPlural);
  }
  if (data.irregularVerb !== null) {
    valid(data.partOfSpeech === 'verb');
    const forms = record(data.irregularVerb, ['preterite', 'perfect']);
    nonempty(forms.preterite);
    nonempty(forms.perfect);
  }
  return data as unknown as WordCard;
}

export function parseGrammar(value: unknown, sentence: string): GrammarRule[] {
  const data = record(value, ['rules']);
  valid(Array.isArray(data.rules) && data.rules.length > 0 && data.rules.length <= 20);
  for (const value of data.rules) {
    const rule = record(value, ['titleRu', 'explanationRu', 'fragments', 'examples']);
    nonempty(rule.titleRu);
    nonempty(rule.explanationRu);
    valid(Array.isArray(rule.fragments) && rule.fragments.length > 0);
    for (const fragment of rule.fragments) {
      nonempty(fragment);
      valid(sentence.includes(fragment));
    }
    valid(Array.isArray(rule.examples) && rule.examples.length <= 10);
    for (const value of rule.examples) {
      const example = record(value, ['de', 'ru']);
      nonempty(example.de);
      nonempty(example.ru);
    }
  }
  return data.rules as GrammarRule[];
}
