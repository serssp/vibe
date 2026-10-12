export interface ConnectionRequest {
  apiKey: string;
  model: string;
  signal: AbortSignal;
}

export interface ConnectionResult {
  text: string;
  totalTokens?: number;
}

export interface ConnectionProvider {
  check(request: ConnectionRequest): Promise<ConnectionResult>;
}

export class ConnectionError extends Error {}

export async function checkConnection(
  provider: ConnectionProvider,
  request: ConnectionRequest,
): Promise<ConnectionResult> {
  if (!request.apiKey.trim()) throw new ConnectionError('Введите API key.');
  if (!request.model.trim()) throw new ConnectionError('Укажите модель OpenAI.');
  return provider.check({ ...request, apiKey: request.apiKey.trim(), model: request.model.trim() });
}
