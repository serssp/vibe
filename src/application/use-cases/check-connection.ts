import {
  ConnectionError,
  type AIProvider,
  type ConnectionRequest,
  type ConnectionResult,
} from '../ports/ai-provider';

export async function checkConnection(
  provider: AIProvider,
  request: ConnectionRequest,
): Promise<ConnectionResult> {
  if (!request.apiKey.trim()) throw new ConnectionError('Введите API key.');
  if (!request.model.trim()) throw new ConnectionError('Укажите модель OpenAI.');
  return provider.check({ ...request, apiKey: request.apiKey.trim(), model: request.model.trim() });
}
