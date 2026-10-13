import type { GrammarResult } from '../../application/use-cases/explain-grammar';
import { useEffect, useRef } from 'react';

export function GrammarCard({
  sentence,
  result,
  expanded,
  onClose,
}: {
  sentence: string;
  result?: GrammarResult;
  busy: boolean;
  expanded: boolean;
  onClose(): void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, [result?.explanation.id]);
  return (
    <section className="learning-card" aria-labelledby="grammar-card-heading">
      <h2 id="grammar-card-heading" ref={heading} tabIndex={-1}>
        Разбор предложения
      </h2>
      <blockquote lang="de">{sentence}</blockquote>
      {result?.explanation.explanation.rules
        .slice(0, expanded ? undefined : 1)
        .map((rule, index) => (
          <div className="grammar-rule" key={index}>
            <h3>{rule.titleRu}</h3>
            <p>{rule.explanationRu}</p>
            <p lang="de">{rule.fragments.join(' · ')}</p>
            {expanded &&
              rule.examples.map((example, index) => (
                <p key={index}>
                  <span lang="de">{example.de}</span>
                  <br />
                  {example.ru}
                </p>
              ))}
          </div>
        ))}
      {result?.cached && <p className="hint">Сохранённый разбор.</p>}
      <button className="secondary" aria-label="Закрыть разбор" onClick={onClose}>
        Закрыть
      </button>
    </section>
  );
}
