import {
  ConnectionError,
  type AIProvider,
  type ConnectionRequest,
  type ConnectionResult,
} from '../../application/ports/ai-provider';
import prompt from '../../prompts/connection-check.md?raw';

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export class OpenAIConnectionProvider implements AIProvider {
  private busy = false;

  constructor(
    private readonly fetcher: typeof fetch = fetch.bind(globalThis),
    private readonly timeoutMs = 20000,
  ) {}

  async check({ apiKey, model, signal }: ConnectionRequest): Promise<ConnectionResult> {
    if (this.busy) throw new ConnectionError('Проверка уже выполняется.');
    this.busy = true;
    const controller = new AbortController();
    let timedOut = false;
    const cancel = () => controller.abort();
    signal.addEventListener('abort', cancel, { once: true });
    if (signal.aborted) cancel();
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.timeoutMs);

    try {
      const response = await this.fetcher('https://api.openai.com/v1/responses', {
        method: 'POST',
        mode: 'cors',
        credentials: 'omit',
        redirect: 'error',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, input: prompt.trim(), max_output_tokens: 64, store: false }),
        signal: controller.signal,
      });
      if (response.status === 401)
        throw new ConnectionError('Неверный API key. Замените ключ и повторите проверку.');
      if (response.status === 403)
        throw new ConnectionError('Доступ запрещён. Проверьте разрешения ключа и доступ к модели.');
      if (response.status === 429)
        throw new ConnectionError(
          'Лимит запросов или средств исчерпан. Проверьте баланс и повторите позже.',
        );
      if (response.status === 400 || response.status === 404)
        throw new ConnectionError('Запрос отклонён. Проверьте название и доступность модели.');
      if (!response.ok)
        throw new ConnectionError('OpenAI временно недоступен. Повторите проверку позже.');
      const data: unknown = await response.json();
      if (!isObject(data) || data.status !== 'completed' || !Array.isArray(data.output)) {
        throw new ConnectionError(
          'OpenAI вернул незавершённый или некорректный ответ. Повторите проверку.',
        );
      }
      const parts: string[] = [];
      for (const item of data.output) {
        if (!isObject(item) || item.type !== 'message' || !Array.isArray(item.content)) continue;
        for (const content of item.content) {
          if (
            isObject(content) &&
            content.type === 'output_text' &&
            typeof content.text === 'string'
          )
            parts.push(content.text);
        }
      }
      const text = parts.join('\n').trim().replaceAll(apiKey, '[ключ скрыт]');
      if (!text)
        throw new ConnectionError('OpenAI не вернул текст. Проверьте модель и повторите проверку.');
      const usage = data.usage;
      const totalTokens =
        isObject(usage) &&
        typeof usage.total_tokens === 'number' &&
        Number.isSafeInteger(usage.total_tokens) &&
        usage.total_tokens >= 0
          ? usage.total_tokens
          : undefined;
      return { text, totalTokens };
    } catch (error) {
      if (error instanceof ConnectionError) throw error;
      if (timedOut) throw new ConnectionError('Время ожидания истекло. Повторите проверку.');
      if (signal.aborted) throw new ConnectionError('Проверка отменена.');
      if (error instanceof SyntaxError)
        throw new ConnectionError('OpenAI вернул некорректный ответ. Повторите проверку.');
      throw new ConnectionError(
        'Не удалось связаться с OpenAI. Проверьте интернет. Браузер также может блокировать запрос из-за CORS.',
      );
    } finally {
      clearTimeout(timer);
      signal.removeEventListener('abort', cancel);
      this.busy = false;
    }
  }
}
