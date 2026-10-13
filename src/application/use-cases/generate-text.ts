import { ConnectionError, type ConnectionRequest } from '../ports/ai-provider';
import type { LearningAIProvider } from '../ports/learning-ai-provider';
import type { LearningRepository } from '../ports/learning-repository';
import type { Runtime } from '../ports/runtime';
import type {
  CefrLevel,
  TargetDuration,
  TextDocument,
  ReadingSession,
} from '../../domain/reading/models';
import { validateLearningWrite } from '../../domain/learning/validation';

export interface GenerateRequest extends ConnectionRequest {
  cefrLevel: CefrLevel;
  targetDuration: TargetDuration;
}

export function createGenerationActions(
  provider: LearningAIProvider,
  repository: LearningRepository,
  runtime: Runtime,
) {
  let busy = false;
  return {
    restore: () => repository.getCurrentReading(),
    preferences: () => repository.getAppSettings(),
    async generate(request: GenerateRequest) {
      if (busy) throw new ConnectionError('Генерация уже выполняется.');
      if (
        !['A1', 'A2', 'B1'].includes(request.cefrLevel) ||
        ![3, 4, 5].includes(request.targetDuration)
      )
        throw new ConnectionError('Выберите уровень и длительность чтения.');
      busy = true;
      try {
        const [recentTopics, preferences] = await Promise.all([
          repository.getRecentTopics(5),
          repository.getAppSettings(),
        ]);
        const result = await provider.generate({
          ...request,
          apiKey: request.apiKey.trim(),
          model: request.model.trim(),
          recentTopics,
          reviewVocabulary: [],
        });
        if (request.signal.aborted) throw new ConnectionError('Генерация отменена.');
        const id = runtime.id();
        const createdAt = runtime.now();
        const text: TextDocument = {
          id,
          title: result.title.trim(),
          content: result.sentences.map((s) => s.trim()).join(' '),
          sentences: result.sentences.map((content, index) => ({
            id: `${id}:${index + 1}`,
            content: content.trim(),
          })),
          cefrLevel: request.cefrLevel,
          targetDuration: request.targetDuration,
          createdAt,
          aiModel: request.model.trim(),
          promptVersion: provider.promptVersions.generation,
          targetVocabularyIds: [],
          includedVocabularyIds: [],
        };
        const session: ReadingSession = {
          id: runtime.id(),
          textId: id,
          status: 'InProgress',
          startedAt: createdAt,
          completedAt: null,
          readingPosition: { sentenceId: null, scrollOffset: 0 },
          reviewCandidateIds: [],
        };
        const changes = {
          texts: [text],
          sessions: [session],
          appSettings: {
            id: 'app' as const,
            model: request.model.trim(),
            cefrLevel: request.cefrLevel,
            targetDuration: request.targetDuration,
            ui: preferences?.ui ?? { fontScale: 1 },
          },
        };
        try {
          validateLearningWrite(changes);
        } catch {
          throw new ConnectionError('OpenAI вернул некорректный текст. Повторите попытку.');
        }
        await repository.commit(changes);
        return { text, session, totalTokens: result.totalTokens };
      } finally {
        busy = false;
      }
    },
  };
}

export type GenerationActions = ReturnType<typeof createGenerationActions>;
