import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import {
  settings,
  generation,
  library,
  resume,
  chooseSentence,
  swipeSheet,
  closeSheet,
} from './browser-navigation.mjs';

const site = process.env.VIBE_SITE ?? 'http://127.0.0.1:4176/vibe/';
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
        '4176',
        '--strictPort',
      ],
      { stdio: 'ignore' },
    );
const output = process.env.VIBE_SCREENSHOTS ?? '/tmp/vibe-leselampe';
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
  assert(ready);
  await mkdir(output, { recursive: true });
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const requests = { generation: 0, word: 0, grammar: 0 };
  let slow = false;
  let release;
  let started;
  let releaseGeneration;
  const generationGate = new Promise((resolve) => {
    releaseGeneration = resolve;
  });
  await context.route('https://api.openai.com/**', async (route) => {
    const payload = route.request().postDataJSON();
    const kind = payload.text.format.name.replace('vibe_', '');
    requests[kind]++;
    const input = JSON.parse(payload.input);
    let result;
    if (kind === 'generation')
      result = {
        title: `Ein kleiner Lesetag ${requests.generation}`,
        sentences: [
          'Wir gehen heute in den Park.',
          'Auf der Bank spielen die Kinder.',
          ...Array.from(
            { length: 42 },
            (_, index) =>
              `Am Tag ${index + 1} lesen die Freunde eine Geschichte und sprechen über ihren schönen Spaziergang.`,
          ),
        ],
        occurrences: [],
      };
    else if (kind === 'word') {
      if (slow)
        await new Promise((resolve) => {
          release = resolve;
          started?.();
        });
      result = {
        lemma: input.surfaceForm === 'gehen' ? 'gehen' : 'heute',
        partOfSpeech: input.surfaceForm === 'gehen' ? 'verb' : 'adverb',
        article: null,
        gender: null,
        meaningRu: input.surfaceForm === 'gehen' ? 'идти' : 'сегодня',
        formRu: 'Значение слова в этом предложении.',
        expression: input.surfaceForm,
        matchedVocabularyId: null,
        nounPlural: null,
        irregularVerb:
          input.surfaceForm === 'gehen' ? { preterite: 'ging', perfect: 'ist gegangen' } : null,
      };
      if (input.surfaceForm === 'Bank')
        Object.assign(result, {
          lemma: 'Bank',
          partOfSpeech: 'noun',
          article: 'die',
          gender: 'feminine',
          meaningRu: 'скамейка',
          nounPlural: 'Bänke',
        });
      if (input.surfaceForm === 'spielen')
        Object.assign(result, {
          lemma: 'spielen',
          partOfSpeech: 'verb',
          meaningRu: 'играть',
        });
      if (input.surfaceForm === 'Kinder')
        Object.assign(result, {
          lemma: 'Kind',
          partOfSpeech: 'noun',
          article: 'das',
          gender: 'neuter',
          nounPlural: 'Kinder',
          meaningRu: 'ребёнок',
          formRu: 'Kinder — множественное число существительного Kind. '.repeat(50),
        });
    } else if (kind === 'grammar')
      result = {
        rules: Array.from({ length: 4 }, (_, index) => ({
          titleRu: `Порядок слов ${index + 1}`,
          explanationRu:
            'В немецком повествовательном предложении глагол стоит на втором месте. Остальные части предложения дополняют его значение.',
          fragments: [input.sentence.split(' ')[0]],
          examples: [{ de: 'Wir lesen heute.', ru: 'Мы читаем сегодня.' }],
        })),
      };
    else throw new Error('Unexpected request');
    if (kind === 'generation' && requests.generation === 1) await generationGate;
    await route
      .fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'completed',
          output: [
            { type: 'message', content: [{ type: 'output_text', text: JSON.stringify(result) }] },
          ],
          usage: { total_tokens: 50 },
        }),
      })
      .catch(() => {});
  });
  const snapshot = () =>
    page.evaluate(async () => {
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open('vibe.learning');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const names = ['texts', 'sessions', 'vocabulary', 'wordLookups', 'interactions', 'exposures'];
      const transaction = db.transaction(names);
      const data = await Promise.all(
        names.map(
          (name) =>
            new Promise((resolve, reject) => {
              const request = transaction.objectStore(name).getAll();
              request.onsuccess = () => resolve([name, request.result]);
              request.onerror = () => reject(request.error);
            }),
        ),
      );
      db.close();
      return Object.fromEntries(data);
    });
  const noOverflow = async (label) => {
    const geometry = await page.evaluate(() => {
      const width = document.documentElement.clientWidth;
      return {
        width,
        scroll: document.documentElement.scrollWidth,
        inner: innerWidth,
        elements: [...document.querySelectorAll('body *')]
          .filter(
            (node) =>
              node.getClientRects().length && node.getBoundingClientRect().right > width + 1,
          )
          .slice(0, 24)
          .map((node) => ({
            tag: node.tagName,
            class: node.className,
            right: node.getBoundingClientRect().right,
            width: node.getBoundingClientRect().width,
          })),
      };
    });
    assert(geometry.scroll <= geometry.width, `${label}: ${JSON.stringify(geometry)}`);
  };
  const shot = async (name) => {
    await delay(100);
    return page.screenshot({ path: `${output}/${name}.png` });
  };
  await page.goto(site);
  await page.getByRole('heading', { name: 'Ваша библиотека' }).waitFor();
  await shot('library-empty');
  await page.getByRole('button', { name: '＋ Новый текст', exact: true }).click();
  await page.getByLabel('API key', { exact: true }).fill('test-credential');
  await page.getByLabel('Модель', { exact: true }).fill('test-model');
  await page.getByRole('button', { name: 'Сохранить настройки' }).click();
  await shot('settings');
  await generation(page);
  await shot('generation');
  await page.getByRole('button', { name: 'Сгенерировать текст', exact: true }).click();
  await page.getByRole('button', { name: 'Создаём текст…', exact: true }).waitFor();
  await shot('generation-loading');
  releaseGeneration();
  await page.locator('.reader-text').waitFor();
  const readerUrl = page.url();
  assert.equal(await page.locator('.sentence-analysis').count(), 0);
  const ids = await page
    .locator('[data-sentence-id]')
    .evaluateAll((nodes) => nodes.map((node) => node.dataset.sentenceId));
  await shot('reader');
  const word = page.getByRole('button', { name: 'Перевести gehen', exact: true });
  await word.tap();
  await page.getByRole('heading', { name: 'gehen', exact: true }).waitFor();
  await page.locator('.word-meta').waitFor();
  const visibleSelection = async () => {
    const selected = await page.locator('.word.selected').boundingBox();
    const panel = await page.locator('.analysis-panel').boundingBox();
    assert(
      selected && panel && selected.y >= 0 && selected.y + selected.height <= panel.y - 4,
      `Selection overlaps sheet: ${JSON.stringify({ selected, panel })}`,
    );
  };
  await delay(100);
  await visibleSelection();
  const compactPanel = await page.locator('.analysis-panel').boundingBox();
  assert(compactPanel && compactPanel.height < 844 * 0.35);
  assert(await page.locator('.word-meta').getByText('глагол', { exact: true }).isVisible());
  assert(await page.getByText('ging — ist gegangen', { exact: true }).isVisible());
  assert.equal(await page.locator('.tapped-form').count(), 0);
  assert.equal(await page.locator('.word-card blockquote').count(), 0);
  assert.equal(
    await page.getByRole('button', { name: 'Закрыть карточку', exact: true }).count(),
    0,
  );
  await shot('word-compact');
  const sheetHandle = page.getByRole('button', { name: 'Управление карточкой', exact: true });
  assert.equal(await page.getByRole('button', { name: 'Подробнее', exact: true }).count(), 0);
  assert.equal(await page.getByRole('button', { name: 'Закрыть панель', exact: true }).count(), 0);
  await sheetHandle.press('ArrowUp');
  assert.equal(await sheetHandle.getAttribute('aria-expanded'), 'true');
  await sheetHandle.press('ArrowDown');
  assert.equal(await sheetHandle.getAttribute('aria-expanded'), 'false');
  for (const options of [{ distance: 16 }, { cancel: true }, { secondary: true }]) {
    await swipeSheet(page, 'up', options);
    assert.equal(await sheetHandle.getAttribute('aria-expanded'), 'false');
    assert.equal(await page.locator('.is-dragging').count(), 0);
  }
  await swipeSheet(page, 'right');
  assert.equal(await sheetHandle.getAttribute('aria-expanded'), 'false');
  await swipeSheet(page, 'up', { from: page.getByRole('heading', { name: 'gehen', exact: true }) });
  await delay(100);
  await visibleSelection();
  assert(await page.locator('.word-card blockquote').isVisible());
  assert(await page.getByText('Значение слова в этом предложении.', { exact: true }).isVisible());
  await shot('word-expanded');
  await page.goBack();
  await page.locator('.analysis-panel').waitFor({ state: 'detached' });
  assert.equal(page.url(), readerUrl);
  assert.equal((await snapshot()).interactions.length, 1);
  await chooseSentence(page, 0);
  await page.getByRole('button', { name: 'Разобрать выбранное предложение' }).focus();
  await page.keyboard.press('Enter');
  await page.getByRole('heading', { name: 'Разбор предложения', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Подробнее', exact: true }).click();
  await shot('grammar-expanded');
  assert.equal((await snapshot()).interactions.length, 1);
  await page.keyboard.press('Escape');
  await page.locator('.analysis-panel').waitFor({ state: 'detached' });
  await word.tap();
  await page.getByRole('heading', { name: 'gehen', exact: true }).waitFor();
  await page.locator('.word-meta').waitFor();
  const handle = await page
    .getByRole('button', { name: 'Управление карточкой', exact: true })
    .boundingBox();
  assert(handle);
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2 + 80, {
    steps: 8,
  });
  await page.mouse.up();
  await page.locator('.analysis-panel').waitFor({ state: 'detached' });
  assert.equal(page.url(), readerUrl);
  const markedBeforeSlow = (await snapshot()).interactions.length;
  const handleWord = page.getByRole('button', { name: 'Перевести heute', exact: true });
  slow = true;
  const requestStarted = new Promise((resolve) => {
    started = resolve;
  });
  await handleWord.tap();
  await requestStarted;
  await shot('word-loading');
  await swipeSheet(page, 'down');
  await page.locator('.analysis-panel').waitFor({ state: 'detached' });
  release();
  slow = false;
  await page.getByRole('heading', { name: 'Незавершённые отметки' }).waitFor();
  assert.equal((await snapshot()).interactions.length, markedBeforeSlow);
  await word.tap();
  await page.getByRole('heading', { name: 'gehen', exact: true }).waitFor();
  await page.locator('.word-meta').waitFor();
  await delay(100);
  assert.equal(await page.getByRole('heading', { name: 'heute', exact: true }).count(), 0);
  assert.equal((await snapshot()).interactions.length, markedBeforeSlow + 1);
  assert.equal(requests.word, 2);
  await page
    .locator('.analysis-panel')
    .getByRole('button', { name: 'Отменить отметку', exact: true })
    .click();
  await page.locator('.analysis-panel').waitFor({ state: 'detached' });
  await page
    .locator('[aria-labelledby="pending-heading"]')
    .getByRole('button', { name: 'Отменить отметку' })
    .click();
  assert.equal(
    (await snapshot()).wordLookups.filter((lookup) => lookup.state === 'Pending').length,
    0,
  );
  console.log(
    'PASS: Back/Escape close sheets; actual compact/expanded sheet geometry keeps words visible; close during loading ignores late results, preserves pending recovery and cache marks/undo',
  );
  await page.getByRole('button', { name: 'Перевести Bank', exact: true }).tap();
  await page.getByRole('heading', { name: 'die Bank, die Bänke', exact: true }).waitFor();
  assert(await page.getByText('существительное · женский род', { exact: true }).isVisible());
  await shot('word-noun');
  await page
    .locator('.word-mark')
    .getByRole('button', { name: 'Отменить отметку', exact: true })
    .click();
  await page.locator('.analysis-panel').waitFor({ state: 'detached' });
  await page.getByRole('button', { name: 'Перевести spielen', exact: true }).tap();
  await page.locator('.word-meta').waitFor();
  assert.equal(await page.locator('.word-dictionary-forms').count(), 0);
  assert(await page.getByRole('heading', { name: 'spielen', exact: true }).isVisible());
  await page
    .locator('.word-mark')
    .getByRole('button', { name: 'Отменить отметку', exact: true })
    .click();
  await page.locator('.analysis-panel').waitFor({ state: 'detached' });
  console.log(
    'PASS: noun singular article and full plural are visible; irregular verbs show principal parts and regular verbs omit them',
  );
  await page.getByRole('button', { name: 'Перевести Kinder', exact: true }).tap();
  await page.getByRole('heading', { name: 'das Kind, die Kinder', exact: true }).waitFor();
  await swipeSheet(page, 'up');
  const scrollPanel = page.locator('.analysis-panel');
  await scrollPanel.evaluate((node) => {
    node.scrollTop = 100;
  });
  await swipeSheet(page, 'up', { from: scrollPanel });
  await page.waitForFunction(() => document.querySelector('.analysis-panel')?.scrollTop > 100);
  assert.equal(await page.locator('.analysis-panel.expanded').count(), 1);
  await delay(200);
  await swipeSheet(page, 'down', { from: scrollPanel });
  assert.equal(await page.locator('.analysis-panel.expanded').count(), 1);
  await scrollPanel.evaluate((node) => {
    node.scrollTop = 0;
  });
  await swipeSheet(page, 'down');
  await scrollPanel.waitFor({ state: 'detached' });
  assert.equal(requests.word, 5);
  await word.tap();
  await page.locator('.word-meta').waitFor();
  await sheetHandle.click();
  assert.equal(await sheetHandle.getAttribute('aria-expanded'), 'true');
  await sheetHandle.click();
  assert.equal(await sheetHandle.getAttribute('aria-expanded'), 'false');
  await closeSheet(page);
  console.log(
    'PASS: native sheet swipes, mouse drag and keyboard/handle controls; short/horizontal/cancelled/multitouch gestures preserve state; expanded content scrolls without dismissal; loading swipe cancels safely',
  );
  await page.locator('[data-sentence-id]').nth(18).scrollIntoViewIfNeeded();
  await delay(400);
  const position = (await snapshot()).sessions[0].readingPosition;
  const noAI = { ...requests };
  await page.getByRole('button', { name: 'Вид текста', exact: true }).click();
  await page.getByRole('radio', { name: 'Без засечек' }).check();
  await page.getByLabel('Размер текста', { exact: true }).fill('1.8');
  await page.getByLabel('Каждое предложение с новой строки').check();
  await page.goBack();
  await page.getByRole('dialog').waitFor({ state: 'detached' });
  await delay(400);
  const after = (await snapshot()).sessions[0].readingPosition;
  assert.equal(
    after.sentenceId,
    position.sentenceId,
    JSON.stringify({ position, after, y: await page.evaluate(() => scrollY) }),
  );
  const textStyle = await page.locator('.reader-text').evaluate((node) => ({
    size: getComputedStyle(node).fontSize,
    lines: node.classList.contains('sentence-lines'),
  }));
  assert.equal(textStyle.size, '28.8px');
  assert(textStyle.lines);
  await library(page);
  await page.getByLabel('Поиск по названию').fill('нет такой истории');
  await page.getByRole('button', { name: 'Сбросить фильтры' }).click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot('library');
  await resume(page);
  await delay(400);
  assert.equal((await snapshot()).sessions[0].readingPosition.sentenceId, after.sentenceId);
  await page.reload();
  await page.locator('.sentence-lines').waitFor();
  assert.deepEqual(
    await page
      .locator('[data-sentence-id]')
      .evaluateAll((nodes) => nodes.map((node) => node.dataset.sentenceId)),
    ids,
  );
  assert.deepEqual(requests, noAI);
  await library(page);
  const storyButton = page
    .locator('.story-card')
    .getByRole('button', { name: 'Продолжить чтение', exact: true });
  await storyButton.scrollIntoViewIfNeeded();
  const libraryY = await page.evaluate(() => window.scrollY);
  await storyButton.click();
  await page.locator('.reader-text').waitFor();
  await page.goBack();
  await page.getByRole('heading', { name: 'Ваша библиотека', exact: true }).waitFor();
  await delay(100);
  assert(Math.abs((await page.evaluate(() => window.scrollY)) - libraryY) < 4);
  await page.getByRole('button', { name: 'Словарь', exact: true }).click();
  await shot('vocabulary');
  await page.getByRole('button', { name: 'Изучено', exact: true }).click();
  await page.getByRole('button', { name: 'Сбросить фильтры' }).click();
  await page.getByLabel('Поиск в словаре').fill('идти');
  assert.equal(await page.locator('.vocabulary-row').count(), 1);
  await settings(page);
  await shot('settings-appearance');
  assert.deepEqual(requests, noAI);
  console.log(
    'PASS: typography, sentence identity and sentence-relative position survive appearance changes, navigation and refresh; local library/vocabulary filters issue no AI requests',
  );
  await library(page);
  for (const width of [320, 360, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    for (const size of ['100%', '200%']) {
      await page.evaluate((value) => {
        document.documentElement.style.fontSize = value;
      }, size);
      await noOverflow(`Library at ${width}/${size}`);
      const nav = await page.locator('.bottom-nav').boundingBox();
      assert(
        nav && nav.x >= -1 && nav.x + nav.width <= width + 1,
        `Navigation bounds at ${width}/${size}: ${JSON.stringify(nav)}`,
      );
    }
    await shot(`library-${width}-large`);
  }
  for (const width of [320, 360, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    for (const size of ['100%', '200%']) {
      await page.evaluate((value) => {
        document.documentElement.style.fontSize = value;
      }, size);
      await settings(page);
      await noOverflow(`Settings at ${width}/${size}`);
      await library(page);
      await page.getByRole('button', { name: 'Словарь', exact: true }).click();
      await noOverflow(`Vocabulary at ${width}/${size}`);
      await resume(page);
      await noOverflow(`Reader at ${width}/${size}`);
      await word.tap();
      await page.getByRole('heading', { name: 'gehen', exact: true }).waitFor();
      await page.locator('.word-meta').waitFor();
      await noOverflow(`Sheet at ${width}/${size}`);
      await page
        .locator('.analysis-panel')
        .getByRole('button', { name: 'Отменить отметку', exact: true })
        .click();
      await page.locator('.analysis-panel').waitFor({ state: 'detached' });
      await page.getByRole('button', { name: 'Перевести Bank', exact: true }).tap();
      await page.getByRole('heading', { name: 'die Bank, die Bänke', exact: true }).waitFor();
      await noOverflow(`Noun sheet at ${width}/${size}`);
      await page
        .locator('.word-mark')
        .getByRole('button', { name: 'Отменить отметку', exact: true })
        .click();
      await page.locator('.analysis-panel').waitFor({ state: 'detached' });
      await generation(page);
      await noOverflow(`Generation at ${width}/${size}`);
      await page.getByRole('dialog').getByRole('button', { name: 'Закрыть', exact: true }).click();
      await page.getByRole('dialog').waitFor({ state: 'detached' });
    }
  }
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '';
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await generation(page);
  await page.goBack();
  await page.getByRole('dialog').waitFor({ state: 'detached' });
  assert(new URL(page.url()).hash === '#library');
  await page.goto(`${site}#reader/${encodeURIComponent((await snapshot()).texts[0].id)}`);
  await page.locator('.reader-text').waitFor();
  assert.deepEqual(requests, noAI);
  await generation(page);
  await page.getByRole('button', { name: 'Сгенерировать текст', exact: true }).click();
  await page.getByRole('heading', { name: 'Ein kleiner Lesetag 2', exact: true }).waitFor();
  const afterSecondGeneration = { ...requests };
  await page.goto(`${readerUrl}?panel=analysis`);
  await page.getByRole('heading', { name: 'Ein kleiner Lesetag 1', exact: true }).waitFor();
  assert.equal(await page.locator('.analysis-panel').count(), 0);
  assert.deepEqual(requests, afterSecondGeneration);
  assert.deepEqual(
    await page
      .locator('[data-sentence-id]')
      .evaluateAll((nodes) => nodes.map((node) => node.dataset.sentenceId)),
    ids,
  );
  assert.deepEqual(errors, []);
  console.log(
    'PASS: mobile widths 320/360/390/430, 200% system text, labelled navigation, generation Back and GitHub Pages deep links',
  );
} finally {
  await browser?.close();
  server?.kill();
}
