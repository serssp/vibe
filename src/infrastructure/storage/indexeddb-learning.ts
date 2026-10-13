import {
  LearningStorageError,
  type LearningRepository,
} from '../../application/ports/learning-repository';
import type { LearningWrite } from '../../domain/learning/data';
import type { WordExposure, WordInteraction } from '../../domain/learning/records';
import type { GrammarExplanation } from '../../domain/grammar/models';
import type { ReadingSession, TextDocument } from '../../domain/reading/models';
import type { AppSettings } from '../../domain/settings/app-settings';
import type { VocabularyEntry } from '../../domain/vocabulary/models';
import {
  markUnknown,
  undoUnknown,
  type WordLookup,
  type WordTranslation,
} from '../../domain/vocabulary/lookups';
import { validateLearningWrite } from '../../domain/learning/validation';
import { LearningDatabase, type LearningDatabaseOptions } from './learning-database';
import { LEARNING_STORES, type LearningStore } from './schema';

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new LearningStorageError('write'));
  });
}

function transactionResult(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(new LearningStorageError('write'));
  });
}

function assertValid(condition: unknown): asserts condition {
  if (!condition) throw new LearningStorageError('invalid-data');
}

function same(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
  if (Array.isArray(left) !== Array.isArray(right)) return false;
  const a = left as Record<string, unknown>;
  const b = right as Record<string, unknown>;
  return (
    Object.keys(a).length === Object.keys(b).length &&
    Object.keys(a).every((key) => Object.hasOwn(b, key) && same(a[key], b[key]))
  );
}

export class IndexedDbLearningRepository implements LearningRepository {
  private readonly database: LearningDatabase;

  constructor(options: LearningDatabaseOptions = {}) {
    this.database = new LearningDatabase(options);
  }

  getText(id: string) {
    return this.read<TextDocument>('texts', id);
  }
  getSession(id: string) {
    return this.read<ReadingSession>('sessions', id);
  }
  getVocabularyEntry(id: string) {
    return this.read<VocabularyEntry>('vocabulary', id);
  }
  getGrammarExplanation(id: string) {
    return this.read<GrammarExplanation>('explanations', id);
  }
  getAppSettings() {
    return this.read<AppSettings>('appSettings', 'app');
  }
  getWordInteractions(sessionId: string) {
    return this.forSession<WordInteraction>('interactions', sessionId);
  }
  getWordExposures(sessionId: string) {
    return this.forSession<WordExposure>('exposures', sessionId);
  }
  close() {
    return this.database.close();
  }

  listVocabulary() {
    return this.transact(['vocabulary'], 'readonly', (transaction) =>
      requestResult<VocabularyEntry[]>(transaction.objectStore('vocabulary').getAll()),
    );
  }

  getWordLookup(id: string) {
    return this.read<WordLookup>('wordLookups', id);
  }
  getWordLookups(sessionId: string) {
    return this.forSession<WordLookup>('wordLookups', sessionId);
  }

  getWordTranslation(
    key: Pick<
      WordTranslation,
      'textId' | 'sentenceId' | 'start' | 'end' | 'aiModel' | 'promptVersion'
    >,
  ) {
    return this.transact(['wordTranslations'], 'readonly', (transaction) =>
      requestResult<WordTranslation | undefined>(
        transaction
          .objectStore('wordTranslations')
          .index('byContext')
          .get([key.textId, key.sentenceId, key.start, key.end, key.aiModel, key.promptVersion]),
      ),
    );
  }

  findGrammarExplanation(
    key: Pick<
      GrammarExplanation,
      'textId' | 'sentenceId' | 'cefrLevel' | 'aiModel' | 'promptVersion'
    >,
  ) {
    return this.transact(['explanations'], 'readonly', (transaction) =>
      requestResult<GrammarExplanation | undefined>(
        transaction
          .objectStore('explanations')
          .index('byCacheKey')
          .get([key.textId, key.sentenceId, key.cefrLevel, key.aiModel, key.promptVersion]),
      ),
    );
  }

  resolveWordLookup(
    id: string,
    translation: WordTranslation,
    proposedEntry: VocabularyEntry,
    interactionId: string,
  ) {
    return this.transact([...LEARNING_STORES], 'readwrite', async (transaction) => {
      const lookup = await requestResult<WordLookup | undefined>(
        transaction.objectStore('wordLookups').get(id),
      );
      assertValid(lookup && lookup.state !== 'Cancelled');
      if (lookup.state === 'Resolved') {
        const saved = await requestResult<WordTranslation>(
          transaction.objectStore('wordTranslations').get(lookup.translationId!),
        );
        const entry = await requestResult<VocabularyEntry>(
          transaction.objectStore('vocabulary').get(lookup.vocabularyEntryId!),
        );
        return { lookup, translation: saved, entry };
      }
      const existing = await requestResult<WordTranslation | undefined>(
        transaction
          .objectStore('wordTranslations')
          .index('byContext')
          .get([
            translation.textId,
            translation.sentenceId,
            translation.start,
            translation.end,
            translation.aiModel,
            translation.promptVersion,
          ]),
      );
      const chosen = existing ?? translation;
      const current = await requestResult<VocabularyEntry | undefined>(
        transaction.objectStore('vocabulary').get(chosen.vocabularyEntryId),
      );
      const entry = current ?? proposedEntry;
      assertValid(entry.id === chosen.vocabularyEntryId);
      const resolved: WordLookup = {
        ...lookup,
        state: 'Resolved',
        vocabularyEntryId: entry.id,
        interactionId,
        translationId: chosen.id,
        previous: {
          status: entry.status,
          lastMarkedAt: entry.lastMarkedAt,
          unknownCount: entry.unknownCount,
        },
      };
      const marked = markUnknown(entry, lookup.createdAt);
      const interaction: WordInteraction = {
        id: interactionId,
        sessionId: lookup.selection.sessionId,
        textId: lookup.selection.textId,
        sentenceId: lookup.selection.sentenceId,
        surfaceForm: lookup.selection.surfaceForm,
        action: 'MarkUnknown',
        undoesInteractionId: null,
        timestamp: lookup.createdAt,
        vocabularyEntryId: entry.id,
      };
      await this.write(transaction, {
        wordLookups: [resolved],
        wordTranslations: [chosen],
        vocabulary: [marked],
        interactions: [interaction],
      });
      return { lookup: resolved, translation: chosen, entry: marked };
    });
  }

  undoWordLookup(id: string, undoId: string, timestamp: string) {
    return this.transact([...LEARNING_STORES], 'readwrite', async (transaction) => {
      const lookup = await requestResult<WordLookup | undefined>(
        transaction.objectStore('wordLookups').get(id),
      );
      assertValid(lookup);
      if (lookup.state === 'Cancelled') return;
      if (lookup.state === 'Pending') {
        await this.write(transaction, { wordLookups: [{ ...lookup, state: 'Cancelled' }] });
        return;
      }
      const entry = await requestResult<VocabularyEntry>(
        transaction.objectStore('vocabulary').get(lookup.vocabularyEntryId!),
      );
      const lookups = await requestResult<WordLookup[]>(
        transaction.objectStore('wordLookups').index('byVocabulary').getAll(entry.id),
      );
      const selection = lookup.selection;
      const undo: WordInteraction = {
        id: undoId,
        sessionId: selection.sessionId,
        textId: selection.textId,
        sentenceId: selection.sentenceId,
        surfaceForm: selection.surfaceForm,
        action: 'UndoMarkUnknown',
        undoesInteractionId: lookup.interactionId,
        timestamp,
        vocabularyEntryId: entry.id,
      };
      await this.write(transaction, {
        wordLookups: [{ ...lookup, state: 'Cancelled' }],
        vocabulary: [undoUnknown(entry, lookup, lookups)],
        interactions: [undo],
      });
    });
  }

  getCurrentReading() {
    return this.transact(['texts', 'sessions'], 'readonly', async (transaction) => {
      const texts = await requestResult<TextDocument[]>(transaction.objectStore('texts').getAll());
      const text = texts.sort(
        (a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id),
      )[0];
      if (!text) return undefined;
      const sessions = await requestResult<ReadingSession[]>(
        transaction.objectStore('sessions').index('byText').getAll(text.id),
      );
      const session = sessions.find((item) => item.status !== 'Completed');
      return session ? { text, session } : undefined;
    });
  }

  async getRecentTopics(limit: number) {
    const texts = await this.transact(['texts'], 'readonly', (transaction) =>
      requestResult<TextDocument[]>(transaction.objectStore('texts').getAll()),
    );
    return texts
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit)
      .map((text) => text.title);
  }

  async commit(changes: LearningWrite): Promise<void> {
    let snapshot: LearningWrite;
    try {
      snapshot = structuredClone(changes);
      validateLearningWrite(snapshot);
    } catch {
      throw new LearningStorageError('invalid-data');
    }
    await this.transact([...LEARNING_STORES], 'readwrite', (transaction) =>
      this.write(transaction, snapshot),
    );
  }

  private async write(transaction: IDBTransaction, snapshot: LearningWrite) {
    validateLearningWrite(snapshot);
    const groups = {
      texts: snapshot.texts ?? [],
      sessions: snapshot.sessions ?? [],
      vocabulary: snapshot.vocabulary ?? [],
      interactions: snapshot.interactions ?? [],
      exposures: snapshot.exposures ?? [],
      explanations: snapshot.explanations ?? [],
      appSettings: snapshot.appSettings ? [snapshot.appSettings] : [],
      wordLookups: snapshot.wordLookups ?? [],
      wordTranslations: snapshot.wordTranslations ?? [],
    };
    for (const store of LEARNING_STORES) {
      for (const entity of groups[store]) {
        const existing = await requestResult(transaction.objectStore(store).get(entity.id));
        if (existing) {
          if (
            ['texts', 'interactions', 'exposures', 'explanations', 'wordTranslations'].includes(
              store,
            )
          ) {
            assertValid(same(existing, entity));
          } else if (store === 'sessions') {
            const before = existing as ReadingSession;
            const after = entity as ReadingSession;
            assertValid(before.textId === after.textId);
            assertValid(before.status !== 'Completed' || same(before, after));
            assertValid(before.status !== 'InProgress' || after.status !== 'New');
          } else if (store === 'vocabulary') {
            const before = existing as VocabularyEntry;
            const after = entity as VocabularyEntry;
            assertValid(
              before.lemma === after.lemma &&
                before.partOfSpeech === after.partOfSpeech &&
                before.senseKey === after.senseKey &&
                before.createdAt === after.createdAt,
            );
          } else if (store === 'wordLookups') {
            const before = existing as WordLookup;
            const after = entity as WordLookup;
            assertValid(
              same(before.selection, after.selection) &&
                before.createdAt === after.createdAt &&
                before.aiModel === after.aiModel &&
                before.promptVersion === after.promptVersion,
            );
            assertValid(before.state !== 'Cancelled' || same(before, after));
            assertValid(
              before.state !== 'Resolved' ||
                (after.state !== 'Pending' &&
                  before.interactionId === after.interactionId &&
                  before.translationId === after.translationId &&
                  before.vocabularyEntryId === after.vocabularyEntryId &&
                  same(before.previous, after.previous)),
            );
          }
        }
        await requestResult(transaction.objectStore(store).put(entity));
      }
    }
    await this.validateReferences(transaction, snapshot);
  }

  private async validateReferences(transaction: IDBTransaction, changes: LearningWrite) {
    const required = async <T>(store: LearningStore, id: string): Promise<T> => {
      const value: T | undefined = await requestResult(transaction.objectStore(store).get(id));
      assertValid(value);
      return value;
    };
    const word = (id: string) => required<VocabularyEntry>('vocabulary', id);
    const text = (id: string) => required<TextDocument>('texts', id);
    const session = (id: string) => required<ReadingSession>('sessions', id);
    for (const document of changes.texts ?? []) {
      for (const id of document.targetVocabularyIds) await word(id);
    }
    for (const reading of changes.sessions ?? []) {
      const document = await text(reading.textId);
      assertValid(
        reading.readingPosition.sentenceId === null ||
          document.sentences.some((s) => s.id === reading.readingPosition.sentenceId),
      );
      for (const id of reading.reviewCandidateIds) await word(id);
    }
    for (const interaction of changes.interactions ?? []) {
      const reading = await session(interaction.sessionId);
      const document = await text(interaction.textId);
      await word(interaction.vocabularyEntryId);
      assertValid(reading.textId === interaction.textId);
      assertValid(
        reading.startedAt !== null &&
          Date.parse(interaction.timestamp) >= Date.parse(reading.startedAt),
      );
      assertValid(
        reading.completedAt === null ||
          Date.parse(interaction.timestamp) <= Date.parse(reading.completedAt),
      );
      assertValid(document.sentences.some((s) => s.id === interaction.sentenceId));
      if (interaction.undoesInteractionId !== null) {
        const original = await required<WordInteraction>(
          'interactions',
          interaction.undoesInteractionId,
        );
        assertValid(
          original.action === 'MarkUnknown' &&
            original.sessionId === interaction.sessionId &&
            original.vocabularyEntryId === interaction.vocabularyEntryId &&
            original.sentenceId === interaction.sentenceId &&
            original.surfaceForm === interaction.surfaceForm &&
            Date.parse(original.timestamp) <= Date.parse(interaction.timestamp),
        );
      }
    }
    for (const exposure of changes.exposures ?? []) {
      const reading = await session(exposure.sessionId);
      const document = await text(reading.textId);
      await word(exposure.vocabularyEntryId);
      assertValid(reading.status === 'Completed' && exposure.occurredAt === reading.completedAt);
      assertValid(reading.reviewCandidateIds.includes(exposure.vocabularyEntryId));
      assertValid(document.includedVocabularyIds.includes(exposure.vocabularyEntryId));
    }
    for (const explanation of changes.explanations ?? []) {
      const document = await text(explanation.textId);
      assertValid(document.sentences.some((s) => s.id === explanation.sentenceId));
    }
    for (const lookup of changes.wordLookups ?? []) {
      const reading = await session(lookup.selection.sessionId);
      const document = await text(lookup.selection.textId);
      const sentence = document.sentences.find((s) => s.id === lookup.selection.sentenceId);
      assertValid(
        reading.textId === document.id &&
          reading.status === 'InProgress' &&
          sentence &&
          sentence.content.slice(lookup.selection.start, lookup.selection.end) ===
            lookup.selection.surfaceForm,
      );
      if (lookup.vocabularyEntryId !== null) {
        await word(lookup.vocabularyEntryId);
        const translation = await required<WordTranslation>(
          'wordTranslations',
          lookup.translationId!,
        );
        const interaction = await required<WordInteraction>('interactions', lookup.interactionId!);
        assertValid(
          translation.vocabularyEntryId === lookup.vocabularyEntryId &&
            translation.textId === document.id &&
            translation.sentenceId === sentence.id &&
            translation.start === lookup.selection.start &&
            translation.end === lookup.selection.end &&
            translation.aiModel === lookup.aiModel &&
            translation.promptVersion === lookup.promptVersion,
        );
        assertValid(
          interaction.action === 'MarkUnknown' &&
            interaction.sessionId === reading.id &&
            interaction.vocabularyEntryId === lookup.vocabularyEntryId,
        );
      }
    }
    for (const translation of changes.wordTranslations ?? []) {
      const document = await text(translation.textId);
      const sentence = document.sentences.find((s) => s.id === translation.sentenceId);
      const entry = await word(translation.vocabularyEntryId);
      assertValid(
        sentence &&
          translation.end <= sentence.content.length &&
          entry.lemma === translation.card.lemma &&
          entry.partOfSpeech === translation.card.partOfSpeech &&
          entry.article === translation.card.article,
      );
    }
  }

  private read<T>(store: LearningStore, id: string): Promise<T | undefined> {
    return this.transact([store], 'readonly', (transaction) =>
      requestResult(transaction.objectStore(store).get(id)),
    );
  }

  private forSession<T>(
    store: 'interactions' | 'exposures' | 'wordLookups',
    sessionId: string,
  ): Promise<T[]> {
    return this.transact([store], 'readonly', (transaction) =>
      requestResult(transaction.objectStore(store).index('bySession').getAll(sessionId)),
    );
  }

  private async transact<T>(
    stores: LearningStore[],
    mode: IDBTransactionMode,
    work: (transaction: IDBTransaction) => Promise<T>,
  ): Promise<T> {
    const database = await this.database.open();
    let transaction: IDBTransaction;
    try {
      transaction = database.transaction(
        stores.filter((store) => database.objectStoreNames.contains(store)),
        mode,
      );
    } catch {
      throw new LearningStorageError('unavailable');
    }
    const completion = transactionResult(transaction);
    let failure: unknown;
    void completion.catch(() => undefined);
    let result: T | undefined;
    try {
      result = await work(transaction);
    } catch (error) {
      failure = error instanceof LearningStorageError ? error : new LearningStorageError('write');
      try {
        transaction.abort();
      } catch {
        failure ??= new LearningStorageError('write');
      }
    }
    try {
      await completion;
    } catch (error) {
      failure ??= error;
    }
    if (failure) throw failure;
    return result as T;
  }
}
