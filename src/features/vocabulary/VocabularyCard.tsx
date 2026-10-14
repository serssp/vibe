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
}: {
  sentence: string;
  surface: string;
  expanded: boolean;
  result?: WordLookupResult;
  busy: boolean;
  onUndo(): void;
}) {
  const card = result?.translation.card;
  const lemma = card ? [card.article, card.lemma].filter(Boolean).join(' ') : surface;
  const showSurface = card && surface !== card.lemma && surface !== lemma;
  const showExpression = card && ![surface, card.lemma, lemma].includes(card.expression);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, [result?.lookup.id]);
  return (
    <section className="learning-card word-card" aria-labelledby="word-card-heading">
      <div className="word-heading">
        <h2 id="word-card-heading" ref={heading} tabIndex={-1} lang="de">
          {lemma}
          {card?.nounPlural && `, die ${card.nounPlural}`}
        </h2>
        {card && (
          <p className="word-meta">
            {parts[card.partOfSpeech]}
            {card.gender ? ` · ${genders[card.gender]}` : ''}
          </p>
        )}
      </div>
      {card && (
        <>
          {card.irregularVerb && (
            <p className="word-dictionary-forms" lang="de">
              {card.irregularVerb.preterite} — {card.irregularVerb.perfect}
            </p>
          )}
          <p className="word-meaning">{card.meaningRu}</p>
          {showSurface && (
            <p className="tapped-form">
              В тексте: <span lang="de">{surface}</span>
            </p>
          )}
          {expanded && (
            <>
              <blockquote lang="de">{sentence}</blockquote>
              {showExpression && <p lang="de">{card.expression}</p>}
              <p>{card.formRu}</p>
            </>
          )}
        </>
      )}
      {result && (
        <div className="word-mark">
          <p className="hint">Отмечено как незнакомое.</p>
          <button className="secondary" disabled={busy} onClick={onUndo}>
            Отменить отметку
          </button>
        </div>
      )}
    </section>
  );
}
