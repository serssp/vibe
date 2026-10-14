export async function closeSheet(page) {
  const panel = page.locator('.analysis-panel');
  await panel.press('Escape');
  await panel.waitFor({ state: 'detached' });
}

export async function expandSheet(page) {
  const handle = page.getByRole('button', { name: 'Управление карточкой', exact: true });
  if (await handle.isVisible()) {
    if ((await handle.getAttribute('aria-expanded')) === 'false') await handle.click();
  } else await page.getByRole('button', { name: 'Подробнее', exact: true }).click();
}

export async function swipeSheet(
  page,
  direction,
  { from = page.locator('.sheet-handle'), distance = 88, cancel = false, secondary = false } = {},
) {
  const box = await from.boundingBox();
  if (!box) throw new Error('Missing swipe target');
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  const dx = direction === 'left' ? -distance : direction === 'right' ? distance : 0;
  const dy = direction === 'up' ? -distance : direction === 'down' ? distance : 0;
  const driver = await page.context().newCDPSession(page);
  const point = (step) => ({
    x: x + (dx * step) / 8,
    y: y + (dy * step) / 8,
    id: 1,
    radiusX: 2,
    radiusY: 2,
    force: 1,
  });
  try {
    await driver.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point(0)] });
    for (let step = 1; step <= 8; step++) {
      await driver.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [point(step)],
      });
      if (secondary && step === 4) {
        await driver.send('Input.dispatchTouchEvent', {
          type: 'touchStart',
          touchPoints: [point(step), { ...point(step), x: x + 24, id: 2 }],
        });
        break;
      }
    }
    await driver.send('Input.dispatchTouchEvent', {
      type: cancel ? 'touchCancel' : 'touchEnd',
      touchPoints: [],
    });
  } finally {
    await driver.detach();
  }
}

export async function library(page) {
  const panel = page.locator('.analysis-panel');
  if (await panel.isVisible()) {
    await closeSheet(page);
  }
  const back = page.getByRole('button', { name: '← Библиотека', exact: true });
  if (await back.isVisible()) await back.click();
  else await page.getByRole('button', { name: 'Библиотека', exact: true }).click();
  await page.getByRole('heading', { name: 'Ваша библиотека', exact: true }).waitFor();
}

export async function settings(page) {
  if (!(await page.getByRole('button', { name: 'Настройки', exact: true }).isVisible()))
    await library(page);
  await page.getByRole('button', { name: 'Настройки', exact: true }).click();
  await page.getByLabel('API key', { exact: true }).waitFor();
}

export async function generation(page) {
  if (await page.getByRole('dialog', { name: 'Новый текст', exact: true }).isVisible()) return;
  await library(page);
  await page.getByRole('button', { name: '＋ Новый текст', exact: true }).click();
  await page.getByRole('dialog', { name: 'Новый текст', exact: true }).waitFor();
}

export async function resume(page) {
  const dialog = page.getByRole('dialog');
  if (await dialog.isVisible()) {
    await dialog.getByRole('button', { name: 'Закрыть', exact: true }).click();
    await dialog.waitFor({ state: 'detached' });
  }
  await library(page);
  await page.getByRole('button', { name: 'Продолжить', exact: true }).click();
  await page.locator('.reader-text').waitFor();
}

export async function chooseSentence(page, index) {
  await page.locator('.grammar-access').evaluate((node) => {
    node.open = true;
  });
  await page.getByLabel('Предложение для разбора', { exact: true }).selectOption({ index });
}
