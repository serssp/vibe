import type { LearningWrite } from './data';

export class InvalidLearningData extends Error {
  constructor() {
    super('Invalid learning data');
  }
}

function requireValid(condition: unknown): asserts condition {
  if (!condition) throw new InvalidLearningData();
}

function object(value: unknown, keys: string[], optional: string[] = []): Record<string, unknown> {
  requireValid(value !== null && typeof value === 'object' && !Array.isArray(value));
  const record = value as Record<string, unknown>;
  requireValid(Object.keys(record).every((key) => keys.includes(key) || optional.includes(key)));
  requireValid(keys.every((key) => Object.hasOwn(record, key)));
  return record;
}

function nonempty(value: unknown): asserts value is string {
  requireValid(typeof value === 'string' && value.trim().length > 0);
}

function date(value: unknown): asserts value is string {
  nonempty(value);
  requireValid(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value));
  const timestamp = Date.parse(value);
  requireValid(Number.isFinite(timestamp));
  requireValid(
    new Date(timestamp).toISOString() ===
      (value.length === 20 ? `${value.slice(0, -1)}.000Z` : value),
  );
}

function oneOf(value: unknown, choices: readonly unknown[]) {
  requireValid(choices.includes(value));
}

function number(value: unknown, integer = false): asserts value is number {
  requireValid(typeof value === 'number' && Number.isFinite(value) && value >= 0);
  requireValid(!integer || Number.isSafeInteger(value));
}

function array(value: unknown): unknown[] {
  requireValid(Array.isArray(value));
  requireValid(Object.keys(value).length === value.length);
  requireValid(Object.keys(value).every((key, index) => key === String(index)));
  return value;
}

function ids(value: unknown) {
  const values = array(value);
  values.forEach(nonempty);
  requireValid(new Set(values).size === values.length);
}

function text(value: unknown) {
  const v = object(value, [
    'id',
    'title',
    'content',
    'sentences',
    'cefrLevel',
    'targetDuration',
    'createdAt',
    'aiModel',
    'promptVersion',
    'targetVocabularyIds',
    'includedVocabularyIds',
  ]);
  for (const key of ['id', 'title', 'content', 'aiModel', 'promptVersion']) nonempty(v[key]);
  date(v.createdAt);
  oneOf(v.cefrLevel, ['A1', 'A2', 'B1']);
  oneOf(v.targetDuration, [3, 4, 5]);
  ids(v.targetVocabularyIds);
  ids(v.includedVocabularyIds);
  requireValid(
    array(v.includedVocabularyIds).every((id) => array(v.targetVocabularyIds).includes(id)),
  );
  const sentences = array(v.sentences).map((sentence) => {
    const s = object(sentence, ['id', 'content']);
    nonempty(s.id);
    nonempty(s.content);
    return s;
  });
  requireValid(sentences.length > 0);
  requireValid(new Set(sentences.map((s) => s.id)).size === sentences.length);
  requireValid(
    sentences
      .map((s) => s.content)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim() === (v.content as string).replace(/\s+/g, ' ').trim(),
  );
}

function session(value: unknown) {
  const v = object(value, [
    'id',
    'textId',
    'status',
    'startedAt',
    'completedAt',
    'readingPosition',
    'reviewCandidateIds',
  ]);
  nonempty(v.id);
  nonempty(v.textId);
  oneOf(v.status, ['New', 'InProgress', 'Completed']);
  if (v.startedAt !== null) date(v.startedAt);
  if (v.completedAt !== null) date(v.completedAt);
  requireValid(v.status !== 'New' || (v.startedAt === null && v.completedAt === null));
  requireValid(v.status !== 'InProgress' || (v.startedAt !== null && v.completedAt === null));
  requireValid(v.status !== 'Completed' || (v.startedAt !== null && v.completedAt !== null));
  requireValid(
    v.completedAt === null ||
      Date.parse(v.completedAt as string) >= Date.parse(v.startedAt as string),
  );
  const position = object(v.readingPosition, ['sentenceId', 'scrollOffset']);
  if (position.sentenceId !== null) nonempty(position.sentenceId);
  number(position.scrollOffset);
  ids(v.reviewCandidateIds);
}

function vocabulary(value: unknown) {
  const v = object(value, [
    'id',
    'lemma',
    'partOfSpeech',
    'article',
    'meaningRu',
    'senseKey',
    'status',
    'createdAt',
    'lastMarkedAt',
    'unknownCount',
    'exposureCount',
  ]);
  for (const key of ['id', 'lemma', 'partOfSpeech', 'meaningRu', 'senseKey']) nonempty(v[key]);
  oneOf(v.article, [null, 'der', 'die', 'das']);
  oneOf(v.status, ['Unknown', 'Learned']);
  date(v.createdAt);
  date(v.lastMarkedAt);
  requireValid(Date.parse(v.lastMarkedAt) >= Date.parse(v.createdAt));
  number(v.unknownCount, true);
  number(v.exposureCount, true);
}

function interaction(value: unknown) {
  const v = object(value, [
    'id',
    'sessionId',
    'textId',
    'vocabularyEntryId',
    'surfaceForm',
    'sentenceId',
    'action',
    'undoesInteractionId',
    'timestamp',
  ]);
  for (const key of ['id', 'sessionId', 'textId', 'vocabularyEntryId', 'surfaceForm', 'sentenceId'])
    nonempty(v[key]);
  oneOf(v.action, ['MarkUnknown', 'UndoMarkUnknown']);
  requireValid(v.action !== 'MarkUnknown' || v.undoesInteractionId === null);
  if (v.action === 'UndoMarkUnknown') nonempty(v.undoesInteractionId);
  date(v.timestamp);
}

function exposure(value: unknown) {
  const v = object(value, ['id', 'sessionId', 'vocabularyEntryId', 'markedUnknown', 'occurredAt']);
  for (const key of ['id', 'sessionId', 'vocabularyEntryId']) nonempty(v[key]);
  requireValid(typeof v.markedUnknown === 'boolean');
  date(v.occurredAt);
}

function explanation(value: unknown) {
  const v = object(value, [
    'id',
    'textId',
    'sentenceId',
    'cefrLevel',
    'explanation',
    'aiModel',
    'promptVersion',
    'createdAt',
  ]);
  for (const key of ['id', 'textId', 'sentenceId', 'aiModel', 'promptVersion']) nonempty(v[key]);
  oneOf(v.cefrLevel, ['A1', 'A2', 'B1']);
  date(v.createdAt);
  const rules = array(object(v.explanation, ['rules']).rules);
  requireValid(rules.length > 0);
  for (const rule of rules) {
    const r = object(rule, ['titleRu', 'explanationRu', 'fragments', 'examples']);
    nonempty(r.titleRu);
    nonempty(r.explanationRu);
    array(r.fragments).forEach(nonempty);
    for (const example of array(r.examples)) {
      const e = object(example, ['de', 'ru']);
      nonempty(e.de);
      nonempty(e.ru);
    }
  }
}

function settings(value: unknown) {
  const v = object(value, ['id', 'activeSessionId', 'model', 'cefrLevel', 'targetDuration', 'ui']);
  oneOf(v.id, ['app']);
  if (v.activeSessionId !== null) nonempty(v.activeSessionId);
  nonempty(v.model);
  oneOf(v.cefrLevel, ['A1', 'A2', 'B1']);
  oneOf(v.targetDuration, [3, 4, 5]);
  const ui = object(v.ui, ['fontScale']);
  number(ui.fontScale);
  requireValid(ui.fontScale > 0);
}

function selection(value: unknown) {
  const v = object(value, ['sessionId', 'textId', 'sentenceId', 'surfaceForm', 'start', 'end']);
  for (const key of ['sessionId', 'textId', 'sentenceId', 'surfaceForm']) nonempty(v[key]);
  number(v.start, true);
  number(v.end, true);
  requireValid(v.end > v.start);
}

function wordLookup(value: unknown) {
  const v = object(value, [
    'id',
    'selection',
    'createdAt',
    'aiModel',
    'promptVersion',
    'state',
    'vocabularyEntryId',
    'interactionId',
    'translationId',
    'previous',
  ]);
  for (const key of ['id', 'aiModel', 'promptVersion']) nonempty(v[key]);
  date(v.createdAt);
  selection(v.selection);
  oneOf(v.state, ['Pending', 'Resolved', 'Cancelled']);
  for (const key of ['vocabularyEntryId', 'interactionId', 'translationId']) {
    if (v[key] !== null) nonempty(v[key]);
    requireValid(v.state !== 'Pending' || v[key] === null);
    requireValid(v.state !== 'Resolved' || v[key] !== null);
  }
  requireValid(v.state !== 'Pending' || v.previous === null);
  requireValid(v.state !== 'Resolved' || v.previous !== null);
  if (v.previous !== null) {
    const p = object(v.previous, ['status', 'lastMarkedAt', 'unknownCount']);
    oneOf(p.status, ['Unknown', 'Learned']);
    date(p.lastMarkedAt);
    number(p.unknownCount, true);
  }
}

function wordTranslation(value: unknown) {
  const v = object(value, [
    'id',
    'textId',
    'sentenceId',
    'start',
    'end',
    'aiModel',
    'promptVersion',
    'vocabularyEntryId',
    'card',
  ]);
  for (const key of ['id', 'textId', 'sentenceId', 'aiModel', 'promptVersion', 'vocabularyEntryId'])
    nonempty(v[key]);
  number(v.start, true);
  number(v.end, true);
  requireValid(v.end > v.start);
  const card = object(
    v.card,
    [
      'lemma',
      'partOfSpeech',
      'article',
      'gender',
      'meaningRu',
      'formRu',
      'expression',
      'matchedVocabularyId',
    ],
    ['nounPlural', 'irregularVerb'],
  );
  for (const key of ['lemma', 'partOfSpeech', 'meaningRu', 'formRu', 'expression'])
    nonempty(card[key]);
  oneOf(card.partOfSpeech, [
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
  ]);
  const genders = { der: 'masculine', die: 'feminine', das: 'neuter' };
  requireValid(
    card.partOfSpeech === 'noun'
      ? typeof card.article === 'string' &&
          Object.hasOwn(genders, card.article) &&
          genders[card.article as keyof typeof genders] === card.gender
      : card.article === null && card.gender === null,
  );
  if (card.matchedVocabularyId !== null) nonempty(card.matchedVocabularyId);
  if (Object.hasOwn(card, 'nounPlural') && card.nounPlural !== null) {
    requireValid(card.partOfSpeech === 'noun');
    nonempty(card.nounPlural);
  }
  if (Object.hasOwn(card, 'irregularVerb') && card.irregularVerb !== null) {
    requireValid(card.partOfSpeech === 'verb');
    const forms = object(card.irregularVerb, ['preterite', 'perfect']);
    nonempty(forms.preterite);
    nonempty(forms.perfect);
  }
}

export function validateLearningWrite(value: unknown): asserts value is LearningWrite {
  requireValid(value !== null && typeof value === 'object' && !Array.isArray(value));
  const v = value as Record<string, unknown>;
  const validators: Record<string, (entity: unknown) => void> = {
    texts: text,
    sessions: session,
    vocabulary,
    interactions: interaction,
    exposures: exposure,
    explanations: explanation,
    wordLookups: wordLookup,
    wordTranslations: wordTranslation,
  };
  requireValid(
    Object.keys(v).every((key) => Object.hasOwn(validators, key) || key === 'appSettings'),
  );
  for (const [key, items] of Object.entries(v)) {
    if (key === 'appSettings') {
      settings(items);
    } else {
      const entries = array(items);
      entries.forEach(validators[key]!);
      requireValid(
        new Set(entries.map((entry) => (entry as { id: string }).id)).size === entries.length,
      );
    }
  }
}
