import type { LearningRepository } from '../ports/learning-repository';
import type { Runtime } from '../ports/runtime';
import type { ReadingSession } from '../../domain/reading/models';
import { ConnectionError } from '../ports/ai-provider';

export function createReadingActions(repository: LearningRepository, runtime: Runtime) {
  return {
    history: () => repository.listHistory(),
    wordHistory: (id: string) => repository.getVocabularyFacts(id),
    resume: (textId: string) => repository.openReading(textId),
    async start(textId: string) {
      const text = await repository.getText(textId);
      if (!text) throw new ConnectionError('Текст не найден.');
      return { text, session: await repository.startReading(textId, runtime.id(), runtime.now()) };
    },
    savePosition: (id: string, position: ReadingSession['readingPosition']) =>
      repository.saveReadingPosition(id, position),
    complete: (id: string) => repository.completeReading(id, runtime.now(), () => runtime.id()),
  };
}
export type ReadingActions = ReturnType<typeof createReadingActions>;
