import { useState } from 'react';
import type { CefrLevel, TargetDuration } from '../../domain/reading/models';

export function GenerationPanel({
  level,
  duration,
  busy,
  disabled,
  onGenerate,
  onCancel,
}: {
  level: CefrLevel;
  duration: TargetDuration;
  busy: boolean;
  disabled: boolean;
  onGenerate(level: CefrLevel, duration: TargetDuration): void;
  onCancel(): void;
}) {
  const [cefrLevel, setLevel] = useState(level);
  const [targetDuration, setDuration] = useState(duration);
  return (
    <section aria-labelledby="generation-heading">
      <h2 id="generation-heading">Новый текст</h2>
      <div className="generation-options">
        <label>
          Уровень
          <select
            aria-label="Уровень"
            value={cefrLevel}
            disabled={disabled}
            onChange={(event) => setLevel(event.target.value as CefrLevel)}
          >
            {['A1', 'A2', 'B1'].map((level) => (
              <option key={level}>{level}</option>
            ))}
          </select>
        </label>
        <label>
          Время чтения
          <select
            aria-label="Время чтения"
            value={targetDuration}
            disabled={disabled}
            onChange={(event) => setDuration(Number(event.target.value) as TargetDuration)}
          >
            {[3, 4, 5].map((duration) => (
              <option key={duration} value={duration}>
                {duration} мин
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="actions">
        <button disabled={disabled} onClick={() => onGenerate(cefrLevel, targetDuration)}>
          {busy ? 'Создаём текст…' : 'Сгенерировать текст'}
        </button>
        {busy && (
          <button className="secondary" onClick={onCancel}>
            Отменить генерацию
          </button>
        )}
      </div>
      <p className="hint">
        Текст сохранится в этом браузере. Для генерации нужны сохранённые настройки OpenAI.
      </p>
    </section>
  );
}
