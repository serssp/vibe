export type PartOfSpeech =
  | 'noun'
  | 'verb'
  | 'adjective'
  | 'adverb'
  | 'pronoun'
  | 'preposition'
  | 'conjunction'
  | 'article'
  | 'numeral'
  | 'particle'
  | 'expression'
  | 'other';

export interface WordCard {
  lemma: string;
  partOfSpeech: PartOfSpeech;
  article: 'der' | 'die' | 'das' | null;
  gender: 'masculine' | 'feminine' | 'neuter' | null;
  meaningRu: string;
  formRu: string;
  expression: string;
  matchedVocabularyId: string | null;
  nounPlural?: string | null;
  irregularVerb?: { preterite: string; perfect: string } | null;
}
