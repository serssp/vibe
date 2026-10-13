import { useState } from 'react';
import type { ReadingSession, TextDocument } from '../../domain/reading/models';

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
  return (
    <details className="history-list">
      <summary>История текстов · {entries.length}</summary>
      {entries.length ? (
        <ul>
          {entries.slice(0, visible).map(({ text, sessions }) => {
            const session = sessions.find((item) => item.status !== 'Completed') ?? sessions[0];
            return (
              <li key={text.id}>
                <strong lang="de">{text.title}</strong>
                <p className="hint">
                  {new Date(text.createdAt).toLocaleDateString('ru-RU')} · {text.cefrLevel} ·{' '}
                  {text.targetDuration} мин ·{' '}
                  {session?.status === 'Completed'
                    ? 'Завершено'
                    : session?.status === 'InProgress'
                      ? 'В процессе'
                      : 'Новое'}{' '}
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
        <p>Здесь появятся сохранённые тексты.</p>
      )}
      {visible < entries.length && (
        <button className="secondary" onClick={() => setVisible((count) => count + 20)}>
          Показать ещё
        </button>
      )}
    </details>
  );
}
