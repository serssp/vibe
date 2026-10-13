import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
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
  for (let i = 0; i < 60; i++) {
    try {
      ready = (await fetch('http://127.0.0.1:4173/vibe/')).ok;
      if (ready) break;
    } catch {}
    await delay(250);
  }
  assert(ready, 'Preview server did not start');
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  const failures = [];
  page.on('pageerror', () => failures.push('Browser page error'));
  page.on('response', (response) => {
    if (response.url().includes('/vibe/assets/') && !response.ok())
      failures.push('Asset loading failed');
  });
  let mode = 'success';
  let requests = 0;
  let releaseSlow;
  const slowResponse = new Promise((resolve) => {
    releaseSlow = resolve;
  });
  const credential = 'test-credential';
  await page.route('https://api.openai.com/v1/responses', async (route) => {
    requests++;
    const request = route.request();
    assert.equal(request.headers().authorization, `Bearer ${credential}`);
    assert.equal(request.postDataJSON().store, false);
    if (mode === 'network') return route.abort('internetdisconnected');
    if (mode === 'invalid')
      return route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: { message: credential } }),
      });
    if (mode === 'slow') await slowResponse;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'completed',
        output: [{ type: 'message', content: [{ type: 'output_text', text: 'Hallo!' }] }],
        usage: { total_tokens: 12 },
      }),
    });
  });
  await page.goto('http://127.0.0.1:4173/vibe/');
  const check = page.getByRole('button', { name: 'Проверить подключение' });
  await page.getByRole('heading', { name: 'Проверка подключения' }).waitFor();
  assert.equal(requests, 0);
  assert(await check.isDisabled());
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.getByLabel('API key', { exact: true }).fill(credential);
  await page.getByLabel('Модель', { exact: true }).fill('test-model');
  await page.getByRole('button', { name: 'Сохранить настройки' }).click();
  await page.reload();
  assert.equal(await page.getByLabel('API key', { exact: true }).inputValue(), credential);
  assert.equal(await page.getByLabel('Модель', { exact: true }).inputValue(), 'test-model');
  assert.equal(requests, 0);
  console.log(
    'PASS: /vibe/ assets, mobile layout, refresh, key/model persistence, no automatic API requests',
  );
  mode = 'slow';
  await check.click();
  assert(await page.getByRole('button', { name: 'Проверяем…' }).isDisabled());
  releaseSlow();
  await page.getByText('OpenAI ответил', { exact: true }).waitFor();
  assert.equal(requests, 1);
  assert(!(await page.locator('body').innerText()).includes(credential));
  console.log('PASS: mock success, loading and duplicate prevention');
  mode = 'invalid';
  await check.click();
  await page.getByRole('alert').filter({ hasText: 'Неверный API key' }).waitFor();
  assert(!(await page.locator('body').innerText()).includes(credential));
  console.log('PASS: invalid key error without leaking API response');
  mode = 'network';
  await check.click();
  await page.getByRole('alert').filter({ hasText: 'Проверьте интернет' }).waitFor();
  console.log('PASS: network error');
  mode = 'success';
  await check.click();
  await page.getByText('OpenAI ответил', { exact: true }).waitFor();
  console.log('PASS: successful retry after errors');
  await page.getByRole('button', { name: 'Удалить ключ' }).click();
  await page.reload();
  assert.equal(await page.getByLabel('API key', { exact: true }).inputValue(), '');
  assert(await check.isDisabled());
  console.log('PASS: key deletion persists after refresh');
  assert.deepEqual(failures, []);
} finally {
  await browser?.close();
  server.kill();
}
