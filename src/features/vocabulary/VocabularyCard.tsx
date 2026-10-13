import type { WordLookupResult } from '../../application/use-cases/lookup-word';
import { useEffect, useRef } from 'react';

const parts: Record<string, string> = {
  noun: 'существительное',
  verb: 'глагол',
  adjective: 'прилагательное',
  adverb: 'наречие',
  pronoun: 'местоимение',
  preposition: 'предлог',
  conjunction: 'союз',
  article: 'артикль',
  numeral: 'числительное',
  particle: 'частица',
  expression: 'выражение',
  other: 'другая часть речи',
};
const genders = { masculine: 'мужской род', feminine: 'женский род', neuter: 'средний род' };

export function VocabularyCard({
  sentence,
  surface,
  expanded,
  result,
  busy,
  onUndo,
  onClose,
}: {
  sentence: string;
  surface: string;
  expanded: boolean;
  result?: WordLookupResult;
  busy: boolean;
  onUndo(): void;
  onClose(): void;
}) {
  const card = result?.translation.card;
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, [result?.lookup.id]);
  return (
    <section className="learning-card" aria-labelledby="word-card-heading">
      <p className="tapped-form" lang="de">
        {surface}
      </p>
      <h2 id="word-card-heading" ref={heading} tabIndex={-1}>
        {card ? (
          <span lang="de">
            {card.article ? `${card.article} ` : ''}
            {card.lemma}
          </span>
        ) : (
          'Перевод слова'
        )}
      </h2>
      {card && (
        <>
          <p className="word-meaning">{card.meaningRu}</p>
          {expanded && (
            <>
              <blockquote lang="de">{sentence}</blockquote>
              <p>
                {parts[card.partOfSpeech]}
                {card.gender ? ` · ${genders[card.gender]}` : ''}
              </p>
              <p lang="de">{card.expression}</p>
            </>
          )}
          <p>{card.formRu}</p>
          <p className="hint">Отмечено как незнакомое.</p>
        </>
      )}
      <div className="actions">
        {result && (
          <button className="secondary" disabled={busy} onClick={onUndo}>
            Отменить отметку
          </button>
        )}
        <button className="secondary" aria-label="Закрыть карточку" onClick={onClose}>
          Закрыть
        </button>
      </div>
    </section>
  );
}
