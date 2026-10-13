import type { GrammarExplanation } from '../grammar/models';
import type { ReadingSession, TextDocument } from '../reading/models';
import type { AppSettings } from '../settings/app-settings';
import type { VocabularyEntry } from '../vocabulary/models';
import type { WordExposure, WordInteraction } from './records';
import type { WordLookup, WordTranslation } from '../vocabulary/lookups';

export interface LearningWrite {
  texts?: TextDocument[];
  sessions?: ReadingSession[];
  vocabulary?: VocabularyEntry[];
  interactions?: WordInteraction[];
  exposures?: WordExposure[];
  explanations?: GrammarExplanation[];
  appSettings?: AppSettings;
  wordLookups?: WordLookup[];
  wordTranslations?: WordTranslation[];
}
