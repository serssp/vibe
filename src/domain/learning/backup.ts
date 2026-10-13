import type { LearningSnapshot } from './data';
import { InvalidLearningData, validateLearningWrite } from './validation';

function valid(condition: unknown): asserts condition {
  if (!condition) throw new InvalidLearningData();
}

export function validateSnapshot(value: unknown): asserts value is LearningSnapshot {
  validateLearningWrite(value);
  const data = value as LearningSnapshot;
  for (const key of [
    'texts',
    'sessions',
    'vocabulary',
    'interactions',
    'exposures',
    'explanations',
    'wordLookups',
    'wordTranslations',
  ] as const)
    valid(Array.isArray(data[key]));
  const texts = new Map(data.texts.map((item) => [item.id, item]));
  const sessions = new Map(data.sessions.map((item) => [item.id, item]));
  const words = new Map(data.vocabulary.map((item) => [item.id, item]));
  const interactions = new Map(data.interactions.map((item) => [item.id, item]));
  const translations = new Map(data.wordTranslations.map((item) => [item.id, item]));
  if (data.appSettings?.activeSessionId) valid(sessions.has(data.appSettings.activeSessionId));
  const activeTexts = new Set<string>();
  const unique = new Set<string>();
  const distinct = (parts: unknown[]) => {
    const key = JSON.stringify(parts);
    valid(!unique.has(key));
    unique.add(key);
  };
  for (const text of data.texts) for (const id of text.targetVocabularyIds) valid(words.has(id));
  for (const word of data.vocabulary)
    distinct(['sense', word.lemma, word.partOfSpeech, word.senseKey]);
  for (const session of data.sessions) {
    const text = texts.get(session.textId);
    valid(text);
    valid(
      session.readingPosition.sentenceId === null ||
        text.sentences.some((sentence) => sentence.id === session.readingPosition.sentenceId),
    );
    session.reviewCandidateIds.forEach((id) => valid(words.has(id)));
    if (session.status !== 'Completed') {
      valid(!activeTexts.has(session.textId));
      activeTexts.add(session.textId);
    }
  }
  for (const interaction of data.interactions) {
    const session = sessions.get(interaction.sessionId);
    const text = texts.get(interaction.textId);
    valid(session && text && words.has(interaction.vocabularyEntryId));
    valid(
      session.textId === text.id &&
        text.sentences.some((sentence) => sentence.id === interaction.sentenceId),
    );
    valid(
      session.startedAt &&
        Date.parse(interaction.timestamp) >= Date.parse(session.startedAt) &&
        (!session.completedAt ||
          Date.parse(interaction.timestamp) <= Date.parse(session.completedAt)),
    );
    if (interaction.undoesInteractionId) {
      const original = interactions.get(interaction.undoesInteractionId);
      valid(
        original &&
          original.action === 'MarkUnknown' &&
          original.sessionId === session.id &&
          original.vocabularyEntryId === interaction.vocabularyEntryId &&
          original.sentenceId === interaction.sentenceId &&
          original.surfaceForm === interaction.surfaceForm &&
          Date.parse(original.timestamp) <= Date.parse(interaction.timestamp),
      );
      distinct(['undo', original.id]);
    }
  }
  for (const exposure of data.exposures) {
    const session = sessions.get(exposure.sessionId);
    valid(
      session &&
        session.status === 'Completed' &&
        exposure.occurredAt === session.completedAt &&
        words.has(exposure.vocabularyEntryId),
    );
    valid(
      session.reviewCandidateIds.includes(exposure.vocabularyEntryId) &&
        texts.get(session.textId)!.includedVocabularyIds.includes(exposure.vocabularyEntryId),
    );
    distinct(['exposure', session.id, exposure.vocabularyEntryId]);
  }
  for (const explanation of data.explanations) {
    const text = texts.get(explanation.textId);
    const sentence = text?.sentences.find((item) => item.id === explanation.sentenceId);
    valid(sentence);
    valid(
      explanation.explanation.rules.every((rule) =>
        rule.fragments.every((fragment) => sentence.content.includes(fragment)),
      ),
    );
    distinct([
      'grammar',
      explanation.textId,
      explanation.sentenceId,
      explanation.cefrLevel,
      explanation.aiModel,
      explanation.promptVersion,
    ]);
  }
  for (const translation of data.wordTranslations) {
    const sentence = texts
      .get(translation.textId)
      ?.sentences.find((item) => item.id === translation.sentenceId);
    const word = words.get(translation.vocabularyEntryId);
    valid(
      sentence &&
        translation.end <= sentence.content.length &&
        word &&
        word.lemma === translation.card.lemma &&
        word.partOfSpeech === translation.card.partOfSpeech &&
        word.article === translation.card.article,
    );
    if (translation.card.matchedVocabularyId !== null)
      valid(translation.card.matchedVocabularyId === word.id);
    distinct([
      'translation',
      translation.textId,
      translation.sentenceId,
      translation.start,
      translation.end,
      translation.aiModel,
      translation.promptVersion,
    ]);
  }
  for (const lookup of data.wordLookups) {
    const selection = lookup.selection;
    const session = sessions.get(selection.sessionId);
    const sentence = texts
      .get(selection.textId)
      ?.sentences.find((item) => item.id === selection.sentenceId);
    valid(
      session &&
        session.textId === selection.textId &&
        sentence &&
        sentence.content.slice(selection.start, selection.end) === selection.surfaceForm,
    );
    valid(
      Date.parse(lookup.createdAt) >= Date.parse(session.startedAt!) &&
        (!session.completedAt || Date.parse(lookup.createdAt) <= Date.parse(session.completedAt)),
    );
    valid(session.status === 'InProgress' || lookup.state !== 'Pending');
    if (lookup.vocabularyEntryId !== null) {
      const translation = translations.get(lookup.translationId!);
      const interaction = interactions.get(lookup.interactionId!);
      valid(words.has(lookup.vocabularyEntryId) && translation && interaction);
      valid(
        translation.vocabularyEntryId === lookup.vocabularyEntryId &&
          translation.textId === selection.textId &&
          translation.sentenceId === selection.sentenceId &&
          translation.start === selection.start &&
          translation.end === selection.end &&
          translation.aiModel === lookup.aiModel &&
          translation.promptVersion === lookup.promptVersion,
      );
      valid(
        interaction.action === 'MarkUnknown' &&
          interaction.sessionId === session.id &&
          interaction.vocabularyEntryId === lookup.vocabularyEntryId &&
          interaction.sentenceId === selection.sentenceId &&
          interaction.surfaceForm === selection.surfaceForm,
      );
    } else
      valid(
        lookup.interactionId === null && lookup.translationId === null && lookup.previous === null,
      );
  }
}
