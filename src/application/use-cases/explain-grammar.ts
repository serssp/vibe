import { ConnectionError, type ConnectionRequest } from '../ports/ai-provider';
import type { LearningAIProvider } from '../ports/learning-ai-provider';
import type { LearningRepository } from '../ports/learning-repository';
import type { Runtime } from '../ports/runtime';
import type { CefrLevel } from '../../domain/reading/models';
import type { GrammarExplanation } from '../../domain/grammar/models';
import { validateLearningWrite } from '../../domain/learning/validation';

export function createGrammarActions(
  provider: LearningAIProvider,
  repository: LearningRepository,
  runtime: Runtime,
) {
  let busy = false;
  return {
    async explain(
      request: ConnectionRequest & { textId: string; sentenceId: string; cefrLevel: CefrLevel },
    ) {
      if (busy) throw new ConnectionError('Разбор уже выполняется.');
      busy = true;
      try {
        const text = await repository.getText(request.textId);
        const sentence = text?.sentences.find((s) => s.id === request.sentenceId);
        if (!sentence || !['A1', 'A2', 'B1'].includes(request.cefrLevel))
          throw new ConnectionError('Выберите предложение сохранённого текста.');
        const key = {
          textId: request.textId,
          sentenceId: request.sentenceId,
          cefrLevel: request.cefrLevel,
          aiModel: request.model.trim(),
          promptVersion: provider.promptVersions.grammar,
        };
        const cached = await repository.findGrammarExplanation(key);
        if (cached) return { explanation: cached, cached: true, totalTokens: undefined };
        const result = await provider.explain({
          ...request,
          apiKey: request.apiKey.trim(),
          model: request.model.trim(),
          sentence: sentence.content,
        });
        if (request.signal.aborted) throw new ConnectionError('Разбор отменён.');
        const explanation: GrammarExplanation = {
          ...key,
          id: runtime.id(),
          explanation: { rules: result.rules },
          createdAt: runtime.now(),
        };
        try {
          validateLearningWrite({ explanations: [explanation] });
        } catch {
          throw new ConnectionError('OpenAI вернул некорректный разбор. Повторите попытку.');
        }
        for (const rule of result.rules)
          if (
            !rule.fragments.length ||
            rule.fragments.some((fragment) => !sentence.content.includes(fragment))
          )
            throw new ConnectionError(
              'Разбор не соответствует выбранному предложению. Повторите попытку.',
            );
        try {
          await repository.commit({ explanations: [explanation] });
        } catch (error) {
          const concurrent = await repository.findGrammarExplanation(key);
          if (concurrent)
            return { explanation: concurrent, cached: true, totalTokens: result.totalTokens };
          throw error;
        }
        return { explanation, cached: false, totalTokens: result.totalTokens };
      } finally {
        busy = false;
      }
    },
  };
}

export type GrammarActions = ReturnType<typeof createGrammarActions>;
export type GrammarResult = Awaited<ReturnType<GrammarActions['explain']>>;
