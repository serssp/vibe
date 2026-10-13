export type CefrLevel = 'A1' | 'A2' | 'B1';
export type TargetDuration = 3 | 4 | 5;

export interface Sentence {
  id: string;
  content: string;
}

export interface TextDocument {
  id: string;
  title: string;
  content: string;
  sentences: Sentence[];
  cefrLevel: CefrLevel;
  targetDuration: TargetDuration;
  createdAt: string;
  aiModel: string;
  promptVersion: string;
  targetVocabularyIds: string[];
  includedVocabularyIds: string[];
}

export interface ReadingPosition {
  sentenceId: string | null;
  scrollOffset: number;
}

export interface ReadingSession {
  id: string;
  textId: string;
  status: 'New' | 'InProgress' | 'Completed';
  startedAt: string | null;
  completedAt: string | null;
  readingPosition: ReadingPosition;
  reviewCandidateIds: string[];
}
