import { useEffect, useRef } from 'react';
import type { ReadingSession } from '../../domain/reading/models';

export function useReadingPosition(
  session: ReadingSession,
  onSave: (position: ReadingSession['readingPosition']) => void,
) {
  const article = useRef<HTMLElement>(null);
  const saved = useRef(session.readingPosition);
  useEffect(() => {
    const element = article.current;
    if (!element || session.status === 'Completed') return;
    const sentences = [...element.querySelectorAll<HTMLElement>('[data-sentence-id]')];
    const initial = sentences.find(
      (sentence) => sentence.dataset.sentenceId === saved.current.sentenceId,
    );
    if (initial)
      window.scrollTo(
        0,
        Math.max(
          0,
          window.scrollY + initial.getBoundingClientRect().top + saved.current.scrollOffset,
        ),
      );
    let timer: ReturnType<typeof setTimeout> | undefined;
    let dirty = false;
    const capture = () => {
      const sentence =
        sentences.find((item) => item.getBoundingClientRect().bottom > 0) ?? sentences.at(-1);
      if (!sentence) return;
      saved.current = {
        sentenceId: sentence.dataset.sentenceId!,
        scrollOffset: Math.max(0, -sentence.getBoundingClientRect().top),
      };
      dirty = true;
    };
    const flush = () => {
      clearTimeout(timer);
      if (dirty) {
        dirty = false;
        onSave(saved.current);
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
  return article;
}
