import type { LearningWrite, LearningSnapshot } from '../../domain/learning/data';
import type { WordExposure, WordInteraction } from '../../domain/learning/records';
import type { GrammarExplanation } from '../../domain/grammar/models';
import type { ReadingSession, TextDocument } from '../../domain/reading/models';
import type { AppSettings } from '../../domain/settings/app-settings';
import type { VocabularyEntry } from '../../domain/vocabulary/models';
import type { WordLookup, WordTranslation } from '../../domain/vocabulary/lookups';

export interface LearningRepository {
  openReading(textId: string): Promise<{ text: TextDocument; session: ReadingSession }>;
  listHistory(): Promise<{ text: TextDocument; sessions: ReadingSession[] }[]>;
  startReading(textId: string, sessionId: string, timestamp: string): Promise<ReadingSession>;
  saveReadingPosition(
    sessionId: string,
    position: ReadingSession['readingPosition'],
  ): Promise<void>;
  completeReading(sessionId: string, timestamp: string, id: () => string): Promise<ReadingSession>;
  snapshot(): Promise<LearningSnapshot>;
  replace(snapshot: LearningSnapshot): Promise<void>;
  getCurrentReading(): Promise<{ text: TextDocument; session: ReadingSession } | undefined>;
  getRecentTopics(limit: number): Promise<string[]>;
  listVocabulary(): Promise<VocabularyEntry[]>;
  getVocabularyFacts(
    id: string,
  ): Promise<{ interactions: WordInteraction[]; exposures: WordExposure[] }>;
  getWordLookup(id: string): Promise<WordLookup | undefined>;
  getWordLookups(sessionId: string): Promise<WordLookup[]>;
  getWordTranslation(
    key: Pick<
      WordTranslation,
      'textId' | 'sentenceId' | 'start' | 'end' | 'aiModel' | 'promptVersion'
    >,
  ): Promise<WordTranslation | undefined>;
  resolveWordLookup(
    id: string,
    translation: WordTranslation,
    proposedEntry: VocabularyEntry,
    interactionId: string,
  ): Promise<{ lookup: WordLookup; translation: WordTranslation; entry: VocabularyEntry }>;
  undoWordLookup(id: string, undoId: string, timestamp: string): Promise<void>;
  findGrammarExplanation(
    key: Pick<
      GrammarExplanation,
      'textId' | 'sentenceId' | 'cefrLevel' | 'aiModel' | 'promptVersion'
    >,
  ): Promise<GrammarExplanation | undefined>;
  getText(id: string): Promise<TextDocument | undefined>;
  getSession(id: string): Promise<ReadingSession | undefined>;
  getVocabularyEntry(id: string): Promise<VocabularyEntry | undefined>;
  getGrammarExplanation(id: string): Promise<GrammarExplanation | undefined>;
  getWordInteractions(sessionId: string): Promise<WordInteraction[]>;
  getWordExposures(sessionId: string): Promise<WordExposure[]>;
  getAppSettings(): Promise<AppSettings | undefined>;
  commit(changes: LearningWrite): Promise<void>;
}

export type StorageErrorCode =
  'unavailable' | 'blocked' | 'migration' | 'invalid-data' | 'write' | 'pending-lookups';

export class LearningStorageError extends Error {
  constructor(public readonly code: StorageErrorCode) {
    super(
      {
        unavailable: 'Локальное хранилище недоступно.',
        blocked: 'Закройте другие вкладки приложения и повторите попытку.',
        migration: 'Не удалось открыть версию хранилища. Сохранённые данные не удалены.',
        'invalid-data': 'Данные не прошли проверку. Изменения не сохранены.',
        write: 'Не удалось сохранить данные. Повторите попытку.',
        'pending-lookups': 'Повторите или отмените незавершённые отметки перед завершением чтения.',
      }[code],
    );
  }
}
