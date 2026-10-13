import type { CefrLevel } from '../reading/models';

export interface GrammarRule {
  titleRu: string;
  explanationRu: string;
  fragments: string[];
  examples: { de: string; ru: string }[];
}

export interface GrammarExplanation {
  id: string;
  textId: string;
  sentenceId: string;
  cefrLevel: CefrLevel;
  explanation: { rules: GrammarRule[] };
  aiModel: string;
  promptVersion: string;
  createdAt: string;
}
