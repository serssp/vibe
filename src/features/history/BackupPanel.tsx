import { useState } from 'react';
import type { BackupActions } from '../../application/use-cases/backup';
import type { LearningSnapshot } from '../../domain/learning/data';
import { actionMessage } from '../../application/errors';

export function BackupPanel({
  backups,
  disabled,
  onRestore,
}: {
  backups: BackupActions;
  disabled: boolean;
  onRestore(data: LearningSnapshot): Promise<void>;
}) {
  const [preview, setPreview] = useState<LearningSnapshot>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  async function exportData() {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const content = await backups.exportData();
      const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `vibe-backup-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage('Резервная копия сохранена.');
    } catch (error) {
      setError(actionMessage(error));
    } finally {
      setBusy(false);
    }
  }
  async function select(file: File) {
    setBusy(true);
    setPreview(undefined);
    setError('');
    setMessage('');
    try {
      setPreview(backups.preview(await file.text()));
    } catch (error) {
      setError(actionMessage(error));
    } finally {
      setBusy(false);
    }
  }
  async function restore() {
    if (!preview || disabled || busy) return;
    setBusy(true);
    setError('');
    try {
      await onRestore(preview);
      setPreview(undefined);
      setMessage('Данные восстановлены.');
    } catch (error) {
      setError(actionMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="backup-panel">
      <summary>Резервная копия</summary>
      <p>Сохраните тексты, словарь и историю чтений в файл.</p>
      <button disabled={disabled || busy} onClick={() => void exportData()}>
        Экспортировать данные
      </button>
      <label htmlFor="backup-file">Импортировать резервную копию</label>
      <input
        id="backup-file"
        type="file"
        accept=".json,application/json"
        disabled={disabled || busy}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void select(file);
          event.target.value = '';
        }}
      />
      {preview && (
        <div role="group" aria-label="Подтверждение восстановления" className="result">
          <p>
            В файле: текстов — {preview.texts.length}, чтений — {preview.sessions.length}, слов —{' '}
            {preview.vocabulary.length}.
          </p>
          <p>
            Восстановление заменит все текущие учебные данные. Сначала экспортируйте их, если хотите
            сохранить. API key остаётся в настройках.
          </p>
          <div className="actions">
            <button disabled={disabled || busy} onClick={() => void restore()}>
              Заменить данные и восстановить
            </button>
            <button className="secondary" disabled={busy} onClick={() => setPreview(undefined)}>
              Отменить импорт
            </button>
          </div>
        </div>
      )}
      {busy && <p role="status">Обрабатываем резервную копию…</p>}
      {message && <p role="status">{message}</p>}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </details>
  );
}
