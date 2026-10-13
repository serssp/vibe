import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const server = spawn(
  process.execPath,
  [
    'node_modules/vite/bin/vite.js',
    'preview',
    '--host',
    '127.0.0.1',
    '--port',
    '4173',
    '--strictPort',
  ],
  { stdio: 'ignore' },
);
let browser;
try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      ready = (await fetch('http://127.0.0.1:4173/vibe/')).ok;
      if (ready) break;
    } catch {}
    await delay(250);
  }
  assert(ready, 'Learning preview server did not start');
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.name));
  const requests = { generation: 0, word: 0, grammar: 0, connection: 0 };
  const modes = { generation: 'success', word: 'success', grammar: 'success' };
  const grammarSentences = [];
  let release;
  let slow;
  const sentenceList = [
    'Ich ging nach Hause.',
    'Heute gehe ich spazieren.',
    'Die Bank steht im Park.',
    'Die Bank ist geschlossen.',
    'Er steht früh auf.',
    ...Array.from({ length: 18 }, () => 'Die Freunde gehen zusammen durch den schönen Park.'),
    'Ein Schild zeigt „<img src=x onerror=alert(1)>“.',
  ];
  await page.route('https://api.openai.com/v1/responses', async (route) => {
    const payload = route.request().postDataJSON();
    assert.equal(route.request().headers().authorization, 'Bearer test-credential');
    assert.equal(payload.store, false);
    assert(!JSON.stringify(payload).includes('test-credential'));
    const kind = payload.text?.format?.name?.replace('vibe_', '') ?? 'connection';
    requests[kind]++;
    const mode = modes[kind];
    if (mode === 'network') return route.abort('internetdisconnected');
    if (mode === 'slow') await slow;
    let result;
    const input = kind === 'connection' ? {} : JSON.parse(payload.input);
    if (kind === 'generation') {
      assert.equal(input.cefrLevel, 'A2');
      assert.equal(input.targetDuration, 4);
      result =
        mode === 'invalid'
          ? { title: 'bad', sentences: [] }
          : { title: 'Der Spaziergang', sentences: sentenceList };
    } else if (kind === 'word') {
      if (input.surfaceForm === 'Bank') {
        const meaning = input.sentence.includes('geschlossen')
          ? 'банк, финансовое учреждение'
          : 'скамейка';
        result = {
          lemma: 'Bank',
          partOfSpeech: 'noun',
          article: 'die',
          gender: 'feminine',
          meaningRu: meaning,
          formRu: 'Единственное число, именительный падеж.',
          expression: 'Bank',
          matchedVocabularyId:
            input.knownVocabulary.find(
              (word) => word.lemma === 'Bank' && word.meaningRu === meaning,
            )?.id ?? null,
        };
      } else if (input.surfaceForm === 'steht') {
        result = {
          lemma: 'aufstehen',
          partOfSpeech: 'verb',
          article: null,
          gender: null,
          meaningRu: 'вставать',
          formRu: 'steht и auf — части отделяемого глагола.',
          expression: 'steht … auf',
          matchedVocabularyId: null,
        };
      } else {
        result = {
          lemma: 'gehen',
          partOfSpeech: 'verb',
          article: null,
          gender: null,
          meaningRu: 'идти',
          formRu:
            input.surfaceForm === 'ging'
              ? 'ging — прошедшее время Präteritum.'
              : 'gehe — настоящее время для ich.',
          expression: input.surfaceForm,
          matchedVocabularyId:
            input.knownVocabulary.find(
              (word) => word.lemma === 'gehen' && word.meaningRu === 'идти',
            )?.id ?? null,
        };
      }
    } else if (kind === 'grammar') {
      grammarSentences.push(input.sentence);
      assert.equal(input.cefrLevel, 'A2');
      const fragment = input.sentence.includes('ging') ? 'ging' : 'gehe';
      result = {
        rules: [
          {
            titleRu: 'Прошедшее время',
            explanationRu: 'ging — форма Präteritum глагола gehen.',
            fragments: [fragment],
            examples: [{ de: 'Er ging nach Hause.', ru: 'Он шёл домой.' }],
          },
        ],
      };
    }
    try {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'completed',
          output: [
            {
              type: 'message',
              content: [
                {
                  type: 'output_text',
                  text: kind === 'connection' ? 'Hallo!' : JSON.stringify(result),
                },
              ],
            },
          ],
          usage: { total_tokens: 90 },
        }),
      });
    } catch {}
  });
  const tally = () =>
    page.evaluate(async () => {
      const database = await new Promise((resolve, reject) => {
        const request = indexedDB.open('vibe.learning');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const transaction = database.transaction(['interactions', 'vocabulary', 'wordLookups']);
      const read = (store) =>
        new Promise((resolve) => {
          const request = transaction.objectStore(store).getAll();
          request.onsuccess = () => resolve(request.result);
        });
      const [interactions, vocabulary, lookups] = await Promise.all([
        read('interactions'),
        read('vocabulary'),
        read('wordLookups'),
      ]);
      database.close();
      return {
        interactions: interactions.length,
        vocabulary,
        pending: lookups.filter((lookup) => lookup.state === 'Pending').length,
      };
    });
  await page.goto('http://127.0.0.1:4173/vibe/');
  await page.getByRole('button', { name: 'Сгенерировать текст' }).waitFor();
  assert.deepEqual(requests, { generation: 0, word: 0, grammar: 0, connection: 0 });
  await page.getByLabel('API key', { exact: true }).fill('test-credential');
  await page.getByLabel('Модель', { exact: true }).fill('test-model');
  await page.getByRole('button', { name: 'Сохранить настройки' }).click();
  await page.getByLabel('Уровень', { exact: true }).selectOption('A2');
  await page.getByLabel('Время чтения', { exact: true }).selectOption('4');
  modes.generation = 'slow';
  slow = new Promise((resolve) => {
    release = resolve;
  });
  await page.getByRole('button', { name: 'Сгенерировать текст' }).click();
  await page.getByRole('button', { name: 'Создаём текст…' }).waitFor();
  assert(await page.getByRole('button', { name: 'Создаём текст…' }).isDisabled());
  release();
  await page.getByRole('heading', { name: 'Der Spaziergang' }).waitFor();
  assert.equal(requests.generation, 1);
  assert.equal(await page.locator('.reader-text img').count(), 0);
  const originalIds = await page
    .locator('[data-sentence-id]')
    .evaluateAll((nodes) => nodes.map((node) => node.dataset.sentenceId));
  await page.reload();
  await page.getByRole('heading', { name: 'Der Spaziergang' }).waitFor();
  assert.deepEqual(
    await page
      .locator('[data-sentence-id]')
      .evaluateAll((nodes) => nodes.map((node) => node.dataset.sentenceId)),
    originalIds,
  );
  assert.equal(await page.getByLabel('Уровень', { exact: true }).inputValue(), 'A2');
  assert.equal(await page.getByLabel('Время чтения', { exact: true }).inputValue(), '4');
  assert.equal(requests.generation, 1);
  modes.generation = 'invalid';
  await page.getByRole('button', { name: 'Сгенерировать текст' }).click();
  await page.getByRole('alert').filter({ hasText: 'некорректный ответ' }).waitFor();
  assert(await page.getByRole('heading', { name: 'Der Spaziergang' }).isVisible());
  modes.generation = 'slow';
  slow = new Promise((resolve) => {
    release = resolve;
  });
  await page.getByRole('button', { name: 'Сгенерировать текст' }).click();
  await page.getByRole('button', { name: 'Отменить генерацию' }).click();
  await page.getByRole('alert').filter({ hasText: 'отменена' }).waitFor();
  release();
  modes.generation = 'success';
  console.log(
    'PASS: production generation, options, duplicate prevention, cancellation, invalid response, safe rendering and restoration without AI',
  );

  const ging = page.getByRole('button', { name: 'Перевести ging', exact: true });
  await ging.tap();
  await page.getByRole('heading', { name: 'gehen', exact: true }).waitFor();
  assert.equal(requests.word, 1);
  assert(await page.getByText('ging — прошедшее время Präteritum.', { exact: true }).isVisible());
  assert.equal((await tally()).vocabulary[0].unknownCount, 1);
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.getByRole('button', { name: 'Закрыть карточку' }).click();
  await ging.tap();
  await page.getByRole('heading', { name: 'gehen', exact: true }).waitFor();
  assert.equal(requests.word, 1);
  assert.equal((await tally()).vocabulary[0].unknownCount, 2);
  await page.getByRole('button', { name: 'Отменить отметку', exact: true }).click();
  await page.locator('.analysis-panel').waitFor({ state: 'detached' });
  assert.equal((await tally()).vocabulary[0].unknownCount, 1);
  await page.getByRole('button', { name: 'Перевести gehe', exact: true }).tap();
  await page.getByRole('heading', { name: 'gehen', exact: true }).waitFor();
  assert.equal((await tally()).vocabulary.length, 1);
  assert.equal((await tally()).vocabulary[0].unknownCount, 2);
  await page.getByRole('button', { name: 'Закрыть карточку' }).click();
  console.log(
    'PASS: touch word lookup, contextual card, repeated taps, persisted vocabulary, cache, undo and verified inflected-form association',
  );

  const banks = page.getByRole('button', { name: 'Перевести Bank', exact: true });
  modes.word = 'network';
  await banks.first().tap();
  await page
    .locator('.analysis-panel')
    .getByRole('alert')
    .filter({ hasText: 'Проверьте интернет' })
    .waitFor();
  assert.equal((await tally()).pending, 1);
  const beforeReload = { ...requests };
  await page.reload();
  await page.getByRole('heading', { name: 'Незавершённые отметки' }).waitFor();
  assert.deepEqual(requests, beforeReload);
  modes.word = 'success';
  await page.getByRole('button', { name: 'Повторить перевод', exact: true }).click();
  await page.getByRole('heading', { name: 'die Bank', exact: true }).waitFor();
  assert(await page.getByText('существительное · женский род', { exact: true }).isVisible());
  assert.equal((await tally()).pending, 0);
  await page.getByRole('button', { name: 'Закрыть карточку' }).click();
  await banks.nth(1).tap();
  await page.getByText('банк, финансовое учреждение', { exact: true }).first().waitFor();
  assert.equal((await tally()).vocabulary.filter((word) => word.lemma === 'Bank').length, 2);
  await page.getByRole('button', { name: 'Закрыть карточку' }).click();
  await page
    .locator('.sentence-row')
    .nth(4)
    .getByRole('button', { name: 'Перевести steht', exact: true })
    .tap();
  await page.getByRole('heading', { name: 'aufstehen', exact: true }).waitFor();
  assert(await page.getByText('steht … auf', { exact: true }).isVisible());
  await page.getByRole('button', { name: 'Закрыть карточку' }).click();
  console.log(
    'PASS: failed lookup survives reload, explicit retry, noun article/gender, distinct senses and separated verb components',
  );

  const cdp = await context.newCDPSession(page);
  const position = async () => {
    await ging.scrollIntoViewIfNeeded();
    const box = await ging.boundingBox();
    assert(box);
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  };
  const touchStart = async (point) =>
    cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ ...point, radiusX: 1, radiusY: 1 }],
    });
  const touchEnd = async () =>
    cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const beforeLong = await tally();
  const wordsBeforeLong = requests.word;
  await touchStart(await position());
  await delay(600);
  await touchEnd();
  await page.getByRole('heading', { name: 'Разбор предложения', exact: true }).waitFor();
  assert.equal(requests.grammar, 1);
  assert.equal(requests.word, wordsBeforeLong);
  assert.equal((await tally()).interactions, beforeLong.interactions);
  assert.equal(await page.locator('.sentence.selected').count(), 1);
  assert(
    await page.getByText('ging — форма Präteritum глагола gehen.', { exact: true }).isVisible(),
  );
  await page.getByRole('button', { name: 'Закрыть разбор' }).click();
  const accessible = page.getByRole('button', { name: 'Разобрать предложение 1', exact: true });
  await accessible.focus();
  await page.keyboard.press('Enter');
  await page.getByRole('heading', { name: 'Разбор предложения', exact: true }).waitFor();
  assert.equal(requests.grammar, 1);
  await page.getByRole('button', { name: 'Закрыть разбор' }).click();
  const beforeGrammarReload = { ...requests };
  await page.reload();
  await page.getByRole('heading', { name: 'Der Spaziergang' }).waitFor();
  await accessible.click();
  await page.getByRole('heading', { name: 'Разбор предложения', exact: true }).waitFor();
  assert.deepEqual(requests, beforeGrammarReload);
  await page.getByRole('button', { name: 'Закрыть разбор' }).click();
  console.log(
    'PASS: native long press selects a sentence without word marks; Russian grammar, keyboard alternative and cache after reload',
  );

  const gesturesBefore = { ...requests };
  const interactionsBefore = (await tally()).interactions;
  let point = await position();
  await touchStart(point);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x: point.x, y: point.y + 35 }],
  });
  await delay(600);
  await touchEnd();
  await delay(100);
  assert.deepEqual(requests, gesturesBefore, 'Moving the finger must cancel the gesture');
  point = await position();
  await touchStart(point);
  await page.evaluate(() => window.scrollBy(0, 160));
  await delay(600);
  await touchEnd();
  await delay(100);
  assert.deepEqual(requests, gesturesBefore, 'Scrolling must cancel the gesture');
  await page.evaluate(() => {
    globalThis.gestureTrace = [];
    for (const type of [
      'pointerdown',
      'pointerup',
      'pointercancel',
      'touchstart',
      'touchcancel',
      'click',
    ])
      window.addEventListener(
        type,
        (event) =>
          globalThis.gestureTrace.push({
            type,
            target: event.target.textContent.slice(0, 70),
            y: event.clientY,
          }),
        true,
      );
  });
  point = await position();
  await touchStart(point);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await delay(600);
  assert.deepEqual(
    requests,
    gesturesBefore,
    JSON.stringify({ trace: await page.evaluate(() => globalThis.gestureTrace), grammarSentences }),
  );
  assert.equal((await tally()).interactions, interactionsBefore);
  assert.equal(await page.locator('.analysis-panel').count(), 0);
  assert(
    await ging.evaluate((node) => {
      const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
      node.dispatchEvent(event);
      return event.defaultPrevented;
    }),
  );
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '140%';
  });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  console.log(
    'PASS: movement, native scrolling and pointer cancellation trigger neither action; context menu suppression and enlarged-font layout',
  );

  await context.setOffline(true);
  await ging.focus();
  await page.keyboard.press('Enter');
  await page.getByRole('heading', { name: 'gehen', exact: true }).waitFor();
  assert.equal(requests.word, gesturesBefore.word);
  await page.getByRole('button', { name: 'Закрыть карточку' }).click();
  await accessible.click();
  await page.getByRole('heading', { name: 'Разбор предложения', exact: true }).waitFor();
  assert.equal(requests.grammar, gesturesBefore.grammar);
  await context.setOffline(false);
  await page.getByRole('button', { name: 'Закрыть разбор' }).click();
  const beforeGrammarFailure = await tally();
  const grammarRequestsBeforeFailure = requests.grammar;
  modes.grammar = 'network';
  await page.getByRole('button', { name: 'Разобрать предложение 2', exact: true }).click();
  await page
    .locator('.analysis-panel')
    .getByRole('alert')
    .filter({ hasText: 'Проверьте интернет' })
    .waitFor();
  assert.deepEqual(await tally(), beforeGrammarFailure);
  modes.grammar = 'success';
  await page.getByRole('button', { name: 'Повторить запрос', exact: true }).click();
  await page.locator('.analysis-panel .grammar-rule').waitFor();
  assert.equal(requests.grammar, grammarRequestsBeforeFailure + 2);
  assert.deepEqual(await tally(), beforeGrammarFailure);
  await page.getByRole('button', { name: 'Закрыть разбор' }).click();
  console.log(
    'PASS: grammar network failure and explicit retry preserve vocabulary and word history',
  );
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === 'texts')
        throw new DOMException('Synthetic capacity failure', 'QuotaExceededError');
      return original.apply(this, args);
    };
  });
  await page.getByRole('button', { name: 'Сгенерировать текст', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'Не удалось сохранить данные' }).waitFor();
  assert.deepEqual(
    await page
      .locator('[data-sentence-id]')
      .evaluateAll((nodes) => nodes.map((node) => node.dataset.sentenceId)),
    originalIds,
  );
  const afterQuota = { ...requests };
  await page.reload();
  await page.getByRole('heading', { name: 'Der Spaziergang' }).waitFor();
  assert.deepEqual(requests, afterQuota);
  assert.deepEqual(
    await page
      .locator('[data-sentence-id]')
      .evaluateAll((nodes) => nodes.map((node) => node.dataset.sentenceId)),
    originalIds,
  );
  console.log(
    'PASS: a synthetic storage capacity failure preserves the previously saved text and stable IDs',
  );
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '';
  });
  assert(!(await page.locator('body').innerText()).includes('test-credential'));
  assert.deepEqual(pageErrors, []);
  await mkdir('/tmp/vibe-stage3-5', { recursive: true });
  await ging.scrollIntoViewIfNeeded();
  await page.screenshot({ path: '/tmp/vibe-stage3-5/reader.png' });
  await page.evaluate(() => {
    globalThis.finalTapTrace = [];
    for (const type of [
      'pointerdown',
      'pointermove',
      'pointerup',
      'pointercancel',
      'scroll',
      'click',
    ])
      window.addEventListener(
        type,
        (event) =>
          globalThis.finalTapTrace.push({
            type,
            target: event.target.textContent?.slice(0, 40),
            y: event.clientY,
          }),
        true,
      );
  });
  await ging.tap();
  try {
    await page.getByRole('heading', { name: 'gehen', exact: true }).waitFor({ timeout: 5000 });
  } catch (error) {
    throw new Error(
      JSON.stringify(
        await page.evaluate(() => ({
          trace: globalThis.finalTapTrace,
          panel: document.querySelector('.analysis-panel')?.textContent,
          pending: document.querySelector('[aria-labelledby="pending-heading"]')?.textContent,
        })),
      ),
      { cause: error },
    );
  }
  await page.screenshot({ path: '/tmp/vibe-stage3-5/word-card.png' });
  console.log(
    'PASS: cached translation and grammar work without network; keyboard word lookup, no raw credential output or page errors',
  );
} finally {
  await browser?.close();
  server.kill();
}
