import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkConnection, ConnectionError, type ConnectionProvider } from '../src/application/check-connection';
import { OpenAIConnectionProvider } from '../src/infrastructure/openai-connection';

const apiKey = 'test-credential';
const request = () => ({ apiKey, model: 'test-model', signal: new AbortController().signal });
const success = (text = 'Hallo!') => ({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text }] }], usage: { total_tokens: 12 } });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

afterEach(() => vi.useRealTimers());

describe('Connection check', () => {
  it('validates inputs before calling the provider', async () => {
    const provider: ConnectionProvider = { check: vi.fn() };
    await expect(checkConnection(provider, { ...request(), apiKey: ' ' })).rejects.toThrow('Введите API key');
    await expect(checkConnection(provider, { ...request(), model: ' ' })).rejects.toThrow('Укажите модель');
    expect(provider.check).not.toHaveBeenCalled();
  });

  it('trims credentials and model for the provider', async () => {
    const provider: ConnectionProvider = { check: vi.fn().mockResolvedValue({ text: 'Hallo!' }) };
    await checkConnection(provider, { ...request(), apiKey: ` ${apiKey} `, model: ' test-model ' });
    expect(provider.check).toHaveBeenCalledWith(expect.objectContaining({ apiKey, model: 'test-model' }));
  });

  it('uses direct CORS POST, no cookies, no redirects, no response storage', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json(success()));
    const result = await new OpenAIConnectionProvider(fetcher).check(request());
    expect(result).toEqual({ text: 'Hallo!', totalTokens: 12 });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, options] = fetcher.mock.calls[0]!;
    expect(url).toBe('https://api.openai.com/v1/responses');
    expect(options).toMatchObject({ method: 'POST', mode: 'cors', credentials: 'omit', redirect: 'error', headers: { Authorization: `Bearer ${apiKey}` } });
    expect(JSON.parse(options!.body as string)).toMatchObject({ model: 'test-model', store: false, max_output_tokens: 64 });
  });

  it.each([
    [401, 'Неверный API key'],
    [403, 'Доступ запрещён'],
    [429, 'Лимит запросов'],
    [400, 'Проверьте название'],
    [404, 'Проверьте название'],
    [500, 'временно недоступен'],
  ])('handles HTTP %s without exposing the response or retrying', async (status, message) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json({ error: { message: apiKey } }, status));
    const provider = new OpenAIConnectionProvider(fetcher);
    await expect(provider.check(request())).rejects.toThrow(message);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('replaces raw network errors with a safe network/CORS message', async () => {
    const provider = new OpenAIConnectionProvider(vi.fn<typeof fetch>().mockRejectedValue(new TypeError(apiKey)));
    await expect(provider.check(request())).rejects.toThrow('Проверьте интернет');
  });

  it.each([{}, { ...success(), status: 'incomplete' }, { status: 'completed', output: [] }])('rejects invalid or incomplete response %j', async (body) => {
    const provider = new OpenAIConnectionProvider(vi.fn<typeof fetch>().mockResolvedValue(json(body)));
    await expect(provider.check(request())).rejects.toBeInstanceOf(ConnectionError);
  });

  it('handles invalid JSON without exposing it', async () => {
    const provider = new OpenAIConnectionProvider(vi.fn<typeof fetch>().mockResolvedValue(new Response('invalid JSON')));
    await expect(provider.check(request())).rejects.toThrow('некорректный ответ');
  });

  it('redacts the current credential even if returned as text', async () => {
    const provider = new OpenAIConnectionProvider(vi.fn<typeof fetch>().mockResolvedValue(json(success(apiKey))));
    expect((await provider.check(request())).text).toBe('[ключ скрыт]');
  });

  it('blocks duplicate requests and allows a later retry', async () => {
    let finish!: (response: Response) => void;
    const fetcher = vi.fn<typeof fetch>().mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; })).mockResolvedValue(json(success()));
    const provider = new OpenAIConnectionProvider(fetcher);
    const pending = provider.check(request());
    await expect(provider.check(request())).rejects.toThrow('уже выполняется');
    expect(fetcher).toHaveBeenCalledTimes(1);
    finish(json(success()));
    await pending;
    await provider.check(request());
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('times out and clears its pending state', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn<typeof fetch>().mockImplementation((_url, options) => new Promise((_resolve, reject) => {
      options!.signal!.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    }));
    const provider = new OpenAIConnectionProvider(fetcher, 20);
    const failure = expect(provider.check(request())).rejects.toThrow('Время ожидания истекло');
    await vi.advanceTimersByTimeAsync(20);
    await failure;
    fetcher.mockResolvedValue(json(success()));
    await expect(provider.check(request())).resolves.toMatchObject({ text: 'Hallo!' });
  });

  it('cancels an active request', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation((_url, options) => new Promise((_resolve, reject) => {
      options!.signal!.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    }));
    const provider = new OpenAIConnectionProvider(fetcher);
    const controller = new AbortController();
    const failure = expect(provider.check({ ...request(), signal: controller.signal })).rejects.toThrow('отменена');
    controller.abort();
    await failure;
  });
});
