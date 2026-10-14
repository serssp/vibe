import { useEffect, useRef, type ReactNode } from 'react';

export function FloatingSheet({
  children,
  expanded,
  onExpand,
  onClose,
  selection,
  className = '',
}: {
  children: ReactNode;
  expanded: boolean;
  onExpand(): void;
  onClose(): void;
  selection: string;
  className?: string;
}) {
  const sheet = useRef<HTMLElement>(null);
  const dragged = useRef(false);
  const drag = useRef<{ y: number; id: number } | null>(null);
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
          aria-label="Закрыть панель жестом вниз"
          onClick={() => {
            if (dragged.current) {
              dragged.current = false;
              return;
            }
            onClose();
          }}
          onPointerDown={(event) => {
            dragged.current = false;
            if (event.isPrimary) {
              drag.current = { y: event.clientY, id: event.pointerId };
              event.currentTarget.setPointerCapture(event.pointerId);
            }
          }}
          onPointerUp={(event) => {
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
        <button className="secondary" aria-expanded={expanded} onClick={onExpand}>
          {expanded ? 'Свернуть' : 'Подробнее'}
        </button>
        <button className="secondary" aria-label="Закрыть панель" onClick={onClose}>
          ×
        </button>
      </div>
      {children}
    </aside>
  );
}
