import { FloatingSheet } from './FloatingSheet';
import { Modal } from './Modal';
import type { ReaderPreferences } from '../application/use-cases/reader-preferences';
import { ReaderAppearance } from '../features/settings/ReaderAppearance';
import type { ReaderAppearance as Appearance } from '../domain/settings/reader-appearance';
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
import { useNavigation, navigate, dismissPanel } from './navigation';
import { actionMessage } from '../application/errors';

export function App({
  settings,
  readerPreferences,
  generation,
  words,
  grammar,
  readingActions,
  backups,
}: {
  settings: SettingsActions;
  readerPreferences: ReaderPreferences;
  generation: GenerationActions;
  words: WordActions;
  grammar: GrammarActions;
  readingActions: ReadingActions;
  backups: BackupActions;
}) {
  const [appearance, setAppearance] = useState(() => readerPreferences.load());
  const [expanded, setExpanded] = useState(false);
  const analysisEpoch = useRef(0);
  const analysisController = useRef<AbortController | null>(null);
  const route = useNavigation();
  const libraryScroll = useRef(0);
  const [generationChoice, setGenerationChoice] = useState<{
    level: AppSettings['cefrLevel'];
    duration: AppSettings['targetDuration'];
  }>();
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
  const currentSession = useRef(sessionId);

  useEffect(() => {
    const previous = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';
    return () => {
      window.history.scrollRestoration = previous;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    void Promise.all([generation.restore(), generation.preferences(), readingActions.history()])
      .then(([reading, preferences, history]) => {
        if (alive) {
          if (window.location.hash.includes('?panel=analysis')) {
            window.history.replaceState(
              { vibePanel: false, vibeReader: false },
              '',
              window.location.hash.split('?')[0],
            );
            window.dispatchEvent(new PopStateEvent('popstate'));
          }
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
    currentSession.current = sessionId;
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

  useEffect(() => {
    if (route.screen === 'library') window.scrollTo(0, libraryScroll.current);
    else if (route.screen !== 'reader') window.scrollTo(0, 0);
  }, [route.screen]);

  useEffect(() => {
    const changed = () => {
      if (
        !window.location.hash.endsWith('?panel=generation') &&
        active.current &&
        !analysisController.current
      )
        active.current.abort();
      if (window.location.hash.endsWith('?panel=analysis')) return;
      analysisEpoch.current++;
      analysisController.current?.abort();
      setWordTarget(undefined);
      setGrammarTarget(undefined);
      setWordResult(undefined);
      setGrammarResult(undefined);
      setAnalysisError('');
      setFailedLookupId(undefined);
      if (focusReturn.current?.isConnected) focusReturn.current.focus({ preventScroll: true });
    };
    window.addEventListener('popstate', changed);
    window.addEventListener('hashchange', changed);
    return () => {
      window.removeEventListener('popstate', changed);
      window.removeEventListener('hashchange', changed);
    };
  }, []);

  function changeAppearance(value: Appearance) {
    setAppearance(value);
    try {
      readerPreferences.save(value);
    } catch {
      setError('Вид текста изменён, но не сохранён. Проверьте доступ к локальному хранилищу.');
    }
  }

  useEffect(() => {
    if (!ready || route.screen !== 'reader') return;
    if (!route.textId) {
      navigate('library', undefined, undefined, true);
      return;
    }
    if (reading?.text.id === route.textId && reading.session.status !== 'New') return;
    let alive = true;
    void readingActions
      .resume(route.textId)
      .then(async (result) => {
        if (result.session.status === 'New') result = await readingActions.start(result.text.id);
        if (alive) setReading(result);
      })
      .catch((error: unknown) => {
        if (alive) {
          setError(actionMessage(error));
          navigate('library', undefined, undefined, true);
        }
      });
    return () => {
      alive = false;
    };
  }, [
    ready,
    route.screen,
    route.textId,
    reading?.text.id,
    reading?.session.status,
    readingActions,
  ]);

  async function refreshWords() {
    const [entries, pending] = await Promise.all([
      words.vocabulary(),
      reading ? words.pending(reading.session.id) : Promise.resolve([]),
    ]);
    setVocabulary(entries);
    if (currentSession.current === reading?.session.id) setPending(pending);
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
      if (controller.signal.aborted) {
        setHistory(await readingActions.history());
        return;
      }
      setReading(result);
      navigate('reader', result.text.id, undefined, true);
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
    analysisEpoch.current++;
    analysisController.current?.abort();
    setExpanded(false);
    setWordTarget(undefined);
    setGrammarTarget(undefined);
    setAnalysisError('');
    setFailedLookupId(undefined);
    setWordResult(undefined);
    setGrammarResult(undefined);
    if (route.panel === 'analysis') dismissPanel(route.screen, route.textId);
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
    if (route.panel !== 'analysis') navigate('reader', reading?.text.id, 'analysis');
    const controller = new AbortController();
    active.current = controller;
    analysisController.current = controller;
    const epoch = ++analysisEpoch.current;
    setExpanded(false);
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
      if (epoch === analysisEpoch.current) {
        setWordResult(result);
        setFailedLookupId(undefined);
      }
    } catch (error) {
      if (epoch === analysisEpoch.current) {
        setAnalysisError(actionMessage(error));
        if (error instanceof WordLookupError) setFailedLookupId(error.lookupId);
      }
    } finally {
      try {
        await refreshWords();
      } catch (error) {
        if (epoch === analysisEpoch.current) setAnalysisError(actionMessage(error));
      }
      if (active.current === controller) active.current = null;
      if (analysisController.current === controller) analysisController.current = null;
      setAnalysisBusy(false);
    }
  }

  async function explain(sentenceId: string) {
    if (active.current || localActive.current || undoBusy || !reading) return;
    rememberFocus();
    if (route.panel !== 'analysis') navigate('reader', reading?.text.id, 'analysis');
    const controller = new AbortController();
    active.current = controller;
    analysisController.current = controller;
    const epoch = ++analysisEpoch.current;
    setExpanded(false);
    setAnalysisBusy(true);
    setAnalysisError('');
    setFailedLookupId(undefined);
    setGrammarTarget(sentenceId);
    setWordTarget(undefined);
    setWordResult(undefined);
    setGrammarResult(undefined);
    try {
      const result = await grammar.explain({
        ...settings.load(),
        textId: reading.text.id,
        sentenceId,
        cefrLevel: reading.text.cefrLevel,
        signal: controller.signal,
      });
      if (epoch === analysisEpoch.current) setGrammarResult(result);
    } catch (error) {
      if (epoch === analysisEpoch.current) setAnalysisError(actionMessage(error));
    } finally {
      if (active.current === controller) active.current = null;
      if (analysisController.current === controller) analysisController.current = null;
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
      if (route.screen === 'library') libraryScroll.current = window.scrollY;
      navigate('reader', result.text.id, undefined, route.screen === 'reader');
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
      setReading((current) =>
        current?.session.id === sessionId && current.session.status !== 'Completed'
          ? { ...current, session: { ...current.session, readingPosition: position } }
          : current,
      );
      void readingActions
        .savePosition(sessionId, position)
        .catch((error: unknown) => setError(actionMessage(error)));
    },
    [readingActions, sessionId],
  );

  const continuation =
    reading && reading.session.status !== 'Completed'
      ? reading
      : history
          .flatMap(({ text, sessions }) =>
            sessions
              .filter((session) => session.status !== 'Completed')
              .map((session) => ({ text, session })),
          )
          .sort(
            (a, b) =>
              Date.parse(b.session.startedAt ?? b.text.createdAt) -
              Date.parse(a.session.startedAt ?? a.text.createdAt),
          )[0];
  const disabled = busy || analysisBusy || undoBusy || localBusy || !ready;
  const sentenceId = wordTarget?.sentenceId ?? grammarTarget;
  const sentence = reading?.text.sentences.find((item) => item.id === sentenceId)?.content ?? '';
  const analysisTokens = wordResult?.totalTokens ?? grammarResult?.totalTokens;
  return (
    <main>
      <header className={`app-header ${route.screen === 'reader' ? 'reader-header' : ''}`}>
        {route.screen === 'reader' ? (
          <>
            <button
              className="secondary"
              onClick={() => {
                if (route.panel) dismissPanel(route.screen, route.textId);
                else if (window.history.state?.vibeReader) window.history.back();
                else navigate('library', undefined, undefined, true);
              }}
            >
              ← Библиотека
            </button>
            <div className="reader-actions">
              <button
                className="secondary"
                aria-label="Вид текста"
                onClick={() => navigate('reader', route.textId, 'appearance')}
              >
                Aa
              </button>
              <button
                className="secondary"
                aria-label="Как читать"
                onClick={() => {
                  changeAppearance({ ...appearance, hintSeen: true });
                  navigate('reader', route.textId, 'help');
                }}
              >
                ?
              </button>
            </div>
          </>
        ) : (
          <span className="brand">
            vibe<span>·</span>
          </span>
        )}
      </header>
      {route.screen !== 'reader' && (
        <h1>
          {route.screen === 'library'
            ? 'Ваша библиотека'
            : route.screen === 'vocabulary'
              ? 'Личный словарь'
              : 'Настройки'}
        </h1>
      )}
      {!ready && <p role="status">Открываем сохранённые тексты…</p>}
      {error && route.panel !== 'generation' && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div hidden={route.screen !== 'library'}>
        <p className="hint">Истории для вашего следующего маленького шага.</p>
        <button
          disabled={!ready || disabled}
          onClick={() => {
            if (!settings.load().apiKey) navigate('settings');
            else navigate('library', undefined, 'generation');
          }}
        >
          ＋ Новый текст
        </button>
        {!settings.load().apiKey && (
          <p className="hint">
            Сохраните ключ в настройках, чтобы создавать тексты. Сохранённые истории доступны без
            ключа.
          </p>
        )}
        {continuation && (
          <section className="continue-card">
            <p className="eyebrow">ПРОДОЛЖИТЬ ЧТЕНИЕ</p>
            <h2 lang="de">{continuation.text.title}</h2>
            <p className="hint">
              {continuation.text.cefrLevel} · {continuation.text.targetDuration} мин
            </p>
            <button disabled={disabled} onClick={() => void openReading(continuation.text.id)}>
              Продолжить
            </button>
          </section>
        )}
        <HistoryList entries={history} disabled={disabled} onOpen={(id) => void openReading(id)} />
      </div>
      {route.panel === 'generation' && (
        <Modal
          label="Новый текст"
          onClose={() => {
            active.current?.abort();
            dismissPanel(route.screen, route.textId);
          }}
        >
          <GenerationPanel
            level={generationChoice?.level ?? preferences?.cefrLevel ?? 'A1'}
            duration={generationChoice?.duration ?? preferences?.targetDuration ?? 3}
            busy={busy}
            disabled={disabled}
            onChange={(level, duration) => setGenerationChoice({ level, duration })}
            onGenerate={(level, duration) => void generate(level, duration)}
            onCancel={() => active.current?.abort()}
          />
          {busy && <p role="status">Ожидаем текст от OpenAI…</p>}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </Modal>
      )}
      {route.screen === 'reader' && pending.length > 0 && (
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
      {route.screen === 'reader' && reading && route.textId === reading.text.id && (
        <Reader
          key={reading.session.id}
          text={reading.text}
          session={reading.session}
          disabled={disabled}
          appearance={appearance}
          selectedWord={wordTarget}
          selectedSentenceId={grammarTarget}
          onWord={(selection) => {
            if (!appearance.hintSeen) changeAppearance({ ...appearance, hintSeen: true });
            void lookup(selection);
          }}
          onGrammar={(id) => {
            if (!appearance.hintSeen) changeAppearance({ ...appearance, hintSeen: true });
            void explain(id);
          }}
          onPosition={savePosition}
          onComplete={() => void finishReading()}
          onStart={() => void openReading(reading.text.id, true)}
        />
      )}
      {totalTokens !== undefined && route.screen === 'reader' && (
        <details>
          <summary>Детали генерации</summary>
          <p className="hint">Токенов использовано: {totalTokens}</p>
        </details>
      )}
      {route.screen === 'reader' && route.panel === 'analysis' && (wordTarget || grammarTarget) && (
        <FloatingSheet
          gestureOnly={!!wordTarget}
          className={wordTarget ? 'word-sheet' : undefined}
          expanded={expanded}
          onExpand={() => setExpanded((value) => !value)}
          onClose={closeAnalysis}
          selection={
            wordTarget
              ? `[data-sentence-id="${CSS.escape(wordTarget.sentenceId)}"] [data-word-start="${wordTarget.start}"]`
              : `[data-sentence-id="${CSS.escape(grammarTarget ?? '')}"]`
          }
        >
          {wordTarget && (
            <VocabularyCard
              expanded={expanded}
              sentence={sentence}
              surface={wordTarget.surfaceForm}
              result={wordResult}
              busy={analysisBusy || undoBusy}
              onUndo={() => {
                if (wordResult) void undo(wordResult.lookup.id);
              }}
            />
          )}
          {grammarTarget && (
            <GrammarCard
              expanded={expanded}
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
          {expanded && analysisTokens !== undefined && (
            <details>
              <summary>Детали запроса</summary>
              <p className="hint">Токенов использовано: {analysisTokens}</p>
              <p className="hint">
                {wordResult?.cached || grammarResult?.cached
                  ? 'Сохранённый результат'
                  : 'Новый результат'}
              </p>
            </details>
          )}
        </FloatingSheet>
      )}
      {route.panel === 'appearance' && (
        <Modal label="Вид текста" onClose={() => dismissPanel(route.screen, route.textId)}>
          <ReaderAppearance value={appearance} onChange={changeAppearance} />
        </Modal>
      )}
      {route.panel === 'help' && (
        <Modal label="Как читать" onClose={() => dismissPanel(route.screen, route.textId)}>
          <h2>Как читать</h2>
          <p>
            Нажмите слово для перевода. Удерживайте слово около полусекунды для разбора предложения.
          </p>
          <p>
            Кнопка «Разобрать предложение» позволяет выбрать предложение без жеста. Успешный перевод
            отмечает слово как незнакомое; отметку можно отменить в карточке. Закрытие карточки
            сохраняет отметку.
          </p>
          <p>
            Полоска показывает позицию в тексте. Для сохранения результата нажмите «Завершить
            чтение».
          </p>
        </Modal>
      )}
      {route.screen === 'vocabulary' && (
        <VocabularyList entries={vocabulary} loadHistory={readingActions.wordHistory} />
      )}
      {route.screen === 'settings' && (
        <>
          <SettingsPage settings={settings} />
          <ReaderAppearance value={appearance} onChange={changeAppearance} />
          <BackupPanel backups={backups} disabled={disabled} onRestore={restoreData} />
        </>
      )}
      {route.screen !== 'reader' && (
        <nav className="bottom-nav" aria-label="Основная навигация">
          {(
            [
              ['library', '▤', 'Библиотека'],
              ['vocabulary', 'Аа', 'Словарь'],
              ['settings', '⚙', 'Настройки'],
            ] as const
          ).map(([screen, icon, label]) => (
            <button
              className="secondary"
              key={screen}
              aria-current={route.screen === screen ? 'page' : undefined}
              onClick={() => {
                if (route.screen === 'library') libraryScroll.current = window.scrollY;
                navigate(screen);
              }}
            >
              <span className="nav-icon" aria-hidden="true">
                {icon}
              </span>
              <span className="nav-label">{label}</span>
            </button>
          ))}
        </nav>
      )}
    </main>
  );

  function lookupWordAgain(pending: WordLookup) {
    return lookup(pending.selection, pending.id);
  }
}
