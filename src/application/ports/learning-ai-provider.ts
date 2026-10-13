import type { VocabularyOccurrence } from '../../domain/learning/occurrences';
import type { AIProvider, ConnectionRequest } from './ai-provider';
import type { CefrLevel, TargetDuration } from '../../domain/reading/models';
import type { WordCard } from '../../domain/vocabulary/word-card';
import type { GrammarRule } from '../../domain/grammar/models';

export interface GenerationRequest extends ConnectionRequest {
  cefrLevel: CefrLevel;
  targetDuration: TargetDuration;
  recentTopics: string[];
  reviewVocabulary: { id: string; lemma: string; meaningRu: string }[];
}

export interface WordRequest extends ConnectionRequest {
  sentence: string;
  surfaceForm: string;
  start: number;
  end: number;
  knownVocabulary: {
    id: string;
    lemma: string;
    partOfSpeech: string;
    article: string | null;
    meaningRu: string;
  }[];
}

export interface GrammarRequest extends ConnectionRequest {
  sentence: string;
  cefrLevel: CefrLevel;
}

export interface LearningAIProvider extends AIProvider {
  readonly promptVersions: { generation: string; word: string; grammar: string };
  generate(request: GenerationRequest): Promise<{
    title: string;
    sentences: string[];
    occurrences?: VocabularyOccurrence[];
    totalTokens?: number;
  }>;
  translate(request: WordRequest): Promise<{ card: WordCard; totalTokens?: number }>;
  explain(request: GrammarRequest): Promise<{ rules: GrammarRule[]; totalTokens?: number }>;
}
