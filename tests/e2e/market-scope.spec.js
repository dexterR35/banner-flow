import { test, expect } from '@playwright/test';

const health = {
  service: 'bannerflow-sam3',
  schemaVersion: 1,
  ready: true,
  state: 'available',
  loaded: true,
  device: 'fixture',
  issues: [],
};
const result = {
  service: 'bannerflow-sam3',
  schemaVersion: 1,
  engine: 'sam3',
  detections: [
    { label: 'person', score: 0.9, box: { xmin: 0.65, ymin: 0.1, xmax: 0.85, ymax: 0.8 } },
  ],
};
const project = (page) =>
  page.evaluate(async () => (await import('/src/core/storage.js')).loadProject());
const saved = (page) => expect(page.getByText('Saved locally', { exact: true })).toBeVisible();

async function seedMarkets(page, settings = {}) {
  await page.route('**/api/subjects/health', (route) => route.fulfill({ json: health }));
  await page.goto('/assets?market=FI');
  await saved(page);
  return page.evaluate(async (settings) => {
    const { initialProject, campaignFor, createBlueprint, newEntry, PRESETS } =
      await import('/src/data/defaults.js');
    const { storeAsset, saveProject } = await import('/src/core/storage.js');
    const p = initialProject();
    for (const id of ['DE', 'FR', 'IT', 'ES', 'BR']) {
      const market = { id, name: id, locale: 'en-GB', legal: '', flag: id, legalStatus: 'missing' };
      p.markets = [...p.markets, market];
      p.campaigns[id] = campaignFor(market);
      for (const [w, h] of PRESETS.slice(0, 8)) {
        const entry = newEntry(createBlueprint(id, w, h));
        p.blueprints.push(entry);
        p.banners[entry.id] = {
          blueprintVersionId: entry.activeVersionId,
          override: null,
          history: [],
          layoutKey: null,
        };
      }
    }
    for (const [index, market] of p.markets.entries()) {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 2048;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = `hsl(${index * 45} 50% 30%)`;
      ctx.fillRect(0, 0, 2048, 2048);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      const asset = await storeAsset(
        new File([blob], `${market.id}-2k.png`, { type: blob.type }),
        'hero',
      );
      p.assets.push(asset);
      Object.assign(p.campaigns[market.id], {
        heroAssetId: asset.id,
        subjectQuery: `person ${market.id}`,
        subjectEngine: 'auto',
        autoSubject: true,
        ...settings,
      });
    }
    await saveProject(p);
    return p;
  }, settings);
}

function unchangedMarkets(before, after, selected) {
  expect(after.assets).toEqual(before.assets);
  expect(after.blueprints).toEqual(before.blueprints);
  for (const market of before.markets.filter((m) => m.id !== selected)) {
    expect(after.campaigns[market.id]).toEqual(before.campaigns[market.id]);
    for (const entry of before.blueprints.filter((b) => b.marketId === market.id))
      expect(after.banners[entry.id]).toEqual(before.banners[entry.id]);
  }
}

for (const engine of ['sam3', 'browser']) {
  test(`${engine}: seven markets with 2K images only process and edit selected FI`, async ({
    page,
  }, testInfo) => {
    const requests = [];
    await page.route('**/api/subjects/detect?*', (route) => {
      requests.push(new URL(route.request().url()).searchParams.get('query'));
      return route.fulfill({ json: result });
    });
    await page.addInitScript(() => {
      window.subjectFixtureQueries = [];
      const NativeWorker = window.Worker;
      window.Worker = class {
        constructor(url, options) {
          if (!String(url).includes('subject-detector')) return new NativeWorker(url, options);
        }
        postMessage({ query }) {
          window.subjectFixtureQueries.push(query);
          queueMicrotask(() =>
            this.onmessage?.({
              data: {
                type: 'result',
                results: [
                  {
                    id: 'subject-0',
                    source: 'detected',
                    label: 'person',
                    score: 0.9,
                    box: { x: 0.65, y: 0.1, width: 0.2, height: 0.7 },
                  },
                ],
              },
            }),
          );
        }
        terminate() {}
      };
    });
    const before = await seedMarkets(page, { subjectEngine: engine });
    await page.goto('/campaign?market=FI');
    await expect(page.getByRole('button', { name: 'Focus person 1', exact: true })).toBeVisible();
    await page.getByLabel('Headline', { exact: true }).fill('FI CAMPAIGN ONLY');
    await page.getByRole('button', { name: 'Match blueprints', exact: true }).click();
    await page.getByRole('button', { name: 'Arrange now', exact: true }).click();
    if (engine === 'sam3') {
      await page.getByRole('button', { name: 'Auto place subject', exact: true }).click();
      await expect(page.locator('.studio-subject-status')).toContainText(
        'Subject placed across all formats',
      );
    } else {
      await page.getByRole('button', { name: 'Find subject', exact: true }).click();
      await expect.poll(() => page.evaluate(() => window.subjectFixtureQueries.length)).toBe(2);
    }
    await saved(page);
    const after = await project(page);
    expect(after.campaigns.FI.headline).toBe('FI CAMPAIGN ONLY');
    expect(after.campaigns.FI.subjectSearch.engine).toBe(engine);
    expect(after.banners['FI-300x250'].arrangement).toBeTruthy();
    unchangedMarkets(before, after, 'FI');
    expect(requests).toEqual(engine === 'sam3' ? ['person FI', 'person FI'] : []);
    expect(await page.evaluate(() => window.subjectFixtureQueries)).toEqual(
      engine === 'browser' ? ['person FI', 'person FI'] : [],
    );
    if (engine === 'sam3') {
      await expect(page.getByText('Shared across 8 FI formats', { exact: true })).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath('market-scope-fi.png') });
    }
  });
}

for (const query of ['', '?market=FI']) {
  test(`editor deep link ${query || 'without query'} processes its UK market only`, async ({
    page,
  }) => {
    const requests = [];
    await page.route('**/api/subjects/detect?*', (route) => {
      requests.push(new URL(route.request().url()).searchParams.get('query'));
      return route.fulfill({ json: result });
    });
    const before = await seedMarkets(page);
    await page.goto(`/campaign/UK-300x250/edit${query}`);
    await expect(page.getByRole('heading', { name: 'Edit banner UK / 300 × 250' })).toBeVisible();
    await expect
      .poll(async () => (await project(page)).campaigns.UK.subjectSearch?.engine)
      .toBe('sam3');
    await page.getByRole('button', { name: 'Save banner', exact: true }).click();
    await saved(page);
    unchangedMarkets(before, await project(page), 'UK');
    expect(requests).toEqual(['person UK']);
  });
}

test('switching markets cancels FI placement and rejects its late result while UK stays editable', async ({
  page,
}) => {
  let release;
  const pending = new Promise((resolve) => {
    release = resolve;
  });
  const requests = [];
  await page.route('**/api/subjects/detect?*', async (route) => {
    const query = new URL(route.request().url()).searchParams.get('query');
    requests.push(query);
    if (query === 'person FI') await pending;
    await route.fulfill({ json: result }).catch(() => {});
  });
  const before = await seedMarkets(page, { autoSubject: false, autoArrange: false });
  await page.goto('/campaign?market=FI');
  await page.getByRole('button', { name: 'Auto place subject', exact: true }).click();
  await expect.poll(() => requests).toEqual(['person FI']);
  await expect(page.getByLabel('Headline', { exact: true })).toBeDisabled();
  await page.getByRole('combobox', { name: 'Active market' }).selectOption('UK');
  await expect(page.getByLabel('Headline', { exact: true })).toBeEnabled();
  await expect(page.getByRole('progressbar', { name: 'Automatic subject placement' })).toHaveCount(
    0,
  );
  release();
  await page.getByLabel('Headline', { exact: true }).fill('UK CAMPAIGN ONLY');
  await page.getByRole('button', { name: 'Auto place subject', exact: true }).click();
  await expect(page.locator('.studio-subject-status')).toContainText(
    'Subject placed across all formats',
  );
  await saved(page);
  const after = await project(page);
  unchangedMarkets(before, after, 'UK');
  expect(after.campaigns.UK.subjectFocus.assetId).toBe(before.campaigns.UK.heroAssetId);
  expect(requests).toEqual(['person FI', 'person UK']);
});
