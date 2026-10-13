import type { LearningRepository } from '../ports/learning-repository';
import type { Runtime } from '../ports/runtime';
import type { LearningSnapshot } from '../../domain/learning/data';
import { validateSnapshot } from '../../domain/learning/backup';
import { ConnectionError } from '../ports/ai-provider';

export function createBackupActions(repository: LearningRepository, runtime: Runtime) {
  return {
    async exportData() {
      const data = await repository.snapshot();
      validateSnapshot(data);
      return JSON.stringify(
        { format: 'vibe-learning', version: 1, exportedAt: runtime.now(), data },
        null,
        2,
      );
    },
    preview(content: string) {
      try {
        const envelope: unknown = JSON.parse(content);
        if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) throw new Error();
        const record = envelope as Record<string, unknown>;
        if (
          Object.keys(record).sort().join(',') !== 'data,exportedAt,format,version' ||
          record.format !== 'vibe-learning' ||
          record.version !== 1 ||
          typeof record.exportedAt !== 'string' ||
          !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(record.exportedAt) ||
          !Number.isFinite(Date.parse(record.exportedAt)) ||
          new Date(record.exportedAt).toISOString() !== record.exportedAt
        )
          throw new Error();
        validateSnapshot(record.data);
        return record.data;
      } catch {
        throw new ConnectionError(
          'Файл резервной копии некорректен или его версия не поддерживается. Данные не изменены.',
        );
      }
    },
    restore: (data: LearningSnapshot) => repository.replace(data),
  };
}
export type BackupActions = ReturnType<typeof createBackupActions>;
