import type { VocabularyEntry } from './models';
import type { WordCard } from './word-card';

export interface WordSelection {
  sessionId: string;
  textId: string;
  sentenceId: string;
  surfaceForm: string;
  start: number;
  end: number;
}

export interface WordLookup {
  id: string;
  selection: WordSelection;
  createdAt: string;
  aiModel: string;
  promptVersion: string;
  state: 'Pending' | 'Resolved' | 'Cancelled';
  vocabularyEntryId: string | null;
  interactionId: string | null;
  translationId: string | null;
  previous: Pick<VocabularyEntry, 'status' | 'lastMarkedAt' | 'unknownCount'> | null;
}

export interface WordTranslation {
  id: string;
  textId: string;
  sentenceId: string;
  start: number;
  end: number;
  aiModel: string;
  promptVersion: string;
  vocabularyEntryId: string;
  card: WordCard;
}

export function normalizeLemma(lemma: string) {
  return lemma.normalize('NFC').trim().toLocaleLowerCase('de');
}

export function markUnknown(entry: VocabularyEntry, timestamp: string): VocabularyEntry {
  return {
    ...entry,
    status: 'Unknown',
    unknownCount: entry.unknownCount + 1,
    lastMarkedAt: timestamp > entry.lastMarkedAt ? timestamp : entry.lastMarkedAt,
  };
}

export function undoUnknown(
  entry: VocabularyEntry,
  lookup: WordLookup,
  lookups: WordLookup[],
): VocabularyEntry {
  const chain = lookups.filter(
    (item) =>
      item.vocabularyEntryId === entry.id &&
      item.selection.sessionId === lookup.selection.sessionId &&
      item.previous !== null,
  );
  const baseline = chain.reduce<WordLookup | undefined>(
    (first, item) =>
      !first || item.previous!.unknownCount < first.previous!.unknownCount ? item : first,
    undefined,
  );
  const remaining = chain.filter((item) => item.id !== lookup.id && item.state === 'Resolved');
  const latest = remaining.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const lastMark = latest
    ? latest.createdAt
    : (baseline?.previous?.lastMarkedAt ?? entry.createdAt);
  return {
    ...entry,
    unknownCount: Math.max(0, entry.unknownCount - 1),
    status: remaining.length ? 'Unknown' : (baseline?.previous?.status ?? 'Unknown'),
    lastMarkedAt: lastMark > entry.createdAt ? lastMark : entry.createdAt,
  };
}
