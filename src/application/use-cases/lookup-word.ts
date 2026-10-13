import { ConnectionError, type ConnectionRequest } from '../ports/ai-provider';
import type { LearningAIProvider } from '../ports/learning-ai-provider';
import type { LearningRepository } from '../ports/learning-repository';
import type { Runtime } from '../ports/runtime';
import {
  normalizeLemma,
  type WordLookup,
  type WordSelection,
  type WordTranslation,
} from '../../domain/vocabulary/lookups';
import type { VocabularyEntry } from '../../domain/vocabulary/models';
import { tokenize } from '../../domain/reading/tokens';
import { actionMessage } from '../errors';

export class WordLookupError extends ConnectionError {
  constructor(
    message: string,
    public readonly lookupId: string,
  ) {
    super(message);
  }
}

export function createWordActions(
  provider: LearningAIProvider,
  repository: LearningRepository,
  runtime: Runtime,
) {
  let busy = false;
  return {
    vocabulary: () => repository.listVocabulary(),
    pending: async (sessionId: string) =>
      (await repository.getWordLookups(sessionId)).filter((lookup) => lookup.state === 'Pending'),
    undo: (id: string) => repository.undoWordLookup(id, runtime.id(), runtime.now()),
    async lookup(request: ConnectionRequest & { selection: WordSelection; lookupId?: string }) {
      if (busy) throw new ConnectionError('Перевод уже выполняется.');
      busy = true;
      let lookup: WordLookup | undefined;
      let persisted = false;
      try {
        const text = await repository.getText(request.selection.textId);
        const sentence = text?.sentences.find((s) => s.id === request.selection.sentenceId);
        if (
          !sentence ||
          !tokenize(sentence.content).some(
            (token) =>
              token.word &&
              token.start === request.selection.start &&
              token.end === request.selection.end &&
              token.content === request.selection.surfaceForm,
          )
        )
          throw new ConnectionError('Выберите слово в сохранённом предложении.');
        if (request.lookupId) {
          lookup = await repository.getWordLookup(request.lookupId);
          if (!lookup || lookup.state !== 'Pending')
            throw new ConnectionError('Это действие уже обработано.');
          if (
            (['sessionId', 'textId', 'sentenceId', 'surfaceForm', 'start', 'end'] as const).some(
              (key) => lookup!.selection[key] !== request.selection[key],
            )
          )
            throw new ConnectionError('Отметка не соответствует выбранному слову.');
        } else {
          lookup = {
            id: runtime.id(),
            selection: request.selection,
            createdAt: runtime.now(),
            aiModel: request.model.trim(),
            promptVersion: provider.promptVersions.word,
            state: 'Pending',
            vocabularyEntryId: null,
            interactionId: null,
            translationId: null,
            previous: null,
          };
          await repository.commit({ wordLookups: [lookup] });
        }
        persisted = true;
        const cached = await repository.getWordTranslation({
          ...lookup.selection,
          aiModel: lookup.aiModel,
          promptVersion: lookup.promptVersion,
        });
        let translation: WordTranslation;
        let proposed: VocabularyEntry;
        let totalTokens: number | undefined;
        if (cached) {
          translation = cached;
          proposed = (await repository.getVocabularyEntry(cached.vocabularyEntryId))!;
        } else {
          if (provider.promptVersions.word !== lookup.promptVersion)
            throw new ConnectionError('Промпт изменился. Отмените отметку и нажмите слово заново.');
          const candidates = (await repository.listVocabulary())
            .sort((a, b) => Date.parse(b.lastMarkedAt) - Date.parse(a.lastMarkedAt))
            .slice(0, 100);
          const result = await provider.translate({
            apiKey: request.apiKey.trim(),
            model: lookup.aiModel,
            signal: request.signal,
            sentence: sentence.content,
            surfaceForm: lookup.selection.surfaceForm,
            start: lookup.selection.start,
            end: lookup.selection.end,
            knownVocabulary: candidates.map(({ id, lemma, partOfSpeech, article, meaningRu }) => ({
              id,
              lemma,
              partOfSpeech,
              article,
              meaningRu,
            })),
          });
          const card = result.card;
          const matched = candidates.find((word) => word.id === card.matchedVocabularyId);
          if (
            card.matchedVocabularyId !== null &&
            (!matched ||
              normalizeLemma(matched.lemma) !== normalizeLemma(card.lemma) ||
              matched.partOfSpeech !== card.partOfSpeech ||
              matched.article !== card.article)
          )
            throw new ConnectionError('Не удалось подтвердить значение слова. Повторите попытку.');
          proposed = matched ?? {
            id: runtime.id(),
            lemma: card.lemma,
            partOfSpeech: card.partOfSpeech,
            article: card.article,
            meaningRu: card.meaningRu,
            senseKey: runtime.id(),
            status: 'Unknown',
            createdAt: lookup.createdAt,
            lastMarkedAt: lookup.createdAt,
            unknownCount: 0,
            exposureCount: 0,
          };
          translation = {
            id: runtime.id(),
            textId: lookup.selection.textId,
            sentenceId: lookup.selection.sentenceId,
            start: lookup.selection.start,
            end: lookup.selection.end,
            aiModel: lookup.aiModel,
            promptVersion: lookup.promptVersion,
            vocabularyEntryId: proposed.id,
            card: { ...card, lemma: proposed.lemma },
          };
          totalTokens = result.totalTokens;
        }
        if (request.signal.aborted)
          throw new ConnectionError(
            'Перевод отменён. Отметка сохранена; её можно повторить или отменить.',
          );
        const result = await repository.resolveWordLookup(
          lookup.id,
          translation,
          proposed,
          runtime.id(),
        );
        return { ...result, totalTokens, cached: !!cached };
      } catch (error) {
        if (lookup && persisted) throw new WordLookupError(actionMessage(error), lookup.id);
        throw error;
      } finally {
        busy = false;
      }
    },
  };
}

export type WordActions = ReturnType<typeof createWordActions>;
export type WordLookupResult = Awaited<ReturnType<WordActions['lookup']>>;
