import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ConnectionError, type ConnectionResult } from '../../application/ports/ai-provider';
import type { SettingsActions } from '../../application/use-cases/settings';

export function SettingsPage({ settings }: { settings: SettingsActions }) {
  const [initial] = useState(() => settings.load());
  const [apiKey, setApiKey] = useState(initial.apiKey);
  const [model, setModel] = useState(initial.model);
  const [savedKey, setSavedKey] = useState(initial.apiKey);
  const [message, setMessage] = useState(
    initial.storageAvailable
      ? ''
      : 'Локальное сохранение недоступно. Ключ можно использовать до закрытия страницы.',
  );
  const [error, setError] = useState('');
  const [result, setResult] = useState<ConnectionResult | null>(null);
  const [busy, setBusy] = useState(false);
  const active = useRef<AbortController | null>(null);

  useEffect(() => () => active.current?.abort(), []);

  function persist(event: FormEvent) {
    event.preventDefault();
    setResult(null);
    setError('');
    try {
      settings.save(apiKey, model);
      setSavedKey(apiKey.trim());
      setMessage(
        apiKey.trim()
          ? 'Ключ и модель сохранены в этом браузере.'
          : 'Ключ удалён. Модель сохранена.',
      );
    } catch {
      setMessage('Не удалось сохранить настройки. Проверка доступна до закрытия страницы.');
    }
  }

  function removeKey() {
    try {
      settings.removeKey(model);
      setApiKey('');
      setSavedKey('');
      setResult(null);
      setError('');
      setMessage('Ключ удалён из этого браузера.');
    } catch {
      setError(
        'Не удалось удалить сохранённый ключ. Разрешите доступ к локальному хранилищу и повторите.',
      );
    }
  }

  async function runCheck() {
    if (active.current) return;
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    setError('');
    setResult(null);
    setMessage('');
    try {
      setResult(await settings.check({ apiKey, model, signal: controller.signal }));
    } catch (caught) {
      setError(
        caught instanceof ConnectionError
          ? caught.message
          : 'Проверка не выполнена. Повторите попытку.',
      );
    } finally {
      active.current = null;
      setBusy(false);
    }
  }

  return (
    <div className="settings-page">
      <section aria-labelledby="settings-heading">
        <h2 id="settings-heading">Настройки OpenAI</h2>
        <form onSubmit={persist}>
          <label htmlFor="api-key">API key</label>
          <input
            id="api-key"
            type="password"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            value={apiKey}
            disabled={busy}
            onChange={(event) => {
              setApiKey(event.target.value);
              setResult(null);
              setError('');
            }}
            aria-describedby="key-note"
          />
          <p id="key-note" className="hint">
            Ключ хранится только в этом браузере. Запрос отправляется напрямую в OpenAI; ключ
            доступен браузеру.
          </p>
          <label htmlFor="model">Модель</label>
          <input
            id="model"
            type="text"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            value={model}
            disabled={busy}
            onChange={(event) => {
              setModel(event.target.value);
              setResult(null);
              setError('');
            }}
          />
          <div className="actions">
            <button type="submit" disabled={busy || !model.trim()}>
              Сохранить настройки
            </button>
            <button
              className="secondary"
              type="button"
              onClick={removeKey}
              disabled={busy || (!apiKey && !savedKey)}
            >
              Удалить ключ
            </button>
          </div>
        </form>
      </section>
      <section aria-labelledby="check-heading">
        <h2 id="check-heading">Тестовый запрос</h2>
        <p>
          Ожидаемый ответ: <span lang="de">Hallo!</span> Запрос расходует небольшое количество
          токенов.
        </p>
        <button
          type="button"
          onClick={() => void runCheck()}
          disabled={busy || !apiKey.trim() || !model.trim()}
        >
          {busy ? 'Проверяем…' : 'Проверить подключение'}
        </button>
        {busy && (
          <button
            className="secondary cancel"
            type="button"
            onClick={() => active.current?.abort()}
          >
            Отменить
          </button>
        )}
        <div role="status" aria-live="polite" aria-atomic="true">
          {busy && <p>Ожидаем ответ OpenAI…</p>}
          {message && <p>{message}</p>}
          {result && (
            <div className="result">
              <strong>OpenAI ответил</strong>
              <p lang="de">{result.text}</p>
              {result.totalTokens !== undefined && (
                <p className="hint">Токенов использовано: {result.totalTokens}</p>
              )}
            </div>
          )}
        </div>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
      </section>
    </div>
  );
}
