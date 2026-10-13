export async function library(page) {
  const panel = page.locator('.analysis-panel');
  if (await panel.isVisible()) {
    await page.getByRole('button', { name: 'Закрыть панель', exact: true }).click();
    await panel.waitFor({ state: 'detached' });
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
