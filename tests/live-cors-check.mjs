import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  await page.goto('https://serssp.github.io/vibe/');
  const status = await page.evaluate(async () => {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      mode: 'cors',
      credentials: 'omit',
      redirect: 'error',
      headers: {
        Authorization: 'Bearer invalid-test-credential',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        input: 'Reply with exactly: Hallo!',
        max_output_tokens: 64,
        store: false,
      }),
      signal: AbortSignal.timeout(20000),
    });
    return response.status;
  });
  assert.equal(status, 401);
  console.log(
    'PASS: real browser CORS from https://serssp.github.io, HTTP 401 readable with a deliberately invalid credential',
  );
} finally {
  await browser.close();
}
