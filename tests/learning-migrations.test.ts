import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { LearningDatabase } from '../src/infrastructure/storage/learning-database';
import { IndexedDbLearningRepository } from '../src/infrastructure/storage/indexeddb-learning';
import {
  LEARNING_STORES,
  LEARNING_SCHEMA_VERSION,
  learningMigrations,
} from '../src/infrastructure/storage/schema';
import { learningFixture, textDocument } from './fixtures/learning';

function open(
  factory: IDBFactory,
  name: string,
  version: number,
  upgrade?: (database: IDBDatabase) => void,
): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(name, version);
    request.onupgradeneeded = () => upgrade?.(request.result);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

describe('Learning database migrations and lifecycle', () => {
  it('migrates actual stage 2 schema v1 to v2 without changing learning records', async () => {
    const factory = new IDBFactory();
    const options = { getFactory: () => factory, name: 'real-v1-upgrade' };
    const legacy = new IndexedDbLearningRepository({ ...options, version: 1 });
    await legacy.commit(learningFixture());
    await legacy.close();
    const upgraded = new IndexedDbLearningRepository(options);
    expect(await upgraded.getText('text-1')).toEqual(textDocument());
    expect(await upgraded.getWordLookups('session-1')).toEqual([]);
    expect(
      await upgraded.getWordTranslation({
        textId: 'text-1',
        sentenceId: 'text-1:1',
        start: 4,
        end: 8,
        aiModel: 'test-model',
        promptVersion: '1',
      }),
    ).toBeUndefined();
    await upgraded.close();
    const database = new LearningDatabase(options);
    const connection = await database.open();
    expect(connection.version).toBe(2);
    expect(
      connection.transaction('wordTranslations').objectStore('wordTranslations').index('byContext')
        .unique,
    ).toBe(true);
    await database.close();
  });
  it('creates the current schema with all stores and unique indexes', async () => {
    const database = new LearningDatabase({ getFactory: () => new IDBFactory() });
    const connection = await database.open();
    expect(connection.version).toBe(LEARNING_SCHEMA_VERSION);
    expect([...connection.objectStoreNames].sort()).toEqual([...LEARNING_STORES].sort());
    const transaction = connection.transaction([...LEARNING_STORES]);
    expect(transaction.objectStore('vocabulary').index('bySense').unique).toBe(true);
    expect(transaction.objectStore('exposures').index('bySessionVocabulary').unique).toBe(true);
    expect(transaction.objectStore('explanations').index('byCacheKey').unique).toBe(true);
    expect(transaction.objectStore('interactions').index('byUndo').unique).toBe(true);
    await database.close();
  });

  it('opens lazily, deduplicates connection requests and recovers after unavailability', async () => {
    let opens = 0;
    const factory = new IDBFactory();
    const database = new LearningDatabase({
      getFactory: () => {
        opens++;
        if (opens === 1) throw new Error('test-credential raw diagnostic');
        return factory;
      },
    });
    expect(opens).toBe(0);
    await expect(database.open()).rejects.toMatchObject({ code: 'unavailable' });
    const first = database.open();
    expect(database.open()).toBe(first);
    expect((await first).version).toBe(LEARNING_SCHEMA_VERSION);
    expect(opens).toBe(2);
    await database.close();
  });

  it('applies ordered upgrades without changing existing entities', async () => {
    const factory = new IDBFactory();
    const options = { getFactory: () => factory, name: 'upgrade', version: 1 };
    const repository = new IndexedDbLearningRepository(options);
    await repository.commit(learningFixture());
    await repository.close();
    const upgraded = new LearningDatabase({
      ...options,
      version: 3,
      migrations: {
        ...learningMigrations,
        2(database) {
          database.createObjectStore('migration-2');
        },
        3(database) {
          expect(database.objectStoreNames.contains('migration-2')).toBe(true);
          database.createObjectStore('migration-3');
        },
      },
    });
    const connection = await upgraded.open();
    expect(connection.version).toBe(3);
    const reading = new IndexedDbLearningRepository({ ...options, version: 3 });
    expect(await reading.getText('text-1')).toEqual(textDocument());
    await reading.close();
    await upgraded.close();
  });

  it('rolls back a throwing migration including destructive schema changes', async () => {
    const factory = new IDBFactory();
    const options = { getFactory: () => factory, name: 'failed-upgrade', version: 1 };
    const repository = new IndexedDbLearningRepository(options);
    await repository.commit(learningFixture());
    await repository.close();
    const failing = new LearningDatabase({
      ...options,
      version: 2,
      migrations: {
        ...learningMigrations,
        2(database) {
          database.deleteObjectStore('texts');
          database.createObjectStore('new-store');
          throw new Error('test-credential');
        },
      },
    });
    await expect(failing.open()).rejects.toMatchObject({ code: 'migration' });
    const original = await open(factory, options.name, 1);
    expect(original.version).toBe(1);
    expect(original.objectStoreNames.contains('texts')).toBe(true);
    expect(original.objectStoreNames.contains('new-store')).toBe(false);
    original.close();
    expect(await repository.getText('text-1')).toEqual(textDocument());
    await repository.close();
  });

  it('rolls back asynchronously failed index creation and preserves the old version', async () => {
    const factory = new IDBFactory();
    const options = { getFactory: () => factory, name: 'failed-index', version: 1 };
    const repository = new IndexedDbLearningRepository(options);
    await repository.commit({
      ...learningFixture(),
      texts: [textDocument(), textDocument('text-2')],
    });
    await repository.close();
    const failing = new LearningDatabase({
      ...options,
      version: 2,
      migrations: {
        ...learningMigrations,
        2(_database, transaction) {
          transaction.objectStore('texts').createIndex('uniqueTitle', 'title', { unique: true });
        },
      },
    });
    await expect(failing.open()).rejects.toMatchObject({ code: 'migration' });
    const original = await open(factory, options.name, 1);
    expect(
      original.transaction('texts').objectStore('texts').indexNames.contains('uniqueTitle'),
    ).toBe(false);
    original.close();
    expect(await repository.getText('text-2')).toEqual(textDocument('text-2'));
    await repository.close();
  });

  it('refuses an upgrade with a missing migration without resetting data', async () => {
    const factory = new IDBFactory();
    const options = { getFactory: () => factory, name: 'missing-migration', version: 1 };
    const repository = new IndexedDbLearningRepository(options);
    await repository.commit(learningFixture());
    await repository.close();
    const unsupported = new LearningDatabase({ ...options, version: 3 });
    await expect(unsupported.open()).rejects.toMatchObject({ code: 'migration' });
    expect(await repository.getText('text-1')).toEqual(textDocument());
    await repository.close();
  });

  it('refuses a newer existing database and preserves its stores', async () => {
    const factory = new IDBFactory();
    const connection = await open(factory, 'future', 3, (database) =>
      database.createObjectStore('future-data'),
    );
    connection.close();
    const database = new LearningDatabase({ getFactory: () => factory, name: 'future' });
    await expect(database.open()).rejects.toMatchObject({ code: 'migration' });
    const preserved = await open(factory, 'future', 3);
    expect(preserved.objectStoreNames.contains('future-data')).toBe(true);
    preserved.close();
  });

  it('reports blocked upgrades and does not perform a deferred upgrade after rejection', async () => {
    const factory = new IDBFactory();
    const initial = new LearningDatabase({
      getFactory: () => factory,
      name: 'blocked',
      version: 1,
    });
    await initial.open();
    await initial.close();
    const oldTab = await open(factory, 'blocked', 1);
    const database = new LearningDatabase({
      getFactory: () => factory,
      name: 'blocked',
      version: 2,
      migrations: {
        ...learningMigrations,
        2(db) {
          db.createObjectStore('deferred');
        },
      },
    });
    await expect(database.open()).rejects.toMatchObject({ code: 'blocked' });
    oldTab.close();
    const preserved = await open(factory, 'blocked', 1);
    expect(preserved.objectStoreNames.contains('deferred')).toBe(false);
    preserved.close();
  });

  it('closes on versionchange and refuses stale-code writes after a newer upgrade', async () => {
    const factory = new IDBFactory();
    const options = { getFactory: () => factory, name: 'versionchange', version: 1 };
    const repository = new IndexedDbLearningRepository(options);
    await repository.commit(learningFixture());
    const newer = new LearningDatabase({
      ...options,
      version: 2,
      migrations: {
        ...learningMigrations,
        2(database) {
          database.createObjectStore('next-version');
        },
      },
    });
    expect((await newer.open()).version).toBe(2);
    await expect(repository.getText('text-1')).rejects.toMatchObject({ code: 'migration' });
    await newer.close();
    const preserved = new IndexedDbLearningRepository({ ...options, version: 2 });
    expect(await preserved.getText('text-1')).toEqual(textDocument());
    await preserved.close();
  });
});
