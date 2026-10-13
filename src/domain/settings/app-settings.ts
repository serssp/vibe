import type { CefrLevel, TargetDuration } from '../reading/models';
import type { ModelPreferences } from './model-preferences';

export interface AppSettings extends ModelPreferences {
  id: 'app';
  cefrLevel: CefrLevel;
  targetDuration: TargetDuration;
  ui: { fontScale: number };
}
