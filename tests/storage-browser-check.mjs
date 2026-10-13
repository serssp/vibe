import { settings } from './browser-navigation.mjs';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';

const origin = 'http://127.0.0.1:4174';
const server = spawn(
  process.execPath,
  ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '4174', '--strictPort'],
  { stdio: 'ignore' },
);
let browser;
try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      ready = (await fetch(`${origin}/vibe/`)).ok;
      if (ready) break;
    } catch {}
    await delay(250);
  }
  assert(ready, 'Storage test server did not start');
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  let apiRequests = 0;
  await context.route('https://api.openai.com/**', (route) => {
    apiRequests++;
    return route.abort();
  });
  const page = await context.newPage();
  await page.goto(`${origin}/vibe/`);
  await settings(page);
  const saved = await page.evaluate(async () => {
    const { IndexedDbLearningRepository } =
      await import('/vibe/src/infrastructure/storage/indexeddb-learning.ts');
    const { learningFixture } = await import('/vibe/tests/fixtures/learning.ts');
    const repository = new IndexedDbLearningRepository();
    localStorage.setItem('vibe.openai-api-key', 'test-credential');
    const fixture = learningFixture();
    await repository.commit(fixture);
    await repository.commit(fixture);
    const data = {
      text: await repository.getText('text-1'),
      session: await repository.getSession('session-1'),
      vocabulary: await repository.getVocabularyEntry('word-1'),
      interactions: await repository.getWordInteractions('session-1'),
      exposures: await repository.getWordExposures('session-1'),
      grammar: await repository.getGrammarExplanation('grammar-1'),
      settings: await repository.getAppSettings(),
    };
    await repository.close();
    return data;
  });
  assert.equal(saved.interactions.length, 1);
  assert.equal(saved.exposures.length, 1);
  assert(!JSON.stringify(saved).includes('test-credential'));
  await page.reload();
  const restored = await page.evaluate(async () => {
    const { IndexedDbLearningRepository } =
      await import('/vibe/src/infrastructure/storage/indexeddb-learning.ts');
    const repository = new IndexedDbLearningRepository();
    const data = {
      text: await repository.getText('text-1'),
      session: await repository.getSession('session-1'),
      vocabulary: await repository.getVocabularyEntry('word-1'),
      interactions: await repository.getWordInteractions('session-1'),
      exposures: await repository.getWordExposures('session-1'),
      grammar: await repository.getGrammarExplanation('grammar-1'),
      settings: await repository.getAppSettings(),
    };
    await repository.close();
    return data;
  });
  assert.deepEqual(restored, saved);
  console.log(
    'PASS: native IndexedDB persistence after reload, stable sentence IDs, all entities, repeated writes and key separation',
  );

  const rollback = await page.evaluate(async () => {
    const { IndexedDbLearningRepository } =
      await import('/vibe/src/infrastructure/storage/indexeddb-learning.ts');
    const { vocabularyEntry, learningFixture } = await import('/vibe/tests/fixtures/learning.ts');
    const repository = new IndexedDbLearningRepository();
    let rejected = false;
    try {
      await repository.commit({
        vocabulary: [{ ...vocabularyEntry(), status: 'Learned' }],
        exposures: [{ ...learningFixture().exposures[0], id: 'duplicate-exposure' }],
      });
    } catch {
      rejected = true;
    }
    const vocabulary = await repository.getVocabularyEntry('word-1');
    const exposures = await repository.getWordExposures('session-1');
    await repository.close();
    return { rejected, vocabulary, exposures };
  });
  assert(rollback.rejected);
  assert.deepEqual(rollback.vocabulary, saved.vocabulary);
  assert.deepEqual(rollback.exposures, saved.exposures);
  console.log(
    'PASS: native unique-index failure rolls back vocabulary and exposure writes together',
  );

  const second = await context.newPage();
  await second.goto(`${origin}/vibe/`);
  const concurrentWrite = (target, id) =>
    target.evaluate(async (exposureId) => {
      const { IndexedDbLearningRepository } =
        await import('/vibe/src/infrastructure/storage/indexeddb-learning.ts');
      const { learningFixture } = await import('/vibe/tests/fixtures/learning.ts');
      const repository = new IndexedDbLearningRepository({ name: 'browser-concurrent' });
      const fixture = learningFixture();
      fixture.exposures[0].id = exposureId;
      let succeeded = true;
      try {
        await repository.commit(fixture);
      } catch {
        succeeded = false;
      }
      await repository.close();
      return succeeded;
    }, id);
  const outcomes = await Promise.all([
    concurrentWrite(page, 'exposure-a'),
    concurrentWrite(second, 'exposure-b'),
  ]);
  assert.equal(outcomes.filter(Boolean).length, 1);
  console.log('PASS: native transactions serialize competing writes across two tabs');

  const migration = await page.evaluate(async () => {
    const { LearningDatabase } =
      await import('/vibe/src/infrastructure/storage/learning-database.ts');
    const { IndexedDbLearningRepository } =
      await import('/vibe/src/infrastructure/storage/indexeddb-learning.ts');
    const { learningMigrations } = await import('/vibe/src/infrastructure/storage/schema.ts');
    const failing = new LearningDatabase({
      version: 4,
      migrations: {
        ...learningMigrations,
        4(database) {
          database.deleteObjectStore('texts');
          throw new Error('Simulated migration failure');
        },
      },
    });
    let code;
    try {
      await failing.open();
    } catch (error) {
      code = error.code;
    }
    const repository = new IndexedDbLearningRepository();
    const text = await repository.getText('text-1');
    await repository.close();
    return { code, text };
  });
  assert.equal(migration.code, 'migration');
  assert.deepEqual(migration.text, saved.text);
  console.log('PASS: native failed upgrade preserves schema v3 and stored texts');
  assert.equal(apiRequests, 0);
} finally {
  await browser?.close();
  server.kill();
}
