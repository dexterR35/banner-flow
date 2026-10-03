import { test, expect } from '@playwright/test';

const project = (page) =>
  page.evaluate(async () => (await import('/src/core/storage.js')).loadProject());
const saved = async (page) => {
  await expect(page.getByRole('button', { name: 'Arrange now', exact: true })).toBeEnabled();
  await expect(page.getByText('Saved locally', { exact: true })).toBeVisible();
};

test('real local model detects people after upload, stores focus, and exports the arranged crop', async ({
  page,
}, testInfo) => {
  test.setTimeout(210_000);
  const engine = process.env.BANNERFLOW_TEST_SUBJECT_ENGINE || 'browser';
  expect(['browser', 'sam3']).toContain(engine);
  const external = [];
  page.on('request', (r) => {
    if (/^https?:/.test(r.url()) && new URL(r.url()).hostname !== 'localhost')
      external.push(r.url());
  });
  await page.goto('/');
  await saved(page);
  await page.getByLabel('Subject finder', { exact: true }).selectOption(engine);
  if (engine === 'browser') {
    // Reproduce old workspaces that cached Vite's HTML fallback as model config.
    await page.evaluate(async () => {
      const cache = await caches.open('transformers-cache');
      await cache.put(
        '/vendor/models/owlvit-base-patch32-ONNX/config.json',
        new Response('<!doctype html><title>Old app fallback</title>', {
          headers: { 'Content-Type': 'text/html' },
        }),
      );
    });
  }
  const before = await project(page);
  // Use the supplied reference's photo area as a reproducible small hero fixture.
  const fixture = await page.evaluate(async () => {
    const image = await createImageBitmap(await (await fetch('/references/300X600.png')).blob());
    const canvas = document.createElement('canvas');
    canvas.width = 300;
    canvas.height = 210;
    canvas.getContext('2d').drawImage(image, 0, 340, 300, 210, 0, 0, 300, 210);
    image.close();
    return canvas.toDataURL().split(',')[1];
  });
  const searchStarted = Date.now();
  await page.locator('.upload-zone input').setInputFiles({
    name: 'hero-fixture.png',
    mimeType: 'image/png',
    buffer: Buffer.from(fixture, 'base64'),
  });
  await expect(
    page.getByRole('progressbar', { name: 'Automatic subject placement' }),
  ).toBeVisible();
  await expect(page.getByLabel('Campaign name', { exact: true })).toBeDisabled();
  await expect(page.locator('.subject-panel [role="status"]')).toHaveText(
    /placed|unavailable|No confident match/,
    { timeout: 185_000 },
  );
  const elapsedMs = Date.now() - searchStarted;
  await expect(page.locator('.subject-results button')).not.toHaveCount(0);
  await saved(page);
  const found = await project(page);
  expect(found.campaigns.FI.subjectSearch.engine).toBe(engine);
  await testInfo.attach('subject-inference', {
    body: JSON.stringify(
      { engine, elapsedMs, results: found.campaigns.FI.subjectSearch.results },
      null,
      2,
    ),
    contentType: 'application/json',
  });
  console.log(`${engine} subject search: ${(elapsedMs / 1000).toFixed(1)} seconds`);
  expect(found.campaigns.FI.subjectFocus.source).toBe('detected');
  expect(found.campaigns.FI.subjectFocus.label).toMatch(/person|face/);
  expect(found.blueprints).toEqual(before.blueprints);
  expect(found.campaigns.UK).toEqual(before.campaigns.UK);
  expect(external).toEqual([]);
  await page
    .locator('.subject-panel')
    .screenshot({ path: testInfo.outputPath('detected-subjects.png') });
  const pixelMatch = await page.evaluate(async () => {
    const { loadProject, loadResources } = await import('/src/core/storage.js');
    const { resolveBanner } = await import('/src/data/defaults.js');
    const { canvasOf, renderFrame } = await import('/src/core/render.js');
    const { renderOutput } = await import('/src/core/export.js');
    const p = await loadProject(),
      entry = p.blueprints.find((e) => e.id === 'FI-300x250'),
      bp = resolveBanner(entry, p.banners[entry.id]);
    const c = p.campaigns.FI,
      r = await loadResources(c),
      a = canvasOf(300, 250),
      b = canvasOf(300, 250);
    renderFrame(a, bp, c, r);
    const bitmap = await createImageBitmap(await renderOutput(bp, c, r, 'png'));
    b.getContext('2d').drawImage(bitmap, 0, 0);
    bitmap.close();
    const first = a.getContext('2d').getImageData(0, 0, 300, 250).data,
      second = b.getContext('2d').getImageData(0, 0, 300, 250).data;
    return first.every((v, i) => v === second[i]);
  });
  expect(pixelMatch).toBe(true);
  await page.reload();
  await saved(page);
  expect((await project(page)).campaigns.FI.subjectFocus).toEqual(found.campaigns.FI.subjectFocus);
  await page.getByRole('button', { name: 'Edit banner 300x250', exact: true }).click();
  await page
    .locator('.layer-row')
    .filter({ hasText: 'Campaign image' })
    .getByRole('button')
    .first()
    .click();
  await expect(page.getByRole('button', { name: /Focus on/ })).toBeVisible();
});

// Isolated worker failure/race fixtures; the test above exercises actual inference.
test('no match and model errors allow manual focus; stale searches cannot change another image or market', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const Original = window.Worker;
    window.Worker = class {
      constructor(url, options) {
        if (!String(url).includes('subject-detector')) return new Original(url, options);
      }
      terminate() {} // Deliberately deliver late messages to exercise cancellation.
      postMessage({ query }) {
        setTimeout(
          () =>
            this.onmessage?.({
              data:
                query === 'broken'
                  ? { type: 'error', message: 'fixture error' }
                  : { type: 'result', results: [] },
            }),
          1000,
        );
      }
    };
  });
  await page.goto('/');
  await saved(page);
  await page.getByLabel('Subject finder', { exact: true }).selectOption('browser');
  await page.locator('.upload-zone input').setInputFiles('public/references/300X600.png');
  await expect(page.locator('.subject-panel [role="status"]')).toContainText('No confident match');
  await page.getByLabel('Find in image').fill('broken');
  await page.getByRole('button', { name: 'Find subject', exact: true }).click();
  await expect(page.getByText(/Subject finder unavailable/)).toBeVisible();
  await page.locator('.subject-preview').click({ position: { x: 60, y: 80 } });
  await saved(page);
  let p = await project(page);
  expect(p.campaigns.FI.subjectFocus.source).toBe('manual');
  expect(p.banners['FI-300x250'].arrangement).toBeTruthy();
  const focus = p.campaigns.FI.subjectFocus;
  await page.getByRole('button', { name: 'Find subject', exact: true }).click();
  await page.getByRole('button', { name: 'United Kingdom', exact: true }).click();
  await expect(page).toHaveURL(/market=UK/);
  // URL updates precede the new market's panel commit during router transitions.
  await expect(page.locator('.subject-preview')).toHaveCount(0);
  await page.getByLabel('Subject finder', { exact: true }).selectOption('browser');
  await expect.poll(async () => (await project(page)).campaigns.UK.subjectEngine).toBe('browser');
  await page.locator('.upload-zone input').setInputFiles('public/references/160X600.png');
  await expect(page.locator('.subject-panel [role="status"]')).toContainText('No confident match');
  await saved(page);
  p = await project(page);
  expect(p.campaigns.FI.subjectFocus).toEqual(focus);
  expect(p.campaigns.UK.subjectFocus).toBeFalsy();
  await page.getByLabel('Auto find subject on upload').uncheck();
  await page.locator('.upload-zone input').setInputFiles('public/references/300X600.png');
  await saved(page);
  expect((await project(page)).campaigns.UK.subjectFocus).toBeNull();
  await expect(page.getByRole('button', { name: 'Find subject', exact: true })).toBeEnabled();
});
