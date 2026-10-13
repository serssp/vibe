import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it, vi } from 'vitest';
import { createGenerationActions } from '../src/application/use-cases/generate-text';
import { IndexedDbLearningRepository } from '../src/infrastructure/storage/indexeddb-learning';
import { mockProvider } from './fixtures/provider';

function setup() {
  const factory = new IDBFactory();
  const repository = new IndexedDbLearningRepository({ getFactory: () => factory });
  const provider = mockProvider();
  let next = 0;
  const actions = createGenerationActions(provider, repository, {
    id: () => `id-${++next}`,
    now: () => '2026-10-13T10:00:00.000Z',
  });
  const request = {
    apiKey: 'test-credential',
    model: 'test-model',
    cefrLevel: 'A1' as const,
    targetDuration: 3 as const,
    signal: new AbortController().signal,
  };
  return { actions, provider, repository, request };
}

describe('Text generation', () => {
  it('saves text/session atomically, restores stable sentences without an AI request, and saves preferences', async () => {
    const { actions, provider, repository, request } = setup();
    const result = await actions.generate(request);
    expect(result.text.content).toBe('Ich ging nach Hause. Heute gehe ich spazieren.');
    expect(result.text.sentences.map((s) => s.id)).toEqual(['id-1:1', 'id-1:2']);
    await repository.close();
    expect(await actions.restore()).toEqual({ text: result.text, session: result.session });
    expect(provider.generate).toHaveBeenCalledTimes(1);
    expect(await actions.preferences()).toMatchObject({ cefrLevel: 'A1', targetDuration: 3 });
    await repository.close();
  });
  it('retains the previous saved text when AI fails or returns invalid data', async () => {
    const { actions, provider, repository, request } = setup();
    const first = await actions.generate(request);
    vi.mocked(provider.generate).mockRejectedValueOnce(new Error('network'));
    await expect(actions.generate(request)).rejects.toThrow();
    vi.mocked(provider.generate).mockResolvedValueOnce({ title: 'bad', sentences: [] });
    await expect(actions.generate(request)).rejects.toThrow('некорректный текст');
    expect((await actions.restore())?.text).toEqual(first.text);
    await repository.close();
  });
  it('prevents concurrent generations and does not save a cancelled result', async () => {
    const { actions, provider, repository, request } = setup();
    let finish!: (value: Awaited<ReturnType<typeof provider.generate>>) => void;
    vi.mocked(provider.generate).mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const controller = new AbortController();
    const pending = actions.generate({ ...request, signal: controller.signal });
    await expect(actions.generate(request)).rejects.toThrow('уже выполняется');
    await vi.waitFor(() => expect(finish).toBeDefined());
    controller.abort();
    finish({ title: 'cancelled', sentences: ['Hallo!'] });
    await expect(pending).rejects.toThrow('отменена');
    expect(await actions.restore()).toBeUndefined();
    await repository.close();
  });
  it('passes recent topics and keeps review lists empty until stage 6', async () => {
    const { actions, provider, repository, request } = setup();
    await actions.generate(request);
    await actions.generate(request);
    expect(provider.generate).toHaveBeenLastCalledWith(
      expect.objectContaining({ recentTopics: ['Der Weg'], reviewVocabulary: [] }),
    );
    await repository.close();
  });
  it('preserves stored typography preferences on subsequent generations', async () => {
    const { actions, repository, request } = setup();
    await repository.commit({
      appSettings: {
        id: 'app',
        cefrLevel: 'A1',
        targetDuration: 3,
        model: 'test-model',
        ui: { fontScale: 1.4 },
      },
    });
    await actions.generate(request);
    expect((await actions.preferences())?.ui.fontScale).toBe(1.4);
    await repository.close();
  });
});
