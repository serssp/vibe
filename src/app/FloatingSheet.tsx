import { useEffect, useRef, type ReactNode } from 'react';
import { useSheetGestures } from './use-sheet-gestures';

export function FloatingSheet({
  children,
  expanded,
  onExpand,
  onClose,
  selection,
  className = '',
  gestureOnly = false,
}: {
  children: ReactNode;
  expanded: boolean;
  onExpand(): void;
  onClose(): void;
  selection: string;
  className?: string;
  gestureOnly?: boolean;
}) {
  const sheet = useRef<HTMLElement>(null);
  const dragged = useRef(false);
  const drag = useRef<{ y: number; id: number } | null>(null);
  useSheetGestures(sheet, gestureOnly, expanded, onExpand, onClose);
  useEffect(() => {
    const element = sheet.current;
    if (!element) return;
    const reveal = () => {
      const panel = element.getBoundingClientRect();
      document.documentElement.style.setProperty('--sheet-space', `${panel.height + 32}px`);
      const selected = document.querySelector<HTMLElement>(selection);
      if (!selected) return;
      const bounds = selected.getBoundingClientRect();
      const top =
        (document.querySelector('.reader-header')?.getBoundingClientRect().bottom ?? 0) + 16;
      const limit = panel.top - 20;
      if (bounds.bottom > limit)
        window.scrollBy(0, bounds.height > limit - top ? bounds.top - top : bounds.bottom - limit);
      else if (bounds.top < top) window.scrollBy(0, bounds.top - top);
    };
    const observer = new ResizeObserver(reveal);
    observer.observe(element);
    window.addEventListener('resize', reveal);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', reveal);
      document.documentElement.style.removeProperty('--sheet-space');
    };
  }, [selection]);
  return (
    <aside
      ref={sheet}
      className={`analysis-panel ${expanded ? 'expanded' : ''} ${className}`}
      aria-label="Карточка обучения"
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          onClose();
        }
      }}
    >
      <div className="sheet-controls">
        <button
          className="sheet-handle secondary"
          aria-label={gestureOnly ? 'Управление карточкой' : 'Закрыть панель жестом вниз'}
          aria-expanded={gestureOnly ? expanded : undefined}
          aria-describedby={gestureOnly ? 'sheet-gesture-hint' : undefined}
          onKeyDown={(event) => {
            if (!gestureOnly) return;
            if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
              event.preventDefault();
              if (event.key === 'ArrowUp') {
                if (!expanded) onExpand();
              } else if (expanded) onExpand();
              else onClose();
            }
          }}
          onClick={() => {
            if (gestureOnly) {
              onExpand();
              return;
            }
            if (dragged.current) {
              dragged.current = false;
              return;
            }
            onClose();
          }}
          onPointerDown={(event) => {
            if (gestureOnly) return;
            dragged.current = false;
            if (event.isPrimary) {
              drag.current = { y: event.clientY, id: event.pointerId };
              event.currentTarget.setPointerCapture(event.pointerId);
            }
          }}
          onPointerUp={(event) => {
            if (gestureOnly) return;
            const start = drag.current;
            drag.current = null;
            if (start && start.id === event.pointerId && event.clientY - start.y > 60) {
              dragged.current = true;
              onClose();
            }
          }}
          onPointerCancel={() => {
            drag.current = null;
          }}
        >
          <span />
        </button>
        {!gestureOnly && (
          <button className="secondary" aria-expanded={expanded} onClick={onExpand}>
            {expanded ? 'Свернуть' : 'Подробнее'}
          </button>
        )}
        {!gestureOnly && (
          <button className="secondary" aria-label="Закрыть панель" onClick={onClose}>
            ×
          </button>
        )}
      </div>
      {gestureOnly && (
        <p className="sheet-gesture-hint" id="sheet-gesture-hint">
          ↑ Подробнее · ↓ Закрыть
        </p>
      )}
      {children}
    </aside>
  );
}
