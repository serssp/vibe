import { ConnectionError } from './ports/ai-provider';
import { LearningStorageError } from './ports/learning-repository';

export function actionMessage(error: unknown): string {
  return error instanceof ConnectionError || error instanceof LearningStorageError
    ? error.message
    : 'Не удалось выполнить действие. Повторите попытку.';
}
