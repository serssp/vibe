import type { CefrLevel, TargetDuration } from '../../domain/reading/models';

export function GenerationPanel({
  level,
  duration,
  busy,
  disabled,
  onGenerate,
  onCancel,
  onChange,
}: {
  level: CefrLevel;
  duration: TargetDuration;
  busy: boolean;
  disabled: boolean;
  onGenerate(level: CefrLevel, duration: TargetDuration): void;
  onCancel(): void;
  onChange(level: CefrLevel, duration: TargetDuration): void;
}) {
  return (
    <section aria-labelledby="generation-heading">
      <h2 id="generation-heading">Новый текст</h2>
      <div className="generation-options">
        <fieldset disabled={disabled}>
          <legend>Уровень</legend>
          <div className="segments">
            {(['A1', 'A2', 'B1'] as const).map((choice) => (
              <label key={choice}>
                <input
                  type="radio"
                  name="level"
                  value={choice}
                  checked={level === choice}
                  onChange={() => onChange(choice, duration)}
                />
                <span>{choice}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset disabled={disabled}>
          <legend>Время чтения</legend>
          <div className="segments">
            {([3, 4, 5] as const).map((choice) => (
              <label key={choice}>
                <input
                  type="radio"
                  name="duration"
                  value={choice}
                  checked={duration === choice}
                  onChange={() => onChange(level, choice)}
                />
                <span>{choice} мин</span>
              </label>
            ))}
          </div>
        </fieldset>
      </div>
      <div className="actions">
        <button disabled={disabled} onClick={() => onGenerate(level, duration)}>
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
