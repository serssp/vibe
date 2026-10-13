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
  const active = entries.filter((entry) => entry.unknownCount > 0);
  return (
    <details className="vocabulary-list">
      <summary>Личный словарь · {active.length}</summary>
      {active.length ? (
        <ul>
          {active.slice(0, visible).map((entry) => (
            <li key={entry.id}>
              <strong lang="de">
                {entry.article ? `${entry.article} ` : ''}
                {entry.lemma}
              </strong>{' '}
              — {entry.meaningRu}
              <span className="hint">
                {' '}
                · {entry.status === 'Unknown' ? 'Неизвестно' : 'Изучено'} · отметок:{' '}
                {entry.unknownCount}
              </span>
              <WordHistory
                key={`${entry.id}:${entry.unknownCount}:${entry.exposureCount}:${entry.status}`}
                entry={entry}
                load={loadHistory}
              />
            </li>
          ))}
        </ul>
      ) : (
        <p>Здесь появятся отмеченные слова.</p>
      )}
      {visible < active.length && (
        <button className="secondary" onClick={() => setVisible((count) => count + 20)}>
          Показать ещё слова
        </button>
      )}
    </details>
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
