import { test, expect } from '@playwright/test';

// HTTP fixtures verify adapter/UI behavior. Actual SAM 3 needs local model weights.
const health = {
  service: 'bannerflow-sam3',
  schemaVersion: 1,
  ready: true,
  state: 'available',
  loaded: false,
  device: 'test fixture',
  issues: [],
};
const result = {
  service: 'bannerflow-sam3',
  schemaVersion: 1,
  engine: 'sam3',
  detections: [
    { label: 'human face', score: 0.9, box: { xmin: 0.3, ymin: 0.5, xmax: 0.6, ymax: 0.65 } },
  ],
};
const saved = (page) => expect(page.getByText('Saved locally', { exact: true })).toBeVisible();
const project = (page) =>
  page.evaluate(async () => (await import('/src/core/storage.js')).loadProject());
const fixtureBrowser = (page) =>
  page.addInitScript(() => {
    const Original = window.Worker;
    window.Worker = class {
      constructor(url, options) {
        if (!String(url).includes('subject-detector')) return new Original(url, options);
      }
      terminate() {}
      postMessage() {
        setTimeout(() => this.onmessage?.({ data: { type: 'result', results: [] } }), 100);
      }
    };
  });

test('busy SAM 3 waits for the service and can cancel the queued search', async ({ page }) => {
  let posts = 0,
    busyUntil = 0;
  await page.route('**/api/subjects/health', (route) =>
    route.fulfill({
      json: {
        ...health,
        state: Date.now() < busyUntil ? 'busy' : 'ready',
      },
    }),
  );
  await page.route('**/api/subjects/detect?*', (route) => {
    posts++;
    if (posts === 2) return route.fulfill({ json: result });
    busyUntil = Date.now() + (posts === 1 ? 1500 : 60_000);
    return route.fulfill({ status: 429, json: { detail: 'Another image is processing.' } });
  });
  await page.goto('/');
  await saved(page);
  await page.getByLabel('Subject finder', { exact: true }).selectOption('sam3');
  await page.locator('.upload-zone input').setInputFiles('public/references/300X600.png');
  await expect(page.locator('.subject-panel [role="status"]')).toContainText(
    'Waiting for your turn',
  );
  await expect(page.locator('.subject-results button')).toHaveCount(1);
  expect(posts).toBe(2);
  await page.getByRole('button', { name: 'Find subject', exact: true }).click();
  await expect(page.locator('.subject-panel [role="status"]')).toContainText(
    'Waiting for your turn',
  );
  await page.locator('.subject-preview').click({ position: { x: 50, y: 50 } });
  await saved(page);
  expect((await project(page)).campaigns.FI.subjectFocus.source).toBe('manual');
  await expect(page.locator('.subject-panel [role="status"]')).toContainText('Manual focus');
  // An aborted queue must not resume after the service becomes idle.
  busyUntil = 0;
  await page.getByLabel('Campaign name', { exact: true }).fill('Cancelled queued search');
  await saved(page);
  await page.reload();
  await saved(page);
  expect((await project(page)).campaigns.FI.subjectFocus.source).toBe('manual');
  expect(posts).toBe(3);
});

test('automatic SAM 3 adapter positions uploads and persists provider with the focus', async ({
  page,
}, testInfo) => {
  let searches = 0;
  await page.route('**/api/subjects/health', (route) => route.fulfill({ json: health }));
  await page.route('**/api/subjects/detect?*', (route) => {
    searches++;
    expect(route.request().method()).toBe('POST');
    expect(route.request().headers()['content-type']).toBe('image/png');
    expect(route.request().postDataBuffer().length).toBeGreaterThan(100);
    return route.fulfill({ json: result });
  });
  await page.goto('/campaign?market=FI');
  await saved(page);
  const before = await project(page);
  await page.locator('.upload-zone input').setInputFiles('public/references/300X600.png');
  await expect(page.locator('.subject-panel [role="status"]')).toContainText(
    'Subject placed across all formats for FI',
  );
  await saved(page);
  const after = await project(page);
  expect(after.campaigns.FI.subjectSearch.engine).toBe('sam3');
  expect(after.campaigns.FI.subjectSearch.preference).toBe('auto');
  expect(after.campaigns.FI.subjectFocus.label).toBe('human face');
  expect(after.banners['FI-300x250'].arrangement).toBeTruthy();
  expect(after.blueprints).toEqual(before.blueprints);
  expect(after.campaigns.UK).toEqual(before.campaigns.UK);
  await page.reload();
  await saved(page);
  await expect(page.getByRole('button', { name: 'Focus human face 1' })).toBeVisible();
  expect((await project(page)).campaigns.FI.subjectSearch).toEqual(
    after.campaigns.FI.subjectSearch,
  );
  expect(searches).toBe(1);
  await page
    .locator('.subject-panel')
    .screenshot({ path: testInfo.outputPath('sam3-connected-fixture.png') });
});

test('unavailable SAM 3 falls back automatically; explicit SAM 3 keeps manual focus available', async ({
  page,
}, testInfo) => {
  await fixtureBrowser(page);
  await page.route('**/api/subjects/health', (route) =>
    route.fulfill({
      json: {
        ...health,
        ready: false,
        state: 'needs_setup',
        backend: 'transformers',
        device: 'CPU',
        note: 'CPU mode is supported. Searches may be slow.',
        issues: [
          {
            code: 'checkpoint_missing',
            message: 'Download the Hugging Face SAM 3 model files after access is approved.',
          },
        ],
      },
    }),
  );
  await page.route('**/api/subjects/detect?*', () => {
    throw new Error('Unavailable service must not receive images');
  });
  await page.goto('/campaign?market=FI');
  await saved(page);
  await page.locator('.upload-zone input').setInputFiles('public/references/300X600.png');
  await expect(page.locator('.subject-panel [role="status"]')).toContainText('No confident match');
  await saved(page);
  expect((await project(page)).campaigns.FI.subjectSearch.engine).toBe('browser');
  await page.getByLabel('Subject finder', { exact: true }).selectOption('sam3');
  await expect(page.locator('.subject-panel [role="status"]')).toContainText('SAM 3 unavailable');
  await page.locator('.subject-service summary').click();
  await expect(
    page.getByText('Download the Hugging Face SAM 3 model files after access is approved.'),
  ).toBeVisible();
  await expect(page.getByText('CPU mode is supported. Searches may be slow.')).toBeVisible();
  await page.locator('.subject-preview').click({ position: { x: 50, y: 50 } });
  await saved(page);
  expect((await project(page)).campaigns.FI.subjectFocus.source).toBe('manual');
  await page
    .locator('.subject-panel')
    .screenshot({ path: testInfo.outputPath('sam3-needs-setup.png') });
});

test('malformed SAM 3 responses fall back; valid empty results remain SAM 3 results', async ({
  page,
}) => {
  await fixtureBrowser(page);
  let malformed = true;
  await page.route('**/api/subjects/health', (route) => route.fulfill({ json: health }));
  await page.route('**/api/subjects/detect?*', (route) =>
    route.fulfill({
      json: malformed
        ? { ...result, detections: [{ ...result.detections[0], score: 9 }] }
        : { ...result, detections: [] },
    }),
  );
  await page.goto('/');
  await saved(page);
  await page.locator('.upload-zone input').setInputFiles('public/references/300X600.png');
  await expect(page.locator('.subject-panel [role="status"]')).toContainText('No confident match');
  await saved(page);
  expect((await project(page)).campaigns.FI.subjectSearch.engine).toBe('browser');
  malformed = false;
  await page.getByRole('button', { name: 'Find subject', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Find subject', exact: true })).toBeEnabled();
  await saved(page);
  expect((await project(page)).campaigns.FI.subjectSearch.engine).toBe('sam3');
});

test('changing images cancels a pending SAM 3 search and cannot apply its late result', async ({
  page,
}) => {
  let release;
  const pending = new Promise((resolve) => {
    release = resolve;
  });
  await page.route('**/api/subjects/health', (route) => route.fulfill({ json: health }));
  await page.route('**/api/subjects/detect?*', async (route) => {
    await pending;
    await route.fulfill({ json: result }).catch(() => {});
  });
  await page.goto('/');
  await saved(page);
  const started = page.waitForRequest('**/api/subjects/detect?*');
  await page.locator('.upload-zone input').setInputFiles('public/references/300X600.png');
  await started;
  await page.getByRole('button', { name: 'Cancel search', exact: true }).click();
  await page.getByLabel('Auto find subject on upload').uncheck();
  await page.locator('.upload-zone input').setInputFiles('public/references/160X600.png');
  release();
  await expect(page.getByRole('button', { name: 'Find subject', exact: true })).toBeEnabled();
  await saved(page);
  const c = (await project(page)).campaigns.FI;
  expect(c.subjectFocus).toBeNull();
  expect(c.subjectSearch).toBeNull();
});
