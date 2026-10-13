import type { VocabularyEntry } from '../../domain/vocabulary/models';

export function VocabularyList({ entries }: { entries: VocabularyEntry[] }) {
  const active = entries.filter((entry) => entry.unknownCount > 0);
  return (
    <details className="vocabulary-list">
      <summary>Личный словарь · {active.length}</summary>
      {active.length ? (
        <ul>
          {active.map((entry) => (
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
            </li>
          ))}
        </ul>
      ) : (
        <p>Здесь появятся отмеченные слова.</p>
      )}
    </details>
  );
}
