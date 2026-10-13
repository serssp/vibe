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
import { confirmedVocabulary } from '../../domain/learning/occurrences';
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
        const [recentTopics, preferences, vocabulary] = await Promise.all([
          repository.getRecentTopics(5),
          repository.getAppSettings(),
          repository.listVocabulary(),
        ]);
        const candidates = vocabulary
          .filter((entry) => entry.status === 'Unknown' && entry.unknownCount > 0)
          .sort((a, b) => Date.parse(a.lastMarkedAt) - Date.parse(b.lastMarkedAt))
          .slice(0, 30);
        const result = await provider.generate({
          ...request,
          apiKey: request.apiKey.trim(),
          model: request.model.trim(),
          recentTopics,
          reviewVocabulary: candidates.map(({ id, lemma, meaningRu }) => ({
            id,
            lemma,
            meaningRu,
          })),
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
          targetVocabularyIds: candidates.map((entry) => entry.id),
          includedVocabularyIds: confirmedVocabulary(
            result.sentences,
            vocabulary,
            result.occurrences ?? [],
          ).filter((id) => candidates.some((entry) => entry.id === id)),
        };
        const session: ReadingSession = {
          id: runtime.id(),
          textId: id,
          status: 'InProgress',
          startedAt: createdAt,
          completedAt: null,
          readingPosition: { sentenceId: null, scrollOffset: 0 },
          reviewCandidateIds: candidates.map((entry) => entry.id),
        };
        const changes = {
          texts: [text],
          sessions: [session],
          appSettings: {
            id: 'app' as const,
            activeSessionId: session.id,
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
