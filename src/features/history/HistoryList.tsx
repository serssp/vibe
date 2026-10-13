import { useState } from 'react';
import type { ReadingSession, TextDocument } from '../../domain/reading/models';

type Status = 'all' | 'reading' | 'completed';

export function HistoryList({
  entries,
  disabled,
  onOpen,
}: {
  entries: { text: TextDocument; sessions: ReadingSession[] }[];
  disabled: boolean;
  onOpen(textId: string): void;
}) {
  const [visible, setVisible] = useState(20);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<Status>('all');
  const filtered = entries.filter(({ text, sessions }) => {
    const completed =
      sessions.length > 0 && sessions.every((session) => session.status === 'Completed');
    return (
      text.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()) &&
      (status === 'all' || (status === 'completed' ? completed : !completed))
    );
  });
  function reset() {
    setQuery('');
    setStatus('all');
    setVisible(20);
  }
  return (
    <div className="history-list">
      <h2>История текстов · {entries.length}</h2>
      {entries.length > 0 && (
        <>
          <label className="search-label">
            Поиск по названию
            <input
              type="search"
              value={query}
              placeholder="Найти историю"
              onChange={(event) => {
                setQuery(event.target.value);
                setVisible(20);
              }}
            />
          </label>
          <div className="filters" aria-label="Статус текстов">
            {(
              [
                ['all', 'Все'],
                ['reading', 'В процессе'],
                ['completed', 'Завершено'],
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
          <p className="hint" role="status">
            Найдено текстов: {filtered.length}
          </p>
        </>
      )}
      {filtered.length ? (
        <ul>
          {filtered.slice(0, visible).map(({ text, sessions }) => {
            const session = sessions.find((item) => item.status !== 'Completed') ?? sessions[0];
            return (
              <li className="story-card" key={text.id}>
                <div className="story-meta">
                  <span className="badge">
                    {text.cefrLevel} · {text.targetDuration} мин
                  </span>
                  <span className="hint">
                    {session?.status === 'Completed'
                      ? 'Завершено'
                      : session?.status === 'InProgress'
                        ? 'В процессе'
                        : 'Новое'}
                  </span>
                </div>
                <h3 lang="de">{text.title}</h3>
                <p className="story-excerpt" lang="de">
                  {text.content.slice(0, 160)}
                  {text.content.length > 160 ? '…' : ''}
                </p>
                <p className="hint">
                  <time dateTime={text.createdAt}>
                    {new Date(text.createdAt).toLocaleDateString('ru-RU')}
                  </time>{' '}
                  · чтений: {sessions.length}
                </p>
                <button className="secondary" disabled={disabled} onClick={() => onOpen(text.id)}>
                  {session?.status === 'Completed' ? 'Посмотреть текст' : 'Продолжить чтение'}
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="empty-state">
          <p>
            {entries.length
              ? 'Ничего не найдено.'
              : 'Здесь появятся сохранённые тексты. Создайте первую историю и начните читать.'}
          </p>
          {entries.length > 0 && (
            <button className="secondary" onClick={reset}>
              Сбросить фильтры
            </button>
          )}
        </div>
      )}
      {visible < filtered.length && (
        <button className="secondary" onClick={() => setVisible((count) => count + 20)}>
          Показать ещё
        </button>
      )}
    </div>
  );
}
