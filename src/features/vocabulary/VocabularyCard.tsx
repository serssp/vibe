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
  result,
  busy,
  onUndo,
  onClose,
}: {
  sentence: string;
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
      <blockquote lang="de">{sentence}</blockquote>
      {card && (
        <>
          <p className="word-meaning">{card.meaningRu}</p>
          <p>
            {parts[card.partOfSpeech]}
            {card.gender ? ` · ${genders[card.gender]}` : ''}
          </p>
          <p lang="de">{card.expression}</p>
          <p>{card.formRu}</p>
          <p className="hint">
            {result?.cached
              ? 'Перевод из сохранённой карточки.'
              : 'Слово добавлено в личный словарь.'}
          </p>
        </>
      )}
      <div className="actions">
        {result && (
          <button className="secondary" disabled={busy} onClick={onUndo}>
            Отменить отметку
          </button>
        )}
        <button className="secondary" disabled={busy} onClick={onClose}>
          Закрыть карточку
        </button>
      </div>
    </section>
  );
}
