import type { ModelPreferences } from '../../domain/settings/model-preferences';

export interface ConnectionRequest extends ModelPreferences {
  apiKey: string;
  signal: AbortSignal;
}

export interface ConnectionResult {
  text: string;
  totalTokens?: number;
}

export interface AIProvider {
  check(request: ConnectionRequest): Promise<ConnectionResult>;
}

export class ConnectionError extends Error {}
