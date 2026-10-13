import { LearningStorageError } from '../../application/ports/learning-repository';
import {
  LEARNING_DATABASE,
  LEARNING_SCHEMA_VERSION,
  learningMigrations,
  type LearningMigration,
} from './schema';

export interface LearningDatabaseOptions {
  getFactory?: () => IDBFactory;
  name?: string;
  version?: number;
  migrations?: Readonly<Record<number, LearningMigration>>;
}

export class LearningDatabase {
  private connection?: Promise<IDBDatabase>;

  constructor(private readonly options: LearningDatabaseOptions = {}) {}

  open(): Promise<IDBDatabase> {
    if (this.connection) return this.connection;
    const pending = new Promise<IDBDatabase>((resolve, reject) => {
      let request: IDBOpenDBRequest;
      let rejected = false;
      let migrationFailed = false;
      const fail = (error: LearningStorageError) => {
        rejected = true;
        reject(error);
      };
      try {
        const factory = this.options.getFactory?.() ?? globalThis.indexedDB;
        request = factory.open(
          this.options.name ?? LEARNING_DATABASE,
          this.options.version ?? LEARNING_SCHEMA_VERSION,
        );
      } catch {
        fail(new LearningStorageError('unavailable'));
        return;
      }
      request.onblocked = () => fail(new LearningStorageError('blocked'));
      request.onupgradeneeded = (event) => {
        const transaction = request.transaction!;
        transaction.onabort = () => {
          migrationFailed = true;
        };
        if (rejected) {
          transaction.abort();
          return;
        }
        try {
          const migrations = this.options.migrations ?? learningMigrations;
          for (let version = event.oldVersion + 1; version <= request.result.version; version++) {
            const migration = migrations[version];
            if (!migration) throw new LearningStorageError('migration');
            migration(request.result, transaction);
          }
        } catch {
          migrationFailed = true;
          transaction.abort();
        }
      };
      request.onerror = () =>
        fail(
          new LearningStorageError(
            migrationFailed || request.error?.name === 'VersionError' ? 'migration' : 'unavailable',
          ),
        );
      request.onsuccess = () => {
        const database = request.result;
        if (rejected) {
          database.close();
          return;
        }
        database.onversionchange = () => {
          database.close();
          this.connection = undefined;
        };
        database.onclose = () => {
          this.connection = undefined;
        };
        resolve(database);
      };
    });
    this.connection = pending;
    void pending.catch(() => {
      if (this.connection === pending) this.connection = undefined;
    });
    return pending;
  }

  async close(): Promise<void> {
    const connection = this.connection;
    this.connection = undefined;
    if (connection) (await connection).close();
  }
}
