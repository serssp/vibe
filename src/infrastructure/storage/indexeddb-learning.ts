import {
  LearningStorageError,
  type LearningRepository,
} from '../../application/ports/learning-repository';
import type { LearningWrite, LearningSnapshot } from '../../domain/learning/data';
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
import { completeReading } from '../../domain/learning/completion';
import { validateSnapshot } from '../../domain/learning/backup';
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

  getVocabularyFacts(id: string) {
    return this.transact(['interactions', 'exposures'], 'readonly', async (transaction) => {
      const [interactions, exposures] = await Promise.all([
        requestResult<WordInteraction[]>(
          transaction.objectStore('interactions').index('byVocabulary').getAll(id),
        ),
        requestResult<WordExposure[]>(
          transaction.objectStore('exposures').index('byVocabulary').getAll(id),
        ),
      ]);
      return { interactions, exposures };
    });
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
      const reading = await requestResult<ReadingSession | undefined>(
        transaction.objectStore('sessions').get(lookup.selection.sessionId),
      );
      assertValid(reading?.status === 'InProgress');
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

  listHistory() {
    return this.transact(['texts', 'sessions'], 'readonly', async (transaction) => {
      const [texts, sessions] = await Promise.all([
        requestResult<TextDocument[]>(transaction.objectStore('texts').getAll()),
        requestResult<ReadingSession[]>(transaction.objectStore('sessions').getAll()),
      ]);
      const byText = new Map<string, ReadingSession[]>();
      for (const session of sessions) {
        const group = byText.get(session.textId) ?? [];
        group.push(session);
        byText.set(session.textId, group);
      }
      return texts
        .sort(
          (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || b.id.localeCompare(a.id),
        )
        .map((text) => ({
          text,
          sessions: (byText.get(text.id) ?? []).sort(
            (a, b) =>
              (Date.parse(b.startedAt ?? '') || 0) - (Date.parse(a.startedAt ?? '') || 0) ||
              b.id.localeCompare(a.id),
          ),
        }));
    });
  }

  async getCurrentReading() {
    const preferences = await this.getAppSettings();
    if (preferences?.activeSessionId) {
      const session = await this.getSession(preferences.activeSessionId);
      const text = session ? await this.getText(session.textId) : undefined;
      if (text && session) return { text, session };
    }
    const history = await this.listHistory();
    for (const item of history) {
      const session = item.sessions.find((session) => session.status !== 'Completed');
      if (session) return { text: item.text, session };
    }
    return undefined;
  }

  openReading(textId: string) {
    return this.transact([...LEARNING_STORES], 'readwrite', async (transaction) => {
      const text = await requestResult<TextDocument | undefined>(
        transaction.objectStore('texts').get(textId),
      );
      const sessions = await requestResult<ReadingSession[]>(
        transaction.objectStore('sessions').index('byText').getAll(textId),
      );
      const sorted = sessions.sort(
        (a, b) =>
          (Date.parse(b.startedAt ?? '') || 0) - (Date.parse(a.startedAt ?? '') || 0) ||
          b.id.localeCompare(a.id),
      );
      const session = sorted.find((item) => item.status !== 'Completed') ?? sorted[0];
      assertValid(text && session);
      await this.selectSession(transaction, text, session);
      return { text, session };
    });
  }

  private async selectSession(
    transaction: IDBTransaction,
    text: TextDocument,
    session: ReadingSession,
  ) {
    const settings = await requestResult<AppSettings | undefined>(
      transaction.objectStore('appSettings').get('app'),
    );
    await this.write(transaction, {
      appSettings: {
        id: 'app',
        model: settings?.model ?? text.aiModel,
        cefrLevel: settings?.cefrLevel ?? text.cefrLevel,
        targetDuration: settings?.targetDuration ?? text.targetDuration,
        ui: settings?.ui ?? { fontScale: 1 },
        activeSessionId: session.id,
      },
    });
  }

  startReading(textId: string, sessionId: string, timestamp: string) {
    return this.transact([...LEARNING_STORES], 'readwrite', async (transaction) => {
      const text = await requestResult<TextDocument | undefined>(
        transaction.objectStore('texts').get(textId),
      );
      assertValid(text);
      const sessions = await requestResult<ReadingSession[]>(
        transaction.objectStore('sessions').index('byText').getAll(textId),
      );
      const active = sessions.find((session) => session.status !== 'Completed');
      if (active?.status === 'InProgress') {
        await this.selectSession(transaction, text, active);
        return active;
      }
      const vocabulary = await requestResult<VocabularyEntry[]>(
        transaction.objectStore('vocabulary').getAll(),
      );
      const session: ReadingSession = {
        id: active?.id ?? sessionId,
        textId,
        status: 'InProgress',
        startedAt: timestamp,
        completedAt: null,
        readingPosition: active?.readingPosition ?? { sentenceId: null, scrollOffset: 0 },
        reviewCandidateIds: vocabulary
          .filter(
            (word) =>
              word.status === 'Unknown' &&
              word.unknownCount > 0 &&
              text.includedVocabularyIds.includes(word.id),
          )
          .map((word) => word.id),
      };
      await this.write(transaction, { sessions: [session] });
      await this.selectSession(transaction, text, session);
      return session;
    });
  }

  saveReadingPosition(sessionId: string, position: ReadingSession['readingPosition']) {
    const snapshot = structuredClone(position);
    return this.transact([...LEARNING_STORES], 'readwrite', async (transaction) => {
      const session = await requestResult<ReadingSession | undefined>(
        transaction.objectStore('sessions').get(sessionId),
      );
      assertValid(session);
      if (session.status !== 'Completed')
        await this.write(transaction, { sessions: [{ ...session, readingPosition: snapshot }] });
    });
  }

  completeReading(sessionId: string, timestamp: string, id: () => string) {
    return this.transact([...LEARNING_STORES], 'readwrite', async (transaction) => {
      const session = await requestResult<ReadingSession | undefined>(
        transaction.objectStore('sessions').get(sessionId),
      );
      assertValid(session);
      if (session.status === 'Completed') return session;
      const [text, vocabulary, interactions, lookups] = await Promise.all([
        requestResult<TextDocument>(transaction.objectStore('texts').get(session.textId)),
        requestResult<VocabularyEntry[]>(transaction.objectStore('vocabulary').getAll()),
        requestResult<WordInteraction[]>(
          transaction.objectStore('interactions').index('bySession').getAll(sessionId),
        ),
        requestResult<WordLookup[]>(
          transaction.objectStore('wordLookups').index('bySession').getAll(sessionId),
        ),
      ]);
      if (lookups.some((lookup) => lookup.state === 'Pending'))
        throw new LearningStorageError('pending-lookups');
      const changes = completeReading(session, text, vocabulary, interactions, timestamp, id);
      await this.write(transaction, changes);
      return changes.sessions![0]!;
    });
  }

  snapshot() {
    return this.transact([...LEARNING_STORES], 'readonly', async (transaction) => {
      const values = await Promise.all(
        LEARNING_STORES.map((store) => requestResult(transaction.objectStore(store).getAll())),
      );
      const snapshot = Object.fromEntries(
        LEARNING_STORES.filter((store) => store !== 'appSettings').map((store) => [
          store,
          values[LEARNING_STORES.indexOf(store)],
        ]),
      ) as unknown as LearningSnapshot;
      const settings = values[LEARNING_STORES.indexOf('appSettings')] as AppSettings[];
      if (settings[0]) snapshot.appSettings = settings[0];
      return snapshot;
    });
  }

  async replace(data: LearningSnapshot) {
    let snapshot: LearningSnapshot;
    try {
      snapshot = structuredClone(data);
      validateSnapshot(snapshot);
    } catch {
      throw new LearningStorageError('invalid-data');
    }
    await this.transact([...LEARNING_STORES], 'readwrite', async (transaction) => {
      await Promise.all(
        LEARNING_STORES.map((store) => requestResult(transaction.objectStore(store).clear())),
      );
      await this.write(transaction, snapshot);
    });
  }

  async getRecentTopics(limit: number) {
    const texts = await this.transact(['texts'], 'readonly', (transaction) =>
      requestResult<TextDocument[]>(transaction.objectStore('texts').getAll()),
    );
    return texts
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
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
            assertValid(
              before.status !== 'InProgress' ||
                (after.status !== 'New' &&
                  before.startedAt === after.startedAt &&
                  same(before.reviewCandidateIds, after.reviewCandidateIds)),
            );
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
    if (changes.appSettings?.activeSessionId)
      await required<ReadingSession>('sessions', changes.appSettings.activeSessionId);
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
      const siblings = await requestResult<ReadingSession[]>(
        transaction.objectStore('sessions').index('byText').getAll(reading.textId),
      );
      assertValid(siblings.filter((session) => session.status !== 'Completed').length <= 1);
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
          (reading.status === 'InProgress' || lookup.state !== 'Pending') &&
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
