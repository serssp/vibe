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
  onWord(selection: WordSelection): void;
  onGrammar(sentenceId: string): void;
  onPosition(position: ReadingSession['readingPosition']): void;
  onComplete(): void;
  onStart(): void;
}) {
  const completed = session.status === 'Completed';
  const gestures = useReaderGestures(onWord, onGrammar, disabled || completed);
  const article = useReadingPosition(session, onPosition);
  return (
    <section aria-labelledby="reader-heading">
      <h2 id="reader-heading" lang="de">
        {text.title}
      </h2>
      <p className="hint">
        {text.cefrLevel} · {text.targetDuration} мин
      </p>
      <p className="hint">
        Нажмите слово для перевода. Удерживайте слово около полусекунды для разбора предложения.
      </p>
      <article
        ref={article}
        className="reader-text"
        lang="de"
        onContextMenu={(event) => event.preventDefault()}
        onPointerDownCapture={gestures.begin}
      >
        {text.sentences.map((sentence, index) => (
          <div className="sentence-row" key={sentence.id}>
            <p
              data-sentence-id={sentence.id}
              className={selectedSentenceId === sentence.id ? 'sentence selected' : 'sentence'}
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
                    className="word"
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
            </p>
            <button
              className="sentence-analysis secondary"
              disabled={disabled}
              aria-label={`Разобрать предложение ${index + 1}`}
              onClick={() => onGrammar(sentence.id)}
            >
              Разобрать предложение
            </button>
          </div>
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
