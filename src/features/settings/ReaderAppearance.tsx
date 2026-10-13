import type { ReaderAppearance as Appearance } from '../../domain/settings/reader-appearance';

export function ReaderAppearance({
  value,
  onChange,
}: {
  value: Appearance;
  onChange(value: Appearance): void;
}) {
  return (
    <section aria-labelledby="appearance-heading">
      <h2 id="appearance-heading">Вид текста</h2>
      <fieldset>
        <legend>Шрифт</legend>
        <div className="segments">
          {(['serif', 'sans'] as const).map((family) => (
            <label key={family}>
              <input
                type="radio"
                name="family"
                checked={value.family === family}
                onChange={() => onChange({ ...value, family })}
              />
              <span>{family === 'serif' ? 'С засечками' : 'Без засечек'}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <label>
        Размер текста{' '}
        <input
          aria-label="Размер текста"
          type="range"
          min="1"
          max="2"
          step="0.05"
          value={value.size}
          onChange={(event) => onChange({ ...value, size: Number(event.target.value) })}
        />
      </label>
      <label>
        Межстрочный интервал{' '}
        <input
          aria-label="Межстрочный интервал"
          type="range"
          min="1.4"
          max="2.4"
          step="0.1"
          value={value.lineHeight}
          onChange={(event) => onChange({ ...value, lineHeight: Number(event.target.value) })}
        />
      </label>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={value.sentencePerLine}
          onChange={(event) => onChange({ ...value, sentencePerLine: event.target.checked })}
        />
        Каждое предложение с новой строки
      </label>
    </section>
  );
}
