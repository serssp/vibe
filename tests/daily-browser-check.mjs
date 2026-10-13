import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { readFile, mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const site = process.env.VIBE_SITE ?? 'http://127.0.0.1:4175/vibe/';
const server = process.env.VIBE_SITE
  ? undefined
  : spawn(
      process.execPath,
      [
        'node_modules/vite/bin/vite.js',
        'preview',
        '--host',
        '127.0.0.1',
        '--port',
        '4175',
        '--strictPort',
      ],
      { stdio: 'ignore' },
    );
let browser;
try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      ready = (await fetch(site)).ok;
      if (ready) break;
    } catch {}
    await delay(250);
  }
  assert(ready, 'Daily workflow site did not start');
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    acceptDownloads: true,
  });
  const pageErrors = [];
  context.on('page', (page) => page.on('pageerror', (error) => pageErrors.push(error.message)));
  let generations = 0;
  let translations = 0;
  let failTranslation = false;
  await context.route('https://api.openai.com/**', async (route) => {
    const payload = route.request().postDataJSON();
    assert.equal(route.request().headers().authorization, 'Bearer test-credential');
    assert(!JSON.stringify(payload).includes('test-credential'));
    const input = JSON.parse(payload.input);
    let result;
    if (payload.text.format.name === 'vibe_generation') {
      generations++;
      const sentences = [
        'Wir gehen heute in den Park.',
        ...Array.from(
          { length: 35 },
          (_, index) => `Am Tag ${index + 1} lesen die Freunde zusammen eine Geschichte.`,
        ),
      ];
      result = {
        title: `Lesetag ${generations}`,
        sentences,
        occurrences: input.reviewVocabulary.map((word) => ({
          vocabularyId: word.id,
          sentenceIndex: 0,
          surfaceForm: 'gehen',
          sameMeaning: true,
        })),
      };
      if (generations > 1) assert.equal(input.reviewVocabulary.length, 1);
    } else if (payload.text.format.name === 'vibe_word') {
      translations++;
      if (failTranslation) return route.abort('internetdisconnected');
      result = {
        lemma: 'gehen',
        partOfSpeech: 'verb',
        article: null,
        gender: null,
        meaningRu: 'идти',
        formRu: 'Инфинитив или множественное число настоящего времени.',
        expression: 'gehen',
        matchedVocabularyId:
          input.knownVocabulary.find((word) => word.lemma === 'gehen')?.id ?? null,
      };
    } else throw new Error('Unexpected AI request');
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'completed',
        output: [
          { type: 'message', content: [{ type: 'output_text', text: JSON.stringify(result) }] },
        ],
        usage: { total_tokens: 50 },
      }),
    });
  });
  let page = await context.newPage();
  await page.goto(site);
  await page.getByLabel('API key', { exact: true }).fill('test-credential');
  await page.getByLabel('Модель', { exact: true }).fill('test-model');
  await page.getByRole('button', { name: 'Сохранить настройки' }).click();
  const generate = async (title) => {
    await page.getByRole('button', { name: 'Сгенерировать текст', exact: true }).click();
    await page.getByRole('heading', { name: title, exact: true }).waitFor();
  };
  const data = () =>
    page.evaluate(async () => {
      const database = await new Promise((resolve, reject) => {
        const request = indexedDB.open('vibe.learning');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const names = ['texts', 'sessions', 'vocabulary', 'interactions', 'exposures', 'appSettings'];
      const transaction = database.transaction(names);
      const pairs = await Promise.all(
        names.map(
          (name) =>
            new Promise((resolve, reject) => {
              const request = transaction.objectStore(name).getAll();
              request.onsuccess = () => resolve([name, request.result]);
              request.onerror = () => reject(request.error);
            }),
        ),
      );
      database.close();
      return Object.fromEntries(pairs);
    });
  await generate('Lesetag 1');
  await page.getByRole('button', { name: 'Перевести gehen', exact: true }).tap();
  await page.getByRole('heading', { name: 'gehen', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Закрыть карточку' }).click();
  await page.locator('.sentence-row').nth(12).scrollIntoViewIfNeeded();
  await delay(650);
  const first = await data();
  assert(first.sessions[0].readingPosition.sentenceId);
  const position = first.sessions[0].readingPosition;
  await page.close();
  page = await context.newPage();
  await page.goto(site);
  await page.getByRole('heading', { name: 'Lesetag 1', exact: true }).waitFor();
  await delay(100);
  const anchorTop = await page
    .locator(`[data-sentence-id="${position.sentenceId}"]`)
    .evaluate((node) => node.getBoundingClientRect().top);
  assert(
    Math.abs(anchorTop + position.scrollOffset) < 8,
    `Position was not restored: ${anchorTop}`,
  );
  assert.equal((await data()).interactions.length, 1);
  assert.equal(generations, 1);
  assert.equal(translations, 1);
  console.log(
    'PASS: marked words and sentence-relative position survive closing the tab; reopening issues no AI requests',
  );

  await page.getByRole('button', { name: 'Завершить чтение', exact: true }).click();
  await page
    .getByText('Чтение завершено. Просмотр не изменяет прогресс.', { exact: true })
    .waitFor();
  let saved = await data();
  assert.equal(saved.vocabulary[0].status, 'Unknown');
  assert.equal(saved.exposures.length, 0);
  await generate('Lesetag 2');
  await page.getByRole('button', { name: 'Завершить чтение', exact: true }).click();
  await page
    .getByText('Чтение завершено. Просмотр не изменяет прогресс.', { exact: true })
    .waitFor();
  saved = await data();
  assert.equal(saved.vocabulary[0].status, 'Learned');
  assert.equal(saved.vocabulary[0].exposureCount, 1);
  assert.equal(saved.exposures.length, 1);
  assert.equal(saved.exposures[0].markedUnknown, false);
  await page.reload();
  await page.getByRole('heading', { name: 'Lesetag 2', exact: true }).waitFor();
  assert.equal((await data()).exposures.length, 1);
  console.log(
    'PASS: first-session words remain Unknown; a confirmed untapped repetition becomes Learned exactly once',
  );

  await page.getByText('История текстов · 2', { exact: true }).click();
  await page
    .locator('.history-list li')
    .filter({ hasText: 'Lesetag 1' })
    .getByRole('button', { name: 'Посмотреть текст' })
    .click();
  await page.getByRole('heading', { name: 'Lesetag 1', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Перевести gehen', exact: true }).count(), 0);
  assert.deepEqual((await data()).exposures, saved.exposures);
  assert.equal(generations, 2);
  assert.equal(translations, 1);
  await page.reload();
  await page.getByRole('heading', { name: 'Lesetag 1', exact: true }).waitFor();
  assert.equal((await data()).vocabulary[0].status, 'Learned');
  await page.getByRole('button', { name: 'Начать новое чтение', exact: true }).click();
  await page.getByRole('button', { name: 'Завершить чтение', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Перевести gehen', exact: true }).tap();
  await page.getByRole('heading', { name: 'gehen', exact: true }).waitFor();
  assert.equal((await data()).vocabulary[0].status, 'Unknown');
  assert.equal(translations, 1, 'Explicit rereading can reuse the contextual translation cache');
  await page.getByRole('button', { name: 'Закрыть карточку' }).click();
  console.log(
    'PASS: completed history is read-only, selected history survives refresh, and an explicit new session can mark a Learned word Unknown',
  );

  await page.getByText('Резервная копия', { exact: true }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Экспортировать данные', exact: true }).click();
  const download = await downloadPromise;
  const backup = await readFile(await download.path(), 'utf8');
  assert(!backup.includes('test-credential'));
  const envelope = JSON.parse(backup);
  assert.equal(envelope.version, 1);
  assert.equal(envelope.data.wordLookups.length, 2);
  assert.equal(envelope.data.wordTranslations.length, 1);
  const imported = {
    ...envelope,
    data: {
      ...envelope.data,
      sessions: envelope.data.sessions.map((session, index) =>
        index === 0 ? { ...session, textId: 'missing' } : session,
      ),
    },
  };
  const file = (content) => ({
    name: 'backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(content),
  });
  const beforeInvalid = await data();
  await page
    .getByLabel('Импортировать резервную копию')
    .setInputFiles(file(JSON.stringify(imported)));
  await page.getByRole('alert').filter({ hasText: 'Файл резервной копии некорректен' }).waitFor();
  assert.deepEqual(await data(), beforeInvalid);
  await page.getByLabel('Импортировать резервную копию').setInputFiles(file(backup));
  await page.getByRole('group', { name: 'Подтверждение восстановления' }).waitFor();
  assert.deepEqual(
    await data(),
    beforeInvalid,
    'Selecting a valid file must not replace data before confirmation',
  );
  await page.getByRole('button', { name: 'Отменить импорт', exact: true }).click();
  assert.deepEqual(await data(), beforeInvalid);
  await page.getByRole('button', { name: 'Завершить чтение', exact: true }).click();
  await page
    .getByText('Чтение завершено. Просмотр не изменяет прогресс.', { exact: true })
    .waitFor();
  await page.getByLabel('Импортировать резервную копию').setInputFiles(file(backup));
  await page.getByRole('button', { name: 'Заменить данные и восстановить', exact: true }).click();
  await page.getByText('Данные восстановлены.', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Завершить чтение', exact: true }).waitFor();
  assert.deepEqual((await data()).exposures, envelope.data.exposures);
  assert.equal(await page.getByLabel('API key', { exact: true }).inputValue(), 'test-credential');
  console.log(
    'PASS: downloaded backup excludes credentials; invalid import and cancellation preserve data; confirmed restore recovers sessions, caches and facts',
  );

  failTranslation = true;
  const other = page.getByRole('button', { name: 'Перевести heute', exact: true });
  await other.tap();
  await page.locator('.analysis-panel').getByRole('alert').waitFor();
  await page.getByRole('button', { name: 'Закрыть карточку' }).click();
  await page.getByRole('button', { name: 'Завершить чтение', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'незавершённые отметки' }).waitFor();
  assert((await data()).sessions.some((session) => session.status === 'InProgress'));
  await page
    .locator('[aria-labelledby="pending-heading"]')
    .getByRole('button', { name: 'Отменить отметку' })
    .click();
  await page.getByRole('button', { name: 'Завершить чтение', exact: true }).click();
  await page
    .getByText('Чтение завершено. Просмотр не изменяет прогресс.', { exact: true })
    .waitFor();
  console.log(
    'PASS: unresolved marks block completion without changing results, and explicit cancellation permits completion',
  );

  await page.getByText('Личный словарь · 1', { exact: true }).click();
  await page.getByText('История слова gehen', { exact: true }).click();
  await page.getByText('Подтверждённое повторение без отметки', { exact: false }).waitFor();
  assert.equal(generations, 2);
  assert.equal(translations, 2);
  const large = JSON.parse(backup);
  const current = await data();
  large.data = { ...large.data, ...current, appSettings: current.appSettings[0] };
  const source = large.data.texts[0];
  const sessionTemplate = large.data.sessions.find((session) => session.status === 'Completed');
  for (let index = 0; index < 500; index++) {
    const id = `large-history-${index}`;
    large.data.texts.push({
      ...source,
      id,
      title: `Geschichte ${index}`,
      content: 'Wir lesen zusammen.',
      sentences: [{ id: `${id}:1`, content: 'Wir lesen zusammen.' }],
      targetVocabularyIds: [],
      includedVocabularyIds: [],
    });
    large.data.sessions.push({
      ...sessionTemplate,
      id: `large-session-${index}`,
      textId: id,
      readingPosition: { sentenceId: null, scrollOffset: 0 },
      reviewCandidateIds: [],
    });
  }
  const started = performance.now();
  await page.getByLabel('Импортировать резервную копию').setInputFiles(file(JSON.stringify(large)));
  await page.getByRole('button', { name: 'Заменить данные и восстановить', exact: true }).click();
  await page.getByText('Данные восстановлены.', { exact: true }).waitFor();
  await page.getByText('История текстов · 502', { exact: true }).click();
  assert.equal(await page.locator('.history-list li').count(), 20);
  await page.getByRole('button', { name: 'Показать ещё', exact: true }).click();
  assert.equal(await page.locator('.history-list li').count(), 40);
  assert.equal((await data()).texts.length, 502);
  console.log(
    `PASS: word event history uses local facts; 502-document restore and history pagination completed in ${Math.round(performance.now() - started)} ms`,
  );

  await page.evaluate(() => {
    document.documentElement.style.fontSize = '150%';
  });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  assert.deepEqual(pageErrors, []);
  assert.equal(generations, 2);
  await mkdir('/tmp/vibe-stage6-8', { recursive: true });
  await page.screenshot({ path: '/tmp/vibe-stage6-8/completed.png' });
  console.log('PASS: enlarged mobile layout, safe errors, no page exceptions or implicit AI calls');
} finally {
  await browser?.close();
  server?.kill();
}
