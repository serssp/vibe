import type { LearningWrite } from './data';
import type { WordInteraction } from './records';
import type { ReadingSession, TextDocument } from '../reading/models';
import type { VocabularyEntry } from '../vocabulary/models';

export function effectiveMarks(interactions: WordInteraction[]): WordInteraction[] {
  const undone = new Set(interactions.map((item) => item.undoesInteractionId).filter(Boolean));
  return interactions.filter((item) => item.action === 'MarkUnknown' && !undone.has(item.id));
}

export function completeReading(
  session: ReadingSession,
  text: TextDocument,
  vocabulary: VocabularyEntry[],
  interactions: WordInteraction[],
  timestamp: string,
  id: () => string,
  confirmedIds: string[] = text.includedVocabularyIds,
): LearningWrite {
  if (session.status === 'Completed') return {};
  if (session.status !== 'InProgress' || text.id !== session.textId)
    throw new Error('Invalid reading session');
  const marks = new Set(effectiveMarks(interactions).map((item) => item.vocabularyEntryId));
  const candidates = new Set(session.reviewCandidateIds);
  const included = new Set(confirmedIds);
  const repeated = vocabulary.filter((entry) => candidates.has(entry.id) && included.has(entry.id));
  return {
    sessions: [{ ...session, status: 'Completed', completedAt: timestamp }],
    exposures: repeated.map((entry) => ({
      id: id(),
      sessionId: session.id,
      vocabularyEntryId: entry.id,
      markedUnknown: marks.has(entry.id),
      occurredAt: timestamp,
    })),
    vocabulary: repeated.map((entry) => {
      const firstMarkedHere = interactions.some(
        (item) =>
          item.vocabularyEntryId === entry.id &&
          Date.parse(item.timestamp) === Date.parse(entry.createdAt),
      );
      const markedLater =
        Date.parse(entry.lastMarkedAt) > Date.parse(session.startedAt!) &&
        !interactions.some(
          (item) =>
            item.vocabularyEntryId === entry.id &&
            Date.parse(item.timestamp) === Date.parse(entry.lastMarkedAt),
        );
      return {
        ...entry,
        exposureCount: entry.exposureCount + 1,
        status: marks.has(entry.id) || firstMarkedHere || markedLater ? 'Unknown' : 'Learned',
      };
    }),
  };
}
