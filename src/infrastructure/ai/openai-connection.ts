import {
  ConnectionError,
  type ConnectionRequest,
  type ConnectionResult,
} from '../../application/ports/ai-provider';
import type {
  LearningAIProvider,
  GenerationRequest,
  WordRequest,
  GrammarRequest,
} from '../../application/ports/learning-ai-provider';
import prompt from '../../prompts/connection-check.md?raw';
import { prompts } from './prompt-registry';
import { schemas, parseGeneration, parseWord, parseGrammar } from './structured-outputs';

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export class OpenAIConnectionProvider implements LearningAIProvider {
  private busy = false;
  readonly promptVersions = {
    generation: prompts.generation.version,
    word: prompts.word.version,
    grammar: prompts.grammar.version,
  };

  constructor(
    private readonly fetcher: typeof fetch = fetch.bind(globalThis),
    private readonly timeoutMs = 20000,
  ) {}

  check(request: ConnectionRequest): Promise<ConnectionResult> {
    return this.execute(request, { input: prompt.trim(), max_output_tokens: 64 }, this.timeoutMs);
  }

  async generate(request: GenerationRequest) {
    const wordsPerMinute = { A1: 70, A2: 90, B1: 110 };
    const result = await this.structured(
      request,
      'generation',
      {
        cefrLevel: request.cefrLevel,
        targetDuration: request.targetDuration,
        targetWords: wordsPerMinute[request.cefrLevel] * request.targetDuration,
        recentTopics: request.recentTopics,
        reviewVocabulary: request.reviewVocabulary,
      },
      6000,
    );
    return { ...parseGeneration(result.value), totalTokens: result.totalTokens };
  }

  async translate(request: WordRequest) {
    const result = await this.structured(
      request,
      'word',
      {
        sentence: request.sentence,
        surfaceForm: request.surfaceForm,
        start: request.start,
        end: request.end,
        knownVocabulary: request.knownVocabulary,
      },
      1200,
    );
    const card = parseWord(result.value);
    if (
      card.matchedVocabularyId !== null &&
      !request.knownVocabulary.some(
        (word) =>
          word.id === card.matchedVocabularyId &&
          word.lemma.normalize('NFC').toLocaleLowerCase('de') ===
            card.lemma.normalize('NFC').toLocaleLowerCase('de') &&
          word.partOfSpeech === card.partOfSpeech &&
          word.article === card.article,
      )
    )
      throw new ConnectionError(
        'Ответ не соответствует выбранному значению слова. Повторите попытку.',
      );
    return { card, totalTokens: result.totalTokens };
  }

  async explain(request: GrammarRequest) {
    const result = await this.structured(
      request,
      'grammar',
      { sentence: request.sentence, cefrLevel: request.cefrLevel },
      3000,
    );
    return { rules: parseGrammar(result.value, request.sentence), totalTokens: result.totalTokens };
  }

  private async structured(
    request: ConnectionRequest,
    kind: keyof typeof prompts,
    context: unknown,
    maxTokens: number,
  ) {
    const result = await this.execute(
      request,
      {
        instructions: prompts[kind].instructions,
        input: JSON.stringify(context),
        max_output_tokens: maxTokens,
        text: {
          format: {
            type: 'json_schema',
            name: `vibe_${kind}`,
            strict: true,
            schema: schemas[kind],
          },
        },
      },
      60000,
    );
    try {
      return { value: JSON.parse(result.text) as unknown, totalTokens: result.totalTokens };
    } catch {
      throw new ConnectionError('OpenAI вернул некорректный ответ. Повторите попытку.');
    }
  }

  private async execute(
    { apiKey, model, signal }: ConnectionRequest,
    body: Record<string, unknown>,
    timeout: number,
  ): Promise<ConnectionResult> {
    if (this.busy) throw new ConnectionError('Запрос уже выполняется.');
    if (!apiKey.trim() || !model.trim())
      throw new ConnectionError('Введите API key и укажите модель в настройках.');
    this.busy = true;
    const controller = new AbortController();
    let timedOut = false;
    const cancel = () => controller.abort();
    signal.addEventListener('abort', cancel, { once: true });
    if (signal.aborted) cancel();
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeout);
    try {
      if (controller.signal.aborted) throw new Error('Cancelled');
      const response = await this.fetcher('https://api.openai.com/v1/responses', {
        method: 'POST',
        mode: 'cors',
        credentials: 'omit',
        redirect: 'error',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, ...body, store: false }),
        signal: controller.signal,
      });
      if (controller.signal.aborted) throw new Error('Cancelled');
      if (response.status === 401)
        throw new ConnectionError('Неверный API key. Замените ключ и повторите попытку.');
      if (response.status === 403)
        throw new ConnectionError('Доступ запрещён. Проверьте разрешения ключа и доступ к модели.');
      if (response.status === 429)
        throw new ConnectionError(
          'Лимит запросов или средств исчерпан. Проверьте баланс и повторите позже.',
        );
      if (response.status === 400 || response.status === 404)
        throw new ConnectionError('Запрос отклонён. Проверьте название и доступность модели.');
      if (!response.ok)
        throw new ConnectionError('OpenAI временно недоступен. Повторите попытку позже.');
      const data: unknown = await response.json();
      if (controller.signal.aborted) throw new Error('Cancelled');
      if (!isObject(data) || data.status !== 'completed' || !Array.isArray(data.output))
        throw new ConnectionError(
          'OpenAI вернул незавершённый или некорректный ответ. Повторите попытку.',
        );
      const parts: string[] = [];
      for (const item of data.output) {
        if (!isObject(item) || item.type !== 'message' || !Array.isArray(item.content)) continue;
        for (const content of item.content) {
          if (isObject(content) && content.type === 'refusal')
            throw new ConnectionError('Модель не смогла выполнить запрос. Попробуйте ещё раз.');
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
        throw new ConnectionError('OpenAI не вернул текст. Проверьте модель и повторите попытку.');
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
      if (timedOut) throw new ConnectionError('Время ожидания истекло. Повторите попытку.');
      if (signal.aborted) throw new ConnectionError('Проверка отменена.');
      if (error instanceof SyntaxError)
        throw new ConnectionError('OpenAI вернул некорректный ответ. Повторите попытку.');
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
