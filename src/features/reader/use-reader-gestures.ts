import { useEffect, useRef, type PointerEvent } from 'react';
import type { WordSelection } from '../../domain/vocabulary/lookups';

export function useReaderGestures(
  onWord: (selection: WordSelection) => void,
  onGrammar: (sentenceId: string) => void,
  disabled: boolean,
) {
  const current = useRef<{
    id: number;
    x: number;
    y: number;
    started: number;
    selection: WordSelection;
    long: boolean;
    timer: ReturnType<typeof setTimeout>;
  } | null>(null);
  const actions = useRef({ onWord, onGrammar, disabled });
  const suppressClick = useRef(false);
  const pressed = useRef(false);
  useEffect(() => {
    actions.current = { onWord, onGrammar, disabled };
  }, [onWord, onGrammar, disabled]);

  function cancel() {
    if (current.current || pressed.current) suppressClick.current = true;
    if (current.current) clearTimeout(current.current.timer);
    current.current = null;
  }

  useEffect(() => {
    const stop = () => {
      if (current.current || pressed.current) suppressClick.current = true;
      if (current.current) clearTimeout(current.current.timer);
      current.current = null;
    };
    const begin = (event: globalThis.PointerEvent) => {
      if (!event.isPrimary) {
        stop();
        return;
      }
      suppressClick.current = false;
    };
    const release = () => {
      pressed.current = false;
    };
    const cancelPointer = () => {
      stop();
      release();
    };
    const click = (event: MouseEvent) => {
      if (event.detail > 0 && suppressClick.current) {
        event.preventDefault();
        event.stopImmediatePropagation();
        suppressClick.current = false;
      }
    };
    window.addEventListener('pointerdown', begin, true);
    window.addEventListener('pointerup', release, true);
    window.addEventListener('pointercancel', cancelPointer, true);
    window.addEventListener('click', click, true);
    window.addEventListener('scroll', stop, { capture: true, passive: true });
    window.addEventListener('blur', stop);
    return () => {
      stop();
      window.removeEventListener('scroll', stop, true);
      window.removeEventListener('blur', stop);
      window.removeEventListener('pointerdown', begin, true);
      window.removeEventListener('pointerup', release, true);
      window.removeEventListener('pointercancel', cancelPointer, true);
      window.removeEventListener('click', click, true);
    };
  }, []);

  return {
    cancel,
    begin(event: PointerEvent<HTMLElement>) {
      if (!event.isPrimary) {
        cancel();
        return;
      }
      suppressClick.current = false;
      pressed.current = true;
    },
    down(event: PointerEvent<HTMLElement>, selection: WordSelection) {
      cancel();
      if (!event.isPrimary || event.button !== 0 || actions.current.disabled) return;
      const timer = setTimeout(() => {
        const attempt = current.current;
        if (!attempt || actions.current.disabled) return;
        attempt.long = true;
        actions.current.onGrammar(attempt.selection.sentenceId);
      }, 500);
      current.current = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        started: performance.now(),
        selection,
        long: false,
        timer,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    move(event: PointerEvent<HTMLElement>) {
      const attempt = current.current;
      if (
        attempt &&
        (event.pointerId !== attempt.id ||
          Math.hypot(event.clientX - attempt.x, event.clientY - attempt.y) > 8)
      )
        cancel();
    },
    up(event: PointerEvent<HTMLElement>) {
      const attempt = current.current;
      if (!attempt || event.pointerId !== attempt.id) return;
      cancel();
      if (attempt.long || actions.current.disabled) return;
      if (performance.now() - attempt.started >= 500)
        actions.current.onGrammar(attempt.selection.sentenceId);
      else actions.current.onWord(attempt.selection);
    },
  };
}
