export const LEARNING_DATABASE = 'vibe.learning';
export const LEARNING_SCHEMA_VERSION = 3;
export const LEARNING_STORES = [
  'texts',
  'sessions',
  'vocabulary',
  'interactions',
  'exposures',
  'explanations',
  'appSettings',
  'wordLookups',
  'wordTranslations',
] as const;
export type LearningStore = (typeof LEARNING_STORES)[number];

export type LearningMigration = (database: IDBDatabase, transaction: IDBTransaction) => void;

export const learningMigrations: Readonly<Record<number, LearningMigration>> = {
  1(database) {
    database.createObjectStore('texts', { keyPath: 'id' });
    const sessions = database.createObjectStore('sessions', { keyPath: 'id' });
    sessions.createIndex('byText', 'textId');
    const vocabulary = database.createObjectStore('vocabulary', { keyPath: 'id' });
    vocabulary.createIndex('bySense', ['lemma', 'partOfSpeech', 'senseKey'], { unique: true });
    const interactions = database.createObjectStore('interactions', { keyPath: 'id' });
    interactions.createIndex('bySession', 'sessionId');
    interactions.createIndex('byUndo', 'undoesInteractionId', { unique: true });
    const exposures = database.createObjectStore('exposures', { keyPath: 'id' });
    exposures.createIndex('bySession', 'sessionId');
    exposures.createIndex('bySessionVocabulary', ['sessionId', 'vocabularyEntryId'], {
      unique: true,
    });
    const explanations = database.createObjectStore('explanations', { keyPath: 'id' });
    explanations.createIndex(
      'byCacheKey',
      ['textId', 'sentenceId', 'cefrLevel', 'aiModel', 'promptVersion'],
      { unique: true },
    );
    database.createObjectStore('appSettings', { keyPath: 'id' });
  },
  3(_database, transaction) {
    transaction.objectStore('interactions').createIndex('byVocabulary', 'vocabularyEntryId');
    transaction.objectStore('exposures').createIndex('byVocabulary', 'vocabularyEntryId');
    const store = transaction.objectStore('appSettings');
    const request = store.get('app');
    request.onsuccess = () => {
      if (request.result)
        store.put({ ...request.result, activeSessionId: request.result.activeSessionId ?? null });
    };
  },
  2(database) {
    const lookups = database.createObjectStore('wordLookups', { keyPath: 'id' });
    lookups.createIndex('bySession', 'selection.sessionId');
    lookups.createIndex('byVocabulary', 'vocabularyEntryId');
    const translations = database.createObjectStore('wordTranslations', { keyPath: 'id' });
    translations.createIndex(
      'byContext',
      ['textId', 'sentenceId', 'start', 'end', 'aiModel', 'promptVersion'],
      { unique: true },
    );
  },
};
