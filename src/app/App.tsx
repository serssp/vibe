import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReadingActions } from '../application/use-cases/reading';
import type { BackupActions } from '../application/use-cases/backup';
import type { LearningSnapshot } from '../domain/learning/data';
import { HistoryList } from '../features/history/HistoryList';
import { BackupPanel } from '../features/history/BackupPanel';
import type { SettingsActions } from '../application/use-cases/settings';
import type { GenerationActions } from '../application/use-cases/generate-text';
import {
  WordLookupError,
  type WordActions,
  type WordLookupResult,
} from '../application/use-cases/lookup-word';
import type { GrammarActions, GrammarResult } from '../application/use-cases/explain-grammar';
import type { ReadingSession, TextDocument } from '../domain/reading/models';
import type { AppSettings } from '../domain/settings/app-settings';
import type { WordLookup, WordSelection } from '../domain/vocabulary/lookups';
import type { VocabularyEntry } from '../domain/vocabulary/models';
import { SettingsPage } from '../features/settings/SettingsPage';
import { GenerationPanel } from '../features/reader/GenerationPanel';
import { Reader } from '../features/reader/Reader';
import { VocabularyCard } from '../features/vocabulary/VocabularyCard';
import { VocabularyList } from '../features/vocabulary/VocabularyList';
import { GrammarCard } from '../features/grammar/GrammarCard';
import { actionMessage } from '../application/errors';

export function App({
  settings,
  generation,
  words,
  grammar,
  readingActions,
  backups,
}: {
  settings: SettingsActions;
  generation: GenerationActions;
  words: WordActions;
  grammar: GrammarActions;
  readingActions: ReadingActions;
  backups: BackupActions;
}) {
  const [reading, setReading] = useState<{ text: TextDocument; session: ReadingSession }>();
  const [preferences, setPreferences] = useState<AppSettings>();
  const [history, setHistory] = useState<Awaited<ReturnType<ReadingActions['history']>>>([]);
  const [localBusy, setLocalBusy] = useState(false);
  const localActive = useRef(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [totalTokens, setTotalTokens] = useState<number>();
  const [wordTarget, setWordTarget] = useState<WordSelection>();
  const [grammarTarget, setGrammarTarget] = useState<string>();
  const [wordResult, setWordResult] = useState<WordLookupResult>();
  const [grammarResult, setGrammarResult] = useState<GrammarResult>();
  const [analysisBusy, setAnalysisBusy] = useState(false);
  const [analysisError, setAnalysisError] = useState('');
  const [failedLookupId, setFailedLookupId] = useState<string>();
  const [undoBusy, setUndoBusy] = useState(false);
  const [pending, setPending] = useState<WordLookup[]>([]);
  const [vocabulary, setVocabulary] = useState<VocabularyEntry[]>([]);
  const active = useRef<AbortController | null>(null);
  const focusReturn = useRef<HTMLElement | null>(null);
  const sessionId = reading?.session.id;

  useEffect(() => {
    let alive = true;
    void Promise.all([generation.restore(), generation.preferences(), readingActions.history()])
      .then(([reading, preferences, history]) => {
        if (alive) {
          setReading(reading);
          setHistory(history);
          setPreferences(preferences);
          setReady(true);
        }
      })
      .catch((error: unknown) => {
        if (alive) {
          setError(actionMessage(error));
          setReady(true);
        }
      });
    return () => {
      alive = false;
      active.current?.abort();
    };
  }, [generation, readingActions]);

  useEffect(() => {
    let alive = true;
    void Promise.all([
      words.vocabulary(),
      sessionId ? words.pending(sessionId) : Promise.resolve([]),
    ])
      .then(([entries, pending]) => {
        if (alive) {
          setVocabulary(entries);
          setPending(pending);
        }
      })
      .catch((error: unknown) => {
        if (alive) setError(actionMessage(error));
      });
    return () => {
      alive = false;
    };
  }, [words, sessionId]);

  async function refreshWords() {
    const [entries, pending] = await Promise.all([
      words.vocabulary(),
      reading ? words.pending(reading.session.id) : Promise.resolve([]),
    ]);
    setVocabulary(entries);
    setPending(pending);
  }

  async function generate(
    cefrLevel: AppSettings['cefrLevel'],
    targetDuration: AppSettings['targetDuration'],
  ) {
    if (active.current || localActive.current) return;
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    setError('');
    setTotalTokens(undefined);
    try {
      const connection = settings.load();
      const result = await generation.generate({
        ...connection,
        cefrLevel,
        targetDuration,
        signal: controller.signal,
      });
      setReading(result);
      setHistory(await readingActions.history());
      setTotalTokens(result.totalTokens);
      closeAnalysis();
    } catch (error) {
      setError(actionMessage(error));
    } finally {
      active.current = null;
      setBusy(false);
    }
  }

  function closeAnalysis() {
    setWordTarget(undefined);
    setGrammarTarget(undefined);
    setAnalysisError('');
    setFailedLookupId(undefined);
    setWordResult(undefined);
    setGrammarResult(undefined);
    if (focusReturn.current?.isConnected) focusReturn.current.focus({ preventScroll: true });
  }

  function rememberFocus() {
    if (
      document.activeElement instanceof HTMLElement &&
      !document.activeElement.closest('.analysis-panel')
    )
      focusReturn.current = document.activeElement;
  }

  async function lookup(selection: WordSelection, lookupId?: string) {
    if (active.current || localActive.current || undoBusy) return;
    rememberFocus();
    const controller = new AbortController();
    active.current = controller;
    setAnalysisBusy(true);
    setAnalysisError('');
    setFailedLookupId(lookupId);
    setWordTarget(selection);
    setGrammarTarget(undefined);
    setWordResult(undefined);
    setGrammarResult(undefined);
    try {
      const result = await words.lookup({
        ...settings.load(),
        selection,
        lookupId,
        signal: controller.signal,
      });
      setWordResult(result);
      setFailedLookupId(undefined);
    } catch (error) {
      setAnalysisError(actionMessage(error));
      if (error instanceof WordLookupError) setFailedLookupId(error.lookupId);
    } finally {
      try {
        await refreshWords();
      } catch (error) {
        setAnalysisError(actionMessage(error));
      }
      active.current = null;
      setAnalysisBusy(false);
    }
  }

  async function explain(sentenceId: string) {
    if (active.current || localActive.current || undoBusy || !reading) return;
    rememberFocus();
    const controller = new AbortController();
    active.current = controller;
    setAnalysisBusy(true);
    setAnalysisError('');
    setFailedLookupId(undefined);
    setGrammarTarget(sentenceId);
    setWordTarget(undefined);
    setWordResult(undefined);
    setGrammarResult(undefined);
    try {
      setGrammarResult(
        await grammar.explain({
          ...settings.load(),
          textId: reading.text.id,
          sentenceId,
          cefrLevel: reading.text.cefrLevel,
          signal: controller.signal,
        }),
      );
    } catch (error) {
      setAnalysisError(actionMessage(error));
    } finally {
      active.current = null;
      setAnalysisBusy(false);
    }
  }

  async function undo(id: string) {
    if (active.current || localActive.current || undoBusy) return;
    setUndoBusy(true);
    setAnalysisError('');
    try {
      await words.undo(id);
      closeAnalysis();
      await refreshWords();
    } catch (error) {
      setAnalysisError(actionMessage(error));
    } finally {
      setUndoBusy(false);
    }
  }

  async function localAction(work: () => Promise<void>) {
    if (active.current || localActive.current || undoBusy) return;
    localActive.current = true;
    setLocalBusy(true);
    setError('');
    try {
      await work();
    } catch (error) {
      setError(actionMessage(error));
    } finally {
      localActive.current = false;
      setLocalBusy(false);
    }
  }

  async function openReading(textId: string, start = false) {
    await localAction(async () => {
      closeAnalysis();
      const result = start
        ? await readingActions.start(textId)
        : await readingActions.resume(textId);
      if (result.session.status === 'New')
        result.session = (await readingActions.start(textId)).session;
      setReading(result);
      setHistory(await readingActions.history());
    });
  }

  async function finishReading() {
    if (!reading) return;
    await localAction(async () => {
      const session = await readingActions.complete(reading.session.id);
      closeAnalysis();
      setReading({ text: reading.text, session });
      await refreshWords();
      setHistory(await readingActions.history());
    });
  }

  async function restoreData(data: LearningSnapshot) {
    if (active.current || localActive.current || undoBusy)
      throw new Error('Операция уже выполняется.');
    localActive.current = true;
    setLocalBusy(true);
    try {
      await backups.restore(data);
      closeAnalysis();
      const [restored, preferences, history, entries] = await Promise.all([
        generation.restore(),
        generation.preferences(),
        readingActions.history(),
        words.vocabulary(),
      ]);
      setReading(restored);
      setPreferences(preferences);
      setHistory(history);
      setVocabulary(entries);
    } finally {
      localActive.current = false;
      setLocalBusy(false);
    }
  }

  const savePosition = useCallback(
    (position: ReadingSession['readingPosition']) => {
      if (!sessionId) return;
      void readingActions
        .savePosition(sessionId, position)
        .catch((error: unknown) => setError(actionMessage(error)));
    },
    [readingActions, sessionId],
  );

  const disabled = busy || analysisBusy || undoBusy || localBusy || !ready;
  const sentenceId = wordTarget?.sentenceId ?? grammarTarget;
  const sentence = reading?.text.sentences.find((item) => item.id === sentenceId)?.content ?? '';
  const analysisTokens = wordResult?.totalTokens ?? grammarResult?.totalTokens;
  return (
    <main>
      <p className="eyebrow">VIBE · НЕМЕЦКИЙ ЯЗЫК</p>
      <h1>Немецкий каждый день</h1>
      <p>Читайте немецкие истории в своём темпе.</p>
      {ready ? (
        <GenerationPanel
          level={preferences?.cefrLevel ?? 'A1'}
          duration={preferences?.targetDuration ?? 3}
          busy={busy}
          disabled={disabled}
          onGenerate={(level, duration) => void generate(level, duration)}
          onCancel={() => active.current?.abort()}
        />
      ) : (
        <p role="status">Открываем сохранённый текст…</p>
      )}
      {busy && <p role="status">Ожидаем текст от OpenAI…</p>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {totalTokens !== undefined && (
        <p className="hint" role="status">
          Токенов использовано: {totalTokens}
        </p>
      )}
      {pending.length > 0 && (
        <section aria-labelledby="pending-heading">
          <h2 id="pending-heading">Незавершённые отметки</h2>
          <p>Запрос не завершился. Отметки сохранены.</p>
          {pending.map((lookup) => (
            <div className="pending-lookup" key={lookup.id}>
              <span lang="de">{lookup.selection.surfaceForm}</span>
              <button
                className="secondary"
                disabled={disabled}
                onClick={() => void lookupWordAgain(lookup)}
              >
                Повторить перевод
              </button>
              <button
                className="secondary"
                disabled={disabled}
                onClick={() => void undo(lookup.id)}
              >
                Отменить отметку
              </button>
            </div>
          ))}
        </section>
      )}
      {reading && (
        <Reader
          key={reading.session.id}
          text={reading.text}
          session={reading.session}
          disabled={disabled}
          selectedSentenceId={grammarTarget}
          onWord={(selection) => void lookup(selection)}
          onGrammar={(id) => void explain(id)}
          onPosition={savePosition}
          onComplete={() => void finishReading()}
          onStart={() => void openReading(reading.text.id, true)}
        />
      )}
      {(wordTarget || grammarTarget) && (
        <aside className="analysis-panel" aria-label="Карточка обучения">
          {wordTarget && (
            <VocabularyCard
              sentence={sentence}
              result={wordResult}
              busy={analysisBusy || undoBusy}
              onUndo={() => {
                if (wordResult) void undo(wordResult.lookup.id);
              }}
              onClose={closeAnalysis}
            />
          )}
          {grammarTarget && (
            <GrammarCard
              sentence={sentence}
              result={grammarResult}
              busy={analysisBusy}
              onClose={closeAnalysis}
            />
          )}
          {analysisBusy && (
            <div role="status">
              <p>{wordTarget ? 'Переводим слово…' : 'Разбираем предложение…'}</p>
              <button className="secondary" onClick={() => active.current?.abort()}>
                Отменить запрос
              </button>
            </div>
          )}
          {analysisError && (
            <>
              <p className="error" role="alert">
                {analysisError}
              </p>
              <div className="actions">
                <button
                  disabled={analysisBusy}
                  onClick={() => {
                    if (wordTarget) void lookup(wordTarget, failedLookupId);
                    else if (grammarTarget) void explain(grammarTarget);
                  }}
                >
                  Повторить запрос
                </button>
                {failedLookupId && (
                  <button
                    className="secondary"
                    disabled={analysisBusy || undoBusy}
                    onClick={() => void undo(failedLookupId)}
                  >
                    Отменить отметку
                  </button>
                )}
              </div>
            </>
          )}
          {analysisTokens !== undefined && (
            <p className="hint">Токенов использовано: {analysisTokens}</p>
          )}
        </aside>
      )}
      <VocabularyList entries={vocabulary} loadHistory={readingActions.wordHistory} />
      <HistoryList entries={history} disabled={disabled} onOpen={(id) => void openReading(id)} />
      <BackupPanel backups={backups} disabled={disabled} onRestore={restoreData} />
      <details className="settings-details" open>
        <summary>Настройки и проверка OpenAI</summary>
        <SettingsPage settings={settings} />
      </details>
    </main>
  );

  function lookupWordAgain(pending: WordLookup) {
    return lookup(pending.selection, pending.id);
  }
}
