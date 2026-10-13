export interface WordInteraction {
  id: string;
  sessionId: string;
  textId: string;
  vocabularyEntryId: string;
  surfaceForm: string;
  sentenceId: string;
  action: 'MarkUnknown' | 'UndoMarkUnknown';
  undoesInteractionId: string | null;
  timestamp: string;
}

export interface WordExposure {
  id: string;
  sessionId: string;
  vocabularyEntryId: string;
  markedUnknown: boolean;
  occurredAt: string;
}
