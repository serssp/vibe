export interface VocabularyEntry {
  id: string;
  lemma: string;
  partOfSpeech: string;
  article: 'der' | 'die' | 'das' | null;
  meaningRu: string;
  senseKey: string;
  status: 'Unknown' | 'Learned';
  createdAt: string;
  lastMarkedAt: string;
  unknownCount: number;
  exposureCount: number;
}
