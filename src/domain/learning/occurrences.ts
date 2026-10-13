import { normalizeLemma } from '../vocabulary/lookups';
import { tokenize } from '../reading/tokens';
import type { VocabularyEntry } from '../vocabulary/models';

export interface VocabularyOccurrence {
  vocabularyId: string;
  sentenceIndex: number;
  surfaceForm: string;
  sameMeaning: boolean;
}

export function confirmedVocabulary(
  sentences: string[],
  candidates: VocabularyEntry[],
  occurrences: VocabularyOccurrence[],
): string[] {
  const confirmed = new Set<string>();
  for (const occurrence of occurrences) {
    const word = candidates.find((entry) => entry.id === occurrence.vocabularyId);
    const sentence = sentences[occurrence.sentenceIndex];
    if (!word || !sentence || !occurrence.sameMeaning || !sentence.includes(occurrence.surfaceForm))
      continue;
    const lemma = normalizeLemma(word.lemma);
    if (candidates.filter((entry) => normalizeLemma(entry.lemma) === lemma).length !== 1) continue;
    if (normalizeLemma(occurrence.surfaceForm) !== lemma) continue;
    const tokens = tokenize(sentence)
      .filter((token) => token.word)
      .map((token) => token.content);
    const phrase = tokenize(occurrence.surfaceForm)
      .filter((token) => token.word)
      .map((token) => token.content);
    if (!phrase.length) continue;
    if (tokens.some((_, start) => phrase.every((part, i) => tokens[start + i] === part)))
      confirmed.add(word.id);
  }
  return [...confirmed];
}
