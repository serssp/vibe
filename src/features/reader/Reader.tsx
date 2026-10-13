import { useRef, useState } from 'react';
import type { ReaderAppearance } from '../../domain/settings/reader-appearance';
import type { ReadingSession, TextDocument } from '../../domain/reading/models';
import type { WordSelection } from '../../domain/vocabulary/lookups';
import { tokenize } from '../../domain/reading/tokens';
import { useReadingPosition } from './use-reading-position';
import { useReaderGestures } from './use-reader-gestures';

export function Reader({
  text,
  session,
  disabled,
  selectedSentenceId,
  selectedWord,
  appearance,
  onWord,
  onGrammar,
  onPosition,
  onComplete,
  onStart,
}: {
  text: TextDocument;
  session: ReadingSession;
  disabled: boolean;
  selectedSentenceId?: string;
  selectedWord?: WordSelection;
  appearance: ReaderAppearance;
  onWord(selection: WordSelection): void;
  onGrammar(sentenceId: string): void;
  onPosition(position: ReadingSession['readingPosition']): void;
  onComplete(): void;
  onStart(): void;
}) {
  const grammarAccess = useRef<HTMLDetailsElement>(null);
  const [focusedSentence, setFocusedSentence] = useState(
    session.readingPosition.sentenceId ?? text.sentences[0]?.id,
  );
  let contentOffset = 0;
  const paragraphAfter = text.sentences.map((sentence, index) => {
    const start = text.content.indexOf(sentence.content, contentOffset);
    if (start < 0) return false;
    contentOffset = start + sentence.content.length;
    const next = text.sentences[index + 1];
    const nextStart = next ? text.content.indexOf(next.content, contentOffset) : -1;
    return (
      nextStart >= contentOffset && /\n\s*\n/.test(text.content.slice(contentOffset, nextStart))
    );
  });
  const completed = session.status === 'Completed';
  const gestures = useReaderGestures(onWord, onGrammar, disabled || completed);
  const { article, progress } = useReadingPosition(session, onPosition, JSON.stringify(appearance));
  return (
    <section className="reader-page" aria-labelledby="reader-heading">
      <progress
        className="reading-progress"
        value={progress}
        max={100}
        aria-label="Позиция в тексте"
      />
      <h2 id="reader-heading" lang="de">
        {text.title}
      </h2>
      <p className="hint">
        {text.cefrLevel} · {text.targetDuration} мин
      </p>
      {!appearance.hintSeen && (
        <p className="hint">
          Нажмите слово для перевода. Удерживайте его для разбора предложения. Чтение завершается
          отдельной кнопкой.
        </p>
      )}
      <details ref={grammarAccess} className="grammar-access">
        <summary>Разобрать предложение</summary>
        <label>
          Предложение
          <select
            aria-label="Предложение для разбора"
            value={focusedSentence ?? ''}
            onChange={(event) => setFocusedSentence(event.target.value)}
          >
            {text.sentences.map((sentence, index) => (
              <option value={sentence.id} key={sentence.id}>
                {index + 1}. {sentence.content}
              </option>
            ))}
          </select>
        </label>
        <button
          className="secondary"
          disabled={disabled || !focusedSentence}
          onClick={() => focusedSentence && onGrammar(focusedSentence)}
        >
          Разобрать выбранное предложение
        </button>
      </details>
      <article
        ref={article}
        className={`reader-text ${appearance.sentencePerLine ? 'sentence-lines' : ''}`}
        style={{
          fontFamily: appearance.family === 'serif' ? 'var(--serif)' : 'var(--sans)',
          fontSize: `${appearance.size}rem`,
          lineHeight: appearance.lineHeight,
        }}
        lang="de"
        onContextMenu={(event) => event.preventDefault()}
        onPointerDownCapture={gestures.begin}
      >
        {text.sentences.map((sentence, index) => (
          <span className="sentence-row" key={sentence.id}>
            <span
              data-sentence-id={sentence.id}
              className={`sentence ${selectedSentenceId === sentence.id ? 'grammar-selected' : selectedWord?.sentenceId === sentence.id ? 'selected' : ''}`}
              tabIndex={0}
              onFocus={(event) => {
                setFocusedSentence(sentence.id);
                if (event.target === event.currentTarget && grammarAccess.current)
                  grammarAccess.current.open = true;
              }}
            >
              {tokenize(sentence.content).map((token) => {
                if (!token.word || completed) return <span key={token.start}>{token.content}</span>;
                const selection: WordSelection = {
                  sessionId: session.id,
                  textId: text.id,
                  sentenceId: sentence.id,
                  surfaceForm: token.content,
                  start: token.start,
                  end: token.end,
                };
                return (
                  <span
                    className={`word ${selectedWord?.sentenceId === sentence.id && selectedWord.start === token.start ? 'selected' : ''}`}
                    data-word-start={token.start}
                    role="button"
                    aria-label={`Перевести ${token.content}`}
                    aria-disabled={disabled}
                    tabIndex={disabled ? -1 : 0}
                    key={token.start}
                    onPointerDown={(event) => gestures.down(event, selection)}
                    onPointerMove={gestures.move}
                    onPointerUp={gestures.up}
                    onPointerCancel={gestures.cancel}
                    onLostPointerCapture={gestures.cancel}
                    onKeyDown={(event) => {
                      if (!disabled && !event.repeat && ['Enter', ' '].includes(event.key)) {
                        event.preventDefault();
                        onWord(selection);
                      }
                    }}
                  >
                    {token.content}
                  </span>
                );
              })}
            </span>{' '}
            {paragraphAfter[index] && <br className="paragraph-break" />}
          </span>
        ))}
      </article>
      {completed ? (
        <div className="result">
          <p role="status">Чтение завершено. Просмотр не изменяет прогресс.</p>
          <button disabled={disabled} onClick={onStart}>
            Начать новое чтение
          </button>
        </div>
      ) : (
        <button disabled={disabled} onClick={onComplete}>
          Завершить чтение
        </button>
      )}
    </section>
  );
}
