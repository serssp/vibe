import { useState } from 'react';
import type { ReadingActions } from '../../application/use-cases/reading';
import { actionMessage } from '../../application/errors';
import type { VocabularyEntry } from '../../domain/vocabulary/models';

export function VocabularyList({
  entries,
  loadHistory,
}: {
  entries: VocabularyEntry[];
  loadHistory: ReadingActions['wordHistory'];
}) {
  const [visible, setVisible] = useState(20);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'all' | 'Unknown' | 'Learned'>('all');
  const active = entries.filter((entry) => entry.unknownCount > 0 || entry.status === 'Learned');
  const filtered = active.filter(
    (entry) =>
      (status === 'all' || entry.status === status) &&
      `${entry.article ?? ''} ${entry.lemma} ${entry.meaningRu}`
        .toLocaleLowerCase()
        .includes(query.trim().toLocaleLowerCase()),
  );
  return (
    <div className="vocabulary-list">
      <h2>Слова · {filtered.length}</h2>
      {active.length > 0 && (
        <>
          <label className="search-label">
            Поиск в словаре
            <input
              type="search"
              value={query}
              placeholder="Слово или перевод"
              onChange={(event) => {
                setQuery(event.target.value);
                setVisible(20);
              }}
            />
          </label>
          <div className="filters" aria-label="Статус слов">
            {(
              [
                ['all', 'Все'],
                ['Unknown', 'Изучаю'],
                ['Learned', 'Изучено'],
              ] as const
            ).map(([value, label]) => (
              <button
                className="secondary"
                key={value}
                aria-pressed={status === value}
                onClick={() => {
                  setStatus(value);
                  setVisible(20);
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </>
      )}
      {filtered.length ? (
        <ul>
          {filtered.slice(0, visible).map((entry) => (
            <li className="vocabulary-row" key={entry.id}>
              <div className="story-meta">
                <strong lang="de">
                  {entry.article ? `${entry.article} ` : ''}
                  {entry.lemma}
                </strong>
                <span className="badge">{entry.status === 'Unknown' ? 'Изучаю' : 'Изучено'}</span>
              </div>
              <p>{entry.meaningRu}</p>
              <WordHistory
                key={`${entry.id}:${entry.unknownCount}:${entry.exposureCount}:${entry.status}`}
                entry={entry}
                load={loadHistory}
              />
            </li>
          ))}
        </ul>
      ) : (
        <div className="empty-state">
          <p>
            {active.length
              ? 'Ничего не найдено.'
              : 'Нажмите незнакомое слово во время чтения — оно появится здесь.'}
          </p>
          {active.length > 0 && (
            <button
              className="secondary"
              onClick={() => {
                setQuery('');
                setStatus('all');
                setVisible(20);
              }}
            >
              Сбросить фильтры
            </button>
          )}
        </div>
      )}
      {visible < filtered.length && (
        <button className="secondary" onClick={() => setVisible((count) => count + 20)}>
          Показать ещё слова
        </button>
      )}
    </div>
  );
}

function WordHistory({
  entry,
  load,
}: {
  entry: VocabularyEntry;
  load: ReadingActions['wordHistory'];
}) {
  const [facts, setFacts] = useState<Awaited<ReturnType<ReadingActions['wordHistory']>>>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function open() {
    if (busy || facts) return;
    setBusy(true);
    setError('');
    try {
      setFacts(await load(entry.id));
    } catch (error) {
      setError(actionMessage(error));
    } finally {
      setBusy(false);
    }
  }
  const events = [
    ...(facts?.interactions.map((item) => ({
      id: item.id,
      timestamp: item.timestamp,
      label:
        item.action === 'MarkUnknown'
          ? `Отмечено неизвестным: ${item.surfaceForm}`
          : `Отметка отменена: ${item.surfaceForm}`,
    })) ?? []),
    ...(facts?.exposures.map((item) => ({
      id: item.id,
      timestamp: item.occurredAt,
      label: item.markedUnknown
        ? 'Подтверждённое повторение с отметкой'
        : 'Подтверждённое повторение без отметки',
    })) ?? []),
  ].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp) || a.id.localeCompare(b.id));
  return (
    <details
      onToggle={(event) => {
        if (event.currentTarget.open) void open();
      }}
    >
      <summary>История слова {entry.lemma}</summary>
      {busy && <p role="status">Открываем историю слова…</p>}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {facts &&
        (events.length ? (
          <ul>
            {events.map((event) => (
              <li key={event.id}>
                <time dateTime={event.timestamp}>
                  {new Date(event.timestamp).toLocaleString('ru-RU')}
                </time>{' '}
                · {event.label}
              </li>
            ))}
          </ul>
        ) : (
          <p>Сохранённых действий нет.</p>
        ))}
    </details>
  );
}
