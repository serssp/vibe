import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReadingSession } from '../../domain/reading/models';

function visibleTop() {
  return document.querySelector('.reader-header')?.getBoundingClientRect().height ?? 0;
}

export function useReadingPosition(
  session: ReadingSession,
  onSave: (position: ReadingSession['readingPosition']) => void,
  appearance: string,
) {
  const [progress, setProgress] = useState(0);
  const article = useRef<HTMLElement>(null);
  const saved = useRef(session.readingPosition);
  useLayoutEffect(() => {
    const initial = [
      ...(article.current?.querySelectorAll<HTMLElement>('[data-sentence-id]') ?? []),
    ].find((sentence) => sentence.dataset.sentenceId === saved.current.sentenceId);
    if (initial)
      window.scrollTo(
        0,
        Math.max(
          0,
          window.scrollY +
            initial.getBoundingClientRect().top -
            visibleTop() +
            Math.min(
              saved.current.scrollOffset,
              Math.max(0, initial.getBoundingClientRect().height - 2),
            ),
        ),
      );
  }, [appearance]);
  useEffect(() => {
    const element = article.current;
    if (!element) return;
    const sentences = [...element.querySelectorAll<HTMLElement>('[data-sentence-id]')];
    const initial = sentences.find(
      (sentence) => sentence.dataset.sentenceId === saved.current.sentenceId,
    );
    if (initial)
      window.scrollTo(
        0,
        Math.max(
          0,
          window.scrollY +
            initial.getBoundingClientRect().top -
            visibleTop() +
            saved.current.scrollOffset,
        ),
      );
    let timer: ReturnType<typeof setTimeout> | undefined;
    let dirty = false;
    const capture = () => {
      const sentence =
        sentences.find((item) => item.getBoundingClientRect().bottom > visibleTop() + 1) ??
        sentences.at(-1);
      if (!sentence) return;
      saved.current = {
        sentenceId: sentence.dataset.sentenceId!,
        scrollOffset: Math.max(0, visibleTop() - sentence.getBoundingClientRect().top),
      };
      const bounds = element.getBoundingClientRect();
      setProgress(
        Math.max(
          0,
          Math.min(100, ((window.innerHeight - bounds.top) / Math.max(1, bounds.height)) * 100),
        ),
      );
      dirty = true;
    };
    const flush = () => {
      clearTimeout(timer);
      if (dirty) {
        dirty = false;
        if (session.status !== 'Completed') onSave(saved.current);
      }
    };
    const scroll = () => {
      capture();
      clearTimeout(timer);
      timer = setTimeout(flush, 300);
    };
    const visibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    scroll();
    window.addEventListener('scroll', scroll, { passive: true });
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      window.removeEventListener('scroll', scroll);
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', visibility);
      flush();
    };
  }, [session.id, session.status, onSave]);
  return { article, progress };
}
