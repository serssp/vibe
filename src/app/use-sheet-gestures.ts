import { useEffect, useRef, type RefObject } from 'react';

export function useSheetGestures(
  sheet: RefObject<HTMLElement | null>,
  enabled: boolean,
  expanded: boolean,
  onExpand: () => void,
  onClose: () => void,
) {
  const actions = useRef({ expanded, onExpand, onClose });
  useEffect(() => {
    actions.current = { expanded, onExpand, onClose };
  }, [expanded, onExpand, onClose]);
  useEffect(() => {
    const element = sheet.current;
    if (!enabled || !element) return;
    let drag: {
      x: number;
      y: number;
      id: number;
      source: 'touch' | 'pointer';
      handle: boolean;
      vertical: boolean;
      moved: boolean;
    } | null = null;
    let suppressUntil = 0;
    const reset = () => {
      if (drag?.moved) suppressUntil = Date.now() + 500;
      drag = null;
      element.classList.remove('is-dragging');
      element.style.removeProperty('--sheet-drag-y');
    };
    const start = (
      target: EventTarget | null,
      x: number,
      y: number,
      id: number,
      source: 'touch' | 'pointer',
    ) => {
      reset();
      suppressUntil = 0;
      if (!(target instanceof Element)) return;
      const handle = !!target.closest('.sheet-handle');
      if (!handle && target.closest('button, a, input, textarea, select, summary')) return;
      drag = { x, y, id, source, handle, vertical: false, moved: false };
    };
    const move = (x: number, y: number, preventDefault: () => void) => {
      if (!drag) return;
      const dx = x - drag.x;
      const dy = y - drag.y;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 8) return;
      drag.moved = true;
      if (!drag.vertical) {
        if (Math.abs(dx) >= Math.abs(dy)) {
          reset();
          return;
        }
        const scrolls =
          dy < 0
            ? actions.current.expanded || element.scrollHeight > element.clientHeight + 1
            : element.scrollTop > 0;
        if (!drag.handle && scrolls) {
          reset();
          return;
        }
        drag.vertical = true;
      }
      preventDefault();
      element.classList.add('is-dragging');
      const offset = dy > 0 ? Math.min(dy, 240) : Math.max(dy * 0.35, -64);
      element.style.setProperty('--sheet-drag-y', `${offset}px`);
    };
    const finish = (x: number, y: number) => {
      move(x, y, () => {});
      const current = drag;
      reset();
      if (!current?.vertical) return;
      const dx = x - current.x;
      const dy = y - current.y;
      if (Math.abs(dy) < 56 || Math.abs(dy) <= Math.abs(dx) * 1.25) return;
      if (dy > 0) actions.current.onClose();
      else if (!actions.current.expanded) actions.current.onExpand();
    };
    const pointerStart = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      if (!event.isPrimary || event.button !== 0) {
        reset();
        return;
      }
      start(event.target, event.clientX, event.clientY, event.pointerId, 'pointer');
      if (drag) {
        const handle =
          event.target instanceof Element
            ? event.target.closest<HTMLElement>('.sheet-handle')
            : null;
        (handle ?? element).setPointerCapture(event.pointerId);
      }
    };
    const pointerMove = (event: PointerEvent) => {
      if (drag?.source === 'pointer' && drag.id === event.pointerId)
        move(event.clientX, event.clientY, () => event.preventDefault());
    };
    const pointerEnd = (event: PointerEvent) => {
      if (drag?.source === 'pointer' && drag.id === event.pointerId)
        finish(event.clientX, event.clientY);
    };
    const pointerCancel = () => {
      if (drag?.source === 'pointer') reset();
    };
    const touchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) {
        reset();
        return;
      }
      const touch = event.touches[0]!;
      start(event.target, touch.clientX, touch.clientY, touch.identifier, 'touch');
    };
    const touchMove = (event: TouchEvent) => {
      if (event.touches.length !== 1) {
        reset();
        return;
      }
      const touch = event.touches[0]!;
      if (drag?.source === 'touch' && drag.id === touch.identifier)
        move(touch.clientX, touch.clientY, () => event.preventDefault());
    };
    const touchEnd = (event: TouchEvent) => {
      if (event.touches.length) {
        reset();
        return;
      }
      const touch = [...event.changedTouches].find((item) => item.identifier === drag?.id);
      if (drag?.source === 'touch' && touch) finish(touch.clientX, touch.clientY);
    };
    const click = (event: MouseEvent) => {
      if (Date.now() < suppressUntil) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    element.addEventListener('pointerdown', pointerStart);
    element.addEventListener('pointermove', pointerMove);
    element.addEventListener('pointerup', pointerEnd);
    element.addEventListener('pointercancel', pointerCancel);
    element.addEventListener('lostpointercapture', pointerCancel);
    element.addEventListener('touchstart', touchStart, { passive: true });
    element.addEventListener('touchmove', touchMove, { passive: false });
    element.addEventListener('touchend', touchEnd);
    element.addEventListener('touchcancel', reset);
    element.addEventListener('click', click, true);
    window.addEventListener('blur', reset);
    return () => {
      reset();
      element.removeEventListener('pointerdown', pointerStart);
      element.removeEventListener('pointermove', pointerMove);
      element.removeEventListener('pointerup', pointerEnd);
      element.removeEventListener('pointercancel', pointerCancel);
      element.removeEventListener('lostpointercapture', pointerCancel);
      element.removeEventListener('touchstart', touchStart);
      element.removeEventListener('touchmove', touchMove);
      element.removeEventListener('touchend', touchEnd);
      element.removeEventListener('touchcancel', reset);
      element.removeEventListener('click', click, true);
      window.removeEventListener('blur', reset);
    };
  }, [enabled, sheet]);
}
