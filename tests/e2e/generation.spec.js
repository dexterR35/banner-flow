import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { unzipSync, strFromU8 } from 'fflate';
const florence = { ready: true, profileId: 'a'.repeat(64), deviceName: 'fixture CPU' };
async function seed(page) {
  await page.route('**/api/subjects/vision/capabilities', (r) =>
    r.fulfill({ json: { qwen: { ready: false }, florence, ocr: { ready: false } } }),
  );
  await page.route('**/api/subjects/vision/reference', (r) =>
    r.fulfill({
      json: {
        schemaVersion: 1,
        engine: 'florence2',
        width: 1024,
        height: 768,
        textRegions: [{ text: 'WIN TODAY', box: { x: 0.1, y: 0.1, width: 0.25, height: 0.08 } }],
        objects: [{ label: 'person', box: { x: 0.4, y: 0.1, width: 0.3, height: 0.8 } }],
        profileId: florence.profileId,
        provenance: {
          model: 'florence-community/Florence-2-base-ft',
          revision: 'b'.repeat(40),
          device: 'cpu',
          coordinateSpace: 'normalized-oriented-preview',
          tasks: ['<OCR_WITH_REGION>', '<OD>'],
        },
      },
    }),
  );
  await page.route('**/api/subjects/health', (r) =>
    r.fulfill({
      json: {
        service: 'bannerflow-sam3',
        schemaVersion: 1,
        ready: false,
        state: 'unavailable',
        loaded: false,
        device: 'CPU',
        issues: [],
      },
    }),
  );
  await page.goto('/');
  await expect(page.getByText('Saved locally', { exact: true })).toBeVisible();
  await page.evaluate(async () => {
    const { initialProject } = await import('/src/data/defaults.js');
    const { saveProject, storeAsset } = await import('/src/core/storage.js');
    const p = initialProject();
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 900;
    const c = canvas.getContext('2d');
    c.fillStyle = '#5f84af';
    c.fillRect(0, 0, 1200, 900);
    c.fillStyle = '#efd8aa';
    c.fillRect(450, 150, 300, 700);
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
    const asset = await storeAsset(
      new File([blob], 'original-hero.png', { type: 'image/png' }),
      'hero',
    );
    p.assets.push(asset);
    Object.assign(p.campaigns.FI, {
      heroAssetId: asset.id,
      headline: 'WIN TODAY',
      subtitle: '',
      cta: 'PLAY NOW',
      legal: '18+',
      autoSubject: false,
      autoArrange: false,
      keepBlueprintBoxes: false,
      typography: 'outfit',
    });
    await saveProject(p);
  });
  await page.goto('/generate?market=FI');
  await expect(page.getByRole('button', { name: 'Generate banner drafts' })).toBeEnabled();
}
test('Create keeps editing and results in green-action nodes', async ({ page }, info) => {
  await seed(page);
  await expect(page.locator('.create-inspector, .generation-review, #create-review')).toHaveCount(
    0,
  );
  await expect(
    page
      .locator('.react-flow__node[data-id="copy"]')
      .getByRole('textbox', { name: 'Finland headline' }),
  ).toHaveValue('WIN TODAY');
  const button = page
    .locator('.react-flow__node[data-id="compose"]')
    .getByRole('button', { name: 'Generate banner drafts' });
  expect(await button.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe(
    'rgb(8, 205, 87)',
  );
  await button.click();
  await expect(page.locator('.react-flow__node[data-id="compose"]')).toContainText(
    '3 of 3 layouts fit',
  );
  await expect(page.locator('.react-flow__node[data-id="output-1"]')).toContainText(
    'Decision evidence',
  );
  await page.screenshot({ path: info.outputPath('node-only-create.png'), fullPage: true });
});
test('connected Create analysis stops when Florence is unavailable', async ({ page }) => {
  await seed(page);
  await page.route('**/api/subjects/vision/capabilities', (r) =>
    r.fulfill({
      json: {
        qwen: { ready: false },
        florence: { ready: false, message: 'Florence checkpoint is missing.' },
      },
    }),
  );
  await page.getByRole('button', { name: 'Generate banner drafts' }).click();
  await expect(page.getByText('Florence checkpoint is missing.')).toBeVisible();
  const project = await page.evaluate(
    async () => await (await import('/src/core/storage.js')).loadProject(),
  );
  expect(project.generationBatches || []).toHaveLength(0);
});
test('Qwen rearranges a banner draft while its saved Blueprint stays unchanged', async ({
  page,
}) => {
  await seed(page);
  await page.evaluate(async () => {
    const { loadProject, saveProject } = await import('/src/core/storage.js');
    const { authorVariant } = await import('/src/core/generation/variants.js');
    const { strictPolicy } = await import('/src/core/generation/contracts.js');
    const p = await loadProject();
    const entry = p.blueprints.find((item) => item.id === 'FI-300x250');
    const revision = entry.versions.find((item) => item.id === entry.activeVersionId);
    revision.blueprint = authorVariant(
      { id: entry.id, marketId: 'FI', width: 300, height: 250 },
      'hero-right',
      strictPolicy(),
      p.campaigns.FI,
    );
    revision.blueprint.layers.find((layer) => layer.id === 'hero').imageFit = 'contain';
    for (const layer of revision.blueprint.layers) layer.lineHeight = 1;
    p.banners[entry.id].override = null;
    p.banners[entry.id].blueprintVersionId = entry.activeVersionId;
    await saveProject(p);
  });
  await page.route('**/api/subjects/vision/capabilities', (r) =>
    r.fulfill({
      json: {
        qwen: { ready: true, profileId: 'qwen-blueprint-fixture' },
        florence,
      },
    }),
  );
  await page.route('**/api/subjects/vision/plan', (r) => {
    const c = r.request().postDataJSON().context;
    const base = c.blueprints.find((item) => item.targetId === 'FI-300x250');
    const headline = base.layers.find((item) => item.source === 'headline');
    return r.fulfill({
      json: {
        plan: {
          schemaVersion: 1,
          planId: 'blueprint-proposal',
          briefRevisionId: c.briefRevisionId,
          copyRevisionId: c.copyRevisionId,
          inputAssetIds: c.assetIds,
          copyPolicy: 'preserve-exact',
          familyId: 'campaign-hero',
          variantPriority: c.variants,
          roleBindings: c.roleBindings,
          styleTokenSetId: c.styleTokenSetId,
          targetPresetIds: c.targetPresetIds,
          allowedOperations: ['move-layer'],
          blueprintEdits: [
            {
              targetId: base.targetId,
              baseRevisionId: base.revisionId,
              layers: [
                {
                  id: headline.id,
                  x: headline.x + 1,
                  y: headline.y,
                  width: headline.width - 1,
                  height: headline.height,
                },
              ],
            },
          ],
          explanation: 'Shift the headline by one pixel.',
          uncertainties: [],
        },
      },
    });
  });
  await page.reload();
  const pinned = await page.evaluate(async () => {
    const p = await (await import('/src/core/storage.js')).loadProject();
    const e = p.blueprints.find((item) => item.id === 'FI-300x250');
    return structuredClone(e.versions.find((item) => item.id === e.activeVersionId).blueprint);
  });
  await page
    .locator('.react-flow__node[data-id="output-1"]')
    .getByRole('button', { name: 'Generate 300 × 250 only' })
    .click();
  await expect(page.locator('.react-flow__node[data-id="output-1"]')).toContainText('0 blockers');
  await expect.poll(async () => page.evaluate(async () =>
    (await (await import('/src/core/storage.js')).loadProject()).generationBatches?.length || 0))
    .toBeGreaterThan(0);
  const state = await page.evaluate(async () => {
    const p = await (await import('/src/core/storage.js')).loadProject();
    const e = p.blueprints.find((item) => item.id === 'FI-300x250');
    return {
      saved: e.versions.find((item) => item.id === e.activeVersionId).blueprint,
      item: p.generationBatches.at(-1).items[0],
    };
  });
  expect(state.item.candidateId).toBe('qwen-blueprint');
  expect(state.saved).toEqual(pinned);
  await expect(page.locator('.react-flow__node[data-id="planner"]')).toContainText('Qwen draft');
  await page
    .locator('.react-flow__node[data-id="output-1"]')
    .getByRole('button', { name: 'Use 300 × 250 in Studio' })
    .click();
  await expect
    .poll(async () =>
      page.evaluate(async () =>
        Boolean(
          (await (await import('/src/core/storage.js')).loadProject()).banners['FI-300x250']
            .override,
        ),
      ),
    )
    .toBe(true);
  const accepted = await page.evaluate(async () => {
    const p = await (await import('/src/core/storage.js')).loadProject();
    const e = p.blueprints.find((item) => item.id === 'FI-300x250');
    return {
      saved: e.versions.find((item) => item.id === e.activeVersionId).blueprint,
      override: p.banners[e.id].override,
    };
  });
  expect(accepted.saved).toEqual(pinned);
  expect(accepted.override.layers.find((layer) => layer.id === 'headline').x).toBe(
    pinned.layers.find((layer) => layer.id === 'headline').x + 1,
  );
});
test('Create connections control outputs and the edited graph survives reload and backup', async ({
  page,
}) => {
  await seed(page);
  await expect(page.locator('.react-flow__node')).toHaveCount(8);
  await expect(page.locator('.react-flow__edge')).toHaveCount(9);
  const outputEdge = page.locator(
    '.react-flow__edge[data-id="edge-compose-drafts-output-3-drafts"]',
  );
  await outputEdge.click();
  await page.keyboard.press('Delete');
  await expect(page.locator('.react-flow__edge')).toHaveCount(8);
  await page.getByRole('button', { name: 'Generate banner drafts' }).click();
  await expect(page.locator('.react-flow__node[data-id="compose"]')).toContainText(
    '2 of 2 layouts fit',
  );
  await expect(page.locator('.react-flow__node[data-id="output-3"]')).toBeVisible();
  const before = await page.evaluate(async () => {
    const p = await (await import('/src/core/storage.js')).loadProject();
    return p.generationFlows.FI.nodes.find((n) => n.id === 'analysis').position;
  });
  const header = page.locator('.react-flow__node[data-id="analysis"] header');
  const box = await header.boundingBox();
  await page.mouse.move(box.x + 40, box.y + 15);
  await page.mouse.down();
  await page.mouse.move(box.x + 90, box.y + 50, { steps: 5 });
  await page.mouse.up();
  await expect
    .poll(async () =>
      page.evaluate(async () => {
        const p = await (await import('/src/core/storage.js')).loadProject();
        return p.generationFlows.FI.nodes.find((n) => n.id === 'analysis').position.x;
      }),
    )
    .toBeGreaterThan(before.x);
  await page.reload();
  await expect(page.locator('.react-flow__edge')).toHaveCount(8);
  const saved = await page.evaluate(async () => {
    const { loadProject } = await import('/src/core/storage.js');
    const { backupProject, importProject } = await import('/src/core/export.js');
    const p = await loadProject();
    const restored = await importProject(await backupProject(p));
    return restored.generationFlows.FI;
  });
  expect(saved.edges).toHaveLength(8);
  expect(saved.nodes.find((n) => n.id === 'analysis').position.x).toBeGreaterThan(before.x);
  const from = await page
    .locator('.react-flow__node[data-id="compose"] .react-flow__handle[data-handleid="drafts"]')
    .boundingBox();
  const to = await page
    .locator('.react-flow__node[data-id="output-3"] .react-flow__handle[data-handleid="drafts"]')
    .boundingBox();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator('.react-flow__edge')).toHaveCount(9);
  await page.getByRole('button', { name: 'Generate banner drafts' }).click();
  await expect(page.locator('.react-flow__node[data-id="compose"]')).toContainText(
    '3 of 3 layouts fit',
  );
});
test('a format node can generate, explain, download and open its own Studio draft', async ({
  page,
}) => {
  await seed(page);
  await page.getByRole('button', { name: 'Add format', exact: true }).click();
  await expect(page.locator('.react-flow__edge')).toHaveCount(10);
  await expect(page.locator('.react-flow__node[data-id="output-4"]')).toContainText('600 × 400');
  const node = page.locator('.react-flow__node[data-id="output-1"]');
  await node.getByRole('button', { name: 'Generate 300 × 250 only' }).click();
  await expect(page.locator('.react-flow__node[data-id="compose"]')).toContainText(
    '1 of 1 layouts fit',
  );
  await expect(node).toContainText('0 blockers');
  await node.getByText('Decision evidence').click();
  await expect(node.getByText('Decision evidence')).toBeVisible();
  const download = page.waitForEvent('download');
  await node.getByRole('button', { name: 'Download 300 × 250 PNG' }).click();
  const png = new Uint8Array(await readFile(await (await download).path()));
  const view = new DataView(png.buffer);
  expect(view.getUint32(16)).toBe(300);
  expect(view.getUint32(20)).toBe(250);
  await node.getByRole('button', { name: 'Use 300 × 250 in Studio' }).click();
  await expect(node.getByRole('button', { name: 'Edit 300 × 250 in Studio' })).toBeVisible();
  await node.getByRole('button', { name: 'Edit 300 × 250 in Studio' }).click();
  await expect(page).toHaveURL(/\/campaign\/[^/]+\/edit\?market=FI/);
});
test('format node runs queue in order while Qwen is working', async ({ page }) => {
  await seed(page);
  await page.route('**/api/subjects/vision/capabilities', (route) =>
    route.fulfill({
      json: { qwen: { ready: true, profileId: 'queue-fixture' }, florence, ocr: { ready: false } },
    }),
  );
  let startFirst,
    releaseFirst,
    calls = 0;
  const started = new Promise((resolve) => {
    startFirst = resolve;
  });
  const release = new Promise((resolve) => {
    releaseFirst = resolve;
  });
  await page.route('**/api/subjects/vision/plan', async (route) => {
    calls++;
    if (calls === 1) {
      startFirst();
      await release;
    }
    await route.fulfill({ json: { plan: {} } });
  });
  await page
    .locator('.react-flow__node[data-id="output-1"]')
    .getByRole('button', { name: 'Generate 300 × 250 only' })
    .click();
  await started;
  await page
    .locator('.react-flow__node[data-id="output-2"]')
    .getByRole('button', { name: 'Queue 728 × 90 only' })
    .click();
  await expect(page.locator('.react-flow__node[data-id="output-2"]')).toContainText('queued');
  releaseFirst();
  await expect
    .poll(async () =>
      page.evaluate(
        async () =>
          (await (await import('/src/core/storage.js')).loadProject()).generationRuns?.length || 0,
      ),
    )
    .toBe(2);
  const runs = await page.evaluate(async () => {
    const p = await (await import('/src/core/storage.js')).loadProject();
    return p.generationBatches.slice(-2).map((batch) => batch.outputNodeIds);
  });
  expect(runs).toEqual([['output-1'], ['output-2']]);
});
test('node-owned copy, planner, layout and format settings persist', async ({ page }) => {
  await seed(page);
  await page
    .getByRole('textbox', { name: 'Creative brief in copy node' })
    .fill('Keep the CTA clear of the subject');
  await page.locator('.react-flow__node[data-id="planner"] input[type="checkbox"]').uncheck();
  await page.getByLabel('Fit all layouts').uncheck();
  const format = page.locator('.react-flow__node[data-id="output-1"]');
  await format.getByRole('spinbutton', { name: 'Custom width' }).fill('600');
  await format.getByRole('spinbutton', { name: 'Custom width' }).press('Tab');
  await format.getByRole('spinbutton', { name: 'Custom height' }).fill('400');
  await format.getByRole('spinbutton', { name: 'Custom height' }).press('Tab');
  await expect(
    page.getByRole('button', { name: 'Generate Qwen layout suggestions' }),
  ).toBeDisabled();
  await expect
    .poll(async () =>
      page.evaluate(async () => {
        const p = await (await import('/src/core/storage.js')).loadProject();
        const nodes = p.generationFlows?.FI?.nodes;
        return (
          nodes && [
            nodes.find((n) => n.kind === 'copy').data.brief,
            nodes.find((n) => n.kind === 'planner').data.enabled,
            nodes.find((n) => n.kind === 'compose').data.manualLayouts,
            nodes.find((n) => n.id === 'output-1').data.width,
          ]
        );
      }),
    )
    .toEqual(['Keep the CTA clear of the subject', false, true, 600]);
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Creative brief in copy node' })).toHaveValue(
    'Keep the CTA clear of the subject',
  );
  await expect(page.locator('.react-flow__node[data-id="output-1"]')).toContainText('600 × 400');
});
test('image and exact copy inputs can be updated from Create without losing originals', async ({
  page,
}) => {
  await seed(page);
  const before = await page.evaluate(async () => {
    const p = await (await import('/src/core/storage.js')).loadProject();
    return { id: p.campaigns.FI.heroAssetId, uk: p.campaigns.UK.headline };
  });
  await page.locator('.react-flow__node[data-id="copy"]').click();
  await page.getByRole('textbox', { name: 'Finland headline' }).fill('NEW OFFER');
  const dataUrl = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 200;
    canvas.getContext('2d').fillRect(0, 0, 200, 200);
    return canvas.toDataURL('image/png');
  });
  await page.getByLabel('Upload campaign image from node').setInputFiles({
    name: 'replacement.png',
    mimeType: 'image/png',
    buffer: Buffer.from(dataUrl.split(',')[1], 'base64'),
  });
  await expect
    .poll(async () =>
      page.evaluate(async () => {
        const p = await (await import('/src/core/storage.js')).loadProject();
        return p.campaigns.FI.heroAssetId;
      }),
    )
    .not.toBe(before.id);
  const after = await page.evaluate(async () => {
    const p = await (await import('/src/core/storage.js')).loadProject();
    const { getAsset } = await import('/src/core/storage.js');
    return {
      headline: p.campaigns.FI.headline,
      uk: p.campaigns.UK.headline,
      oldAsset: Boolean(
        await getAsset(p.assets.find((asset) => asset.id !== p.campaigns.FI.heroAssetId).id),
      ),
    };
  });
  expect(after).toEqual({ headline: 'NEW OFFER', uk: before.uk, oldAsset: true });
});
test('strict generation reviews, freezes, exports, accepts, reloads and undoes three targets', async ({
  page,
}, info) => {
  await seed(page);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.getByRole('button', { name: 'Generate banner drafts' }).click();
  await expect(page.locator('.react-flow__node[data-id="compose"]')).toContainText(
    '3 of 3 layouts fit',
  );
  await page.screenshot({ path: info.outputPath('strict-generation.png'), fullPage: true });
  const data = await page.evaluate(async () => {
    const p = await (await import('/src/core/storage.js')).loadProject();
    return p.generationBatches?.at(-1);
  });
  await expect
    .poll(async () =>
      page.evaluate(async () =>
        Boolean(
          (await (await import('/src/core/storage.js')).loadProject()).generationBatches?.length,
        ),
      ),
    )
    .toBe(true);
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export generated drafts' }).click();
  const zip = unzipSync(new Uint8Array(await readFile(await (await dl).path()))),
    manifest = JSON.parse(strFromU8(zip['manifest.json']));
  expect(manifest.targets).toHaveLength(3);
  expect(manifest.counts.succeeded).toBe(3);
  for (const item of manifest.targets) {
    const v = new DataView(zip[item.filename].buffer);
    expect(v.getUint32(16)).toBe(item.target.width);
    expect(v.getUint32(20)).toBe(item.target.height);
    expect(item.sha256).toHaveLength(64);
  }
  const parity = await page.evaluate(async () => {
    const { loadProject, loadResources } = await import('/src/core/storage.js');
    const { renderOutput } = await import('/src/core/export.js');
    const { canvasOf, renderFrame } = await import('/src/core/render.js');
    const p = await loadProject(),
      b = p.generationBatches.at(-1),
      r = await loadResources(b.snapshot.campaign),
      item = b.items[0];
    const c = canvasOf(item.target.width, item.target.height);
    renderFrame(c, item.scene, b.snapshot.campaign, r);
    const a = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    const image = await createImageBitmap(await renderOutput(item.scene, b.snapshot.campaign, r));
    c.getContext('2d').drawImage(image, 0, 0);
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    return a.every((v, i) => v === d[i]);
  });
  expect(parity).toBe(true);
  await page.getByRole('button', { name: 'Use valid drafts in Studio' }).click();
  await expect(
    page
      .locator('.react-flow__node[data-id="compose"]')
      .getByRole('button', { name: 'Undo generation' }),
  ).toBeVisible();
  await expect(page.getByText('Saved locally', { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Undo generation' }).click();
  await expect(page.getByText('Previous banners restored.')).toBeVisible();
  expect(errors).toEqual([]);
});
test('long copy blocks strips without changing source, and optional planner falls back', async ({
  page,
}, info) => {
  await seed(page);
  await page.evaluate(async () => {
    const s = await import('/src/core/storage.js');
    const p = await s.loadProject();
    p.campaigns.FI.headline = 'Required text with Romanian diacritics ȘȚ '.repeat(40);
    await s.saveProject(p);
  });
  await page.reload();
  await page.route('**/api/subjects/vision/capabilities', (r) =>
    r.fulfill({ json: { qwen: { ready: false }, florence } }),
  );
  await page.locator('.react-flow__node[data-id="planner"]').click();
  await expect(page.getByLabel('Use Qwen planner')).toBeChecked();
  await page.getByRole('button', { name: 'Generate banner drafts' }).click();
  await expect(page.locator('.react-flow__node[data-id="planner"]')).toContainText(
    'Qwen unavailable',
  );
  await expect(page.locator('.create-node-blocked').first()).toBeVisible();
  await page.screenshot({ path: info.outputPath('strict-blockers.png'), fullPage: true });
  const p = await page.evaluate(
    async () => await (await import('/src/core/storage.js')).loadProject(),
  );
  expect(p.campaigns.FI.headline).toBe('Required text with Romanian diacritics ȘȚ '.repeat(40));
});
test('asset corrections and analyses survive verified backup restore; fenced jobs discard stale commits', async ({
  page,
}) => {
  await seed(page);
  const result = await page.evaluate(async () => {
    const { loadProject } = await import('/src/core/storage.js');
    const { saveCorrection, getRecord, enqueueJob, leaseJob, commitJob, cancelJob } =
      await import('/src/core/generation/store.js');
    const { backupProject, importProject } = await import('/src/core/export.js');
    const p = await loadProject(),
      id = p.assets[0].id;
    await saveCorrection(id, {
      tags: ['football', 'rotiri'],
      focal: { x: 0.3, y: 0.1, width: 0.4, height: 0.8 },
      ocrText: 'Baked offer',
    });
    const archive = await backupProject(p);
    const { set } = await import('/node_modules/.vite/deps/idb-keyval.js');
    await set(`asset:${id}`, new Blob(['corrupted cache']));
    const restored = await importProject(archive);
    const { getAsset, putAsset } = await import('/src/core/storage.js');
    const { digest } = await import('/src/core/generation/fingerprint.js');
    if ((await digest(await (await getAsset(id)).arrayBuffer())) !== id)
      throw new Error('Original repair failed');
    let rejected = false;
    try {
      await putAsset(id, new Blob(['forged bytes']));
    } catch {
      rejected = true;
    }
    if (!rejected) throw new Error('Immutable write accepted forged bytes');
    const { assertBatchCorrectionsCurrent } = await import('/src/core/generation/batch.js');
    let stale = false;
    try {
      await assertBatchCorrectionsCurrent({
        snapshot: { campaign: { heroAssetId: id } },
        correction: null,
      });
    } catch {
      stale = true;
    }
    if (!stale) throw new Error('Stale corrections were accepted');
    await enqueueJob('fixture', { a: 1 }, 0);
    const old = await leaseJob('fixture', 'old', 0, 10);
    const fresh = await leaseJob('fixture', 'new', 11, 10);
    const late = await commitJob('fixture', 'old', old.token, { bad: true }, 12);
    const good = await commitJob('fixture', 'new', fresh.token, { good: true }, 12);
    await enqueueJob('cancel', {});
    const job = await leaseJob('cancel', 'worker');
    await cancelJob('cancel');
    const cancelled = await commitJob('cancel', 'worker', job.token, {});
    return {
      same: restored.assets[0].id === id,
      correction: await getRecord(`correction:${id}`),
      late,
      good,
      cancelled,
    };
  });
  expect(result.same).toBe(true);
  expect(result.correction.value.tags).toContain('rotiri');
  expect(result.late).toBe(false);
  expect(result.good).toBe(true);
  expect(result.cancelled).toBe(false);
  await page.goto('/assets?market=FI');
  await page.getByLabel('Search assets').fill('rotiri');
  await expect(page.getByRole('heading', { name: 'original-hero.png' })).toBeVisible();
});

test('multi-market generation exports every target and stays usable on mobile', async ({
  page,
}, info) => {
  await seed(page);
  await page.evaluate(async () => {
    const s = await import('/src/core/storage.js');
    const p = await s.loadProject();
    p.campaigns.UK = {
      ...p.campaigns.UK,
      ...p.campaigns.FI,
      headline: 'PLAY TODAY',
      legal: '18+ UK',
    };
    await s.saveProject(p);
  });
  await page.reload();
  await page.getByLabel('Market for new formats').selectOption('UK');
  await page.getByRole('button', { name: 'Add market formats' }).click();
  await page.getByRole('button', { name: 'Generate banner drafts' }).click();
  await expect(page.locator('.react-flow__node[data-id="compose"]')).toContainText(
    'Finland: 3 of 3 layouts fit',
  );
  await expect(page.locator('.react-flow__node[data-id="compose"]')).toContainText(
    'United Kingdom: 3 of 3 layouts fit',
  );
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export entire market matrix' }).click();
  const zip = unzipSync(new Uint8Array(await readFile(await (await dl).path()))),
    manifest = JSON.parse(strFromU8(zip['manifest.json']));
  expect(manifest.targets).toHaveLength(6);
  expect(manifest.counts.succeeded).toBe(6);
  expect(new Set(manifest.targets.map((t) => t.market)).size).toBe(2);
  await page.getByRole('button', { name: 'Use valid drafts in Studio' }).click();
  await expect
    .poll(async () =>
      page.evaluate(async () => {
        const project = await (await import('/src/core/storage.js')).loadProject();
        return project.generationUndo?.accepted.length;
      }),
    )
    .toBe(6);
  await page.getByRole('button', { name: 'Undo generation' }).click();
  await expect(page.getByText('Previous banners restored.')).toBeVisible();
  const { writeFile } = await import('node:fs/promises');
  for (const item of manifest.targets.filter((t) => t.market === 'FI'))
    await writeFile(
      info.outputPath(`native-${item.target.width}x${item.target.height}.png`),
      zip[item.filename],
    );
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('button', { name: 'Add format', exact: true })).toBeVisible();
  expect(
    await page
      .locator('.create-graph-toolbar')
      .evaluate((element) => element.getBoundingClientRect().top),
  ).toBeGreaterThan(0);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  ).toBe(true);
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  await page.screenshot({ path: info.outputPath('create-mobile.png'), fullPage: true });
  await page.screenshot({ path: info.outputPath('generation-mobile.png'), fullPage: true });
});

test('GIF import preserves original bytes and creates reusable timestamped frames', async ({
  page,
}, info) => {
  await seed(page);
  await page.goto('/assets?market=FI');
  const { default: gifenc } = await import('gifenc');
  const { GIFEncoder } = gifenc;
  const gif = GIFEncoder();
  const palette = [
    [20, 40, 60],
    [220, 80, 20],
  ];
  gif.writeFrame(new Uint8Array(64 * 48).fill(0), 64, 48, { palette, delay: 70 });
  gif.writeFrame(new Uint8Array(64 * 48).fill(1), 64, 48, { palette, delay: 130 });
  gif.finish();
  const bytes = Buffer.from(gif.bytes());
  await page
    .getByLabel('Import GIF or video frames')
    .setInputFiles({ name: 'timed-source.gif', mimeType: 'image/gif', buffer: bytes });
  await expect(
    page.getByText(
      'Original media and sampled PNG frames saved. Choose a frame to use in a campaign.',
    ),
  ).toBeVisible();
  await expect(page.getByText('Saved locally', { exact: true })).toBeVisible();
  const media = await page.evaluate(async () => {
    const s = await import('/src/core/storage.js');
    const p = await s.loadProject(),
      source = p.assets.find((a) => a.kind === 'media');
    return {
      source,
      original: Array.from(new Uint8Array(await (await s.getAsset(source.id)).arrayBuffer())),
      frames: p.assets.filter((a) => a.derivedFrom === source.id),
    };
  });
  expect(media.original).toEqual([...bytes]);
  expect(media.frames.map((f) => f.timestampMs)).toEqual([0, 70]);
  expect(media.frames.map((f) => f.durationMs)).toEqual([70, 130]);
  await page
    .locator('.intelligence-card')
    .filter({ hasText: 'timed-source.gif-frame-1-70ms.png' })
    .getByRole('button', { name: 'Use in campaign image', exact: true })
    .click();
  await expect(page.getByText('Asset bound to Finland.')).toBeVisible();
  await page.screenshot({ path: info.outputPath('asset-library.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  ).toBe(true);
  await page.screenshot({ path: info.outputPath('asset-library-mobile.png'), fullPage: true });
});

test('automatic analysis feeds Qwen, preserves copy, and respects a later manual focus', async ({
  page,
}, info) => {
  await seed(page);
  const calls = [],
    contexts = [];
  await page.route('**/api/subjects/vision/capabilities', (r) =>
    r.fulfill({
      json: {
        qwen: { ready: true, installed: true, profileId: 'fixture-qwen-profile' },
        florence,
        ocr: { ready: true },
      },
    }),
  );
  await page.route('**/api/subjects/health', (r) =>
    r.fulfill({
      json: {
        service: 'bannerflow-sam3',
        schemaVersion: 1,
        ready: true,
        state: 'available',
        loaded: false,
        device: 'CPU',
        issues: [],
      },
    }),
  );
  await page.route('**/api/subjects/detect?*', (r) => {
    calls.push('sam');
    return r.fulfill({
      json: {
        service: 'bannerflow-sam3',
        schemaVersion: 1,
        engine: 'sam3',
        detections: [
          { label: 'person', score: 0.95, box: { xmin: 0.36, ymin: 0.15, xmax: 0.64, ymax: 0.95 } },
        ],
      },
    });
  });
  await page.route('**/api/subjects/vision/ocr', (r) =>
    r.fulfill({ json: { ocr: [], provenance: { engine: 'fixture' } } }),
  );
  await page.route('**/api/subjects/vision/plan', (r) => {
    calls.push('qwen');
    const { context: c, image } = r.request().postDataJSON();
    expect(image.length).toBeGreaterThan(100);
    contexts.push(c);
    const firstBlueprint = c.blueprints?.[0];
    const firstHeadline = firstBlueprint?.layers.find((layer) => layer.source === 'headline');
    return r.fulfill({
      json: {
        plan: {
          schemaVersion: 1,
          planId: 'fixture-plan',
          briefRevisionId: c.briefRevisionId,
          copyRevisionId: c.copyRevisionId,
          inputAssetIds: c.assetIds,
          copyPolicy: 'preserve-exact',
          familyId: 'campaign-hero',
          variantPriority: ['hero-left', ...c.variants.filter((v) => v !== 'hero-left')],
          roleBindings: c.roleBindings,
          styleTokenSetId: c.styleTokenSetId,
          targetPresetIds: c.targetPresetIds,
          allowedOperations: ['choose-variant', 'crop-photo', 'fit-text'],
          ...(firstHeadline
            ? {
                blueprintEdits: [
                  {
                    targetId: firstBlueprint.targetId,
                    baseRevisionId: firstBlueprint.revisionId,
                    layers: [
                      {
                        id: firstHeadline.id,
                        x: firstHeadline.x + 1,
                        y: firstHeadline.y,
                        width: firstHeadline.width - 1,
                        height: firstHeadline.height,
                      },
                    ],
                  },
                ],
              }
            : {}),
          explanation: 'Leave clear space beside the subject.',
          uncertainties: [],
        },
        provenance: { model: 'Qwen fixture' },
      },
    });
  });
  await page.reload();
  await expect(page.getByLabel('Fit all layouts')).toBeChecked();
  await page.locator('.react-flow__node[data-id="planner"]').click();
  await expect(page.getByLabel('Use Qwen planner')).toBeChecked();
  await page
    .locator('.react-flow__node[data-id="planner"]')
    .getByRole('button', { name: 'Generate Qwen layout suggestions' })
    .click();
  await expect(page.locator('.react-flow__node[data-id="compose"]')).toContainText(
    '3 of 3 layouts fit',
  );
  await expect(page.getByText(/Planned with Qwen/)).toBeVisible();
  expect(calls).toEqual(['sam', 'qwen']);
  expect(contexts[0].copy.headline).toBe('WIN TODAY');
  expect(contexts[0].targets).toHaveLength(3);
  expect(contexts[0].focus.width).toBeCloseTo(0.28);
  expect(contexts[0].visual.palette.length).toBeGreaterThan(0);
  expect(contexts[0].ocr.map((region) => region.text)).toEqual(['WIN TODAY']);
  expect(contexts[0].blueprints.length).toBeGreaterThan(0);
  const plannerNode = page.locator('.react-flow__node[data-id="planner"]');
  await expect(plannerNode.getByLabel('Blueprint shown in Qwen node')).toBeVisible();
  await expect(plannerNode.getByRole('img', { name: /Saved default/ })).toBeVisible();
  await expect(plannerNode.getByRole('img', { name: /draft/i })).toBeVisible();
  await page.screenshot({ path: info.outputPath('qwen-automatic-review.png'), fullPage: true });
  await expect(page.getByText('Saved locally', { exact: true })).toBeVisible();
  const manual = { x: 0.3, y: 0.1, width: 0.4, height: 0.85 };
  await page.evaluate(async (box) => {
    const s = await import('/src/core/storage.js');
    const p = await s.loadProject();
    const b = p.generationBatches.at(-1);
    if (b.analysis.focusSource !== 'sam3') throw new Error('Analysis not frozen');
    if (p.campaigns.FI.subjectFocus) throw new Error('Analysis mutated campaign');
    p.campaigns.FI.subjectFocus = {
      id: 'manual-fixture',
      source: 'manual',
      label: 'Selected region',
      box,
      assetId: p.campaigns.FI.heroAssetId,
    };
    await s.saveProject(p);
  }, manual);
  await page.reload();
  await page.getByRole('button', { name: 'Generate banner drafts' }).click();
  await expect(page.getByText(/Subject placement: manual/)).toBeVisible();
  expect(calls).toEqual(['sam', 'qwen', 'qwen']);
  expect(contexts[1].focus).toEqual(manual);
});

test('cancelled Qwen planning cannot publish a late result', async ({ page }) => {
  await seed(page);
  await page.route('**/api/subjects/vision/capabilities', (r) =>
    r.fulfill({ json: { qwen: { ready: true, profileId: 'pending-fixture' }, florence } }),
  );
  let release, requested;
  const started = new Promise((r) => {
    requested = r;
  });
  const finish = new Promise((r) => {
    release = r;
  });
  await page.route('**/api/subjects/vision/plan', async (r) => {
    requested();
    await finish;
    await r.fulfill({ json: { plan: {} } }).catch(() => {});
  });
  await page.getByRole('button', { name: 'Generate banner drafts' }).click();
  await started;
  await page.getByRole('button', { name: 'Cancel generation' }).click();
  release();
  await expect(page.getByText('Graph run cancelled; previous drafts were retained.')).toBeVisible();
  expect(await page.locator('.create-node-output-actions').count()).toBe(0);
  const count = await page.evaluate(
    async () =>
      (await (await import('/src/core/storage.js')).loadProject()).generationBatches?.length || 0,
  );
  expect(count).toBe(0);
});

test('contain keeps reference crop bounds and native PNG pixels', async ({ page }, info) => {
  await seed(page);
  const result = await page.evaluate(async () => {
    const { drawLayer } = await import('/src/core/render.js');
    const { authorVariant } = await import('/src/core/generation/variants.js');
    const { strictPolicy } = await import('/src/core/generation/contracts.js');
    const source = document.createElement('canvas');
    source.width = 300;
    source.height = 100;
    const s = source.getContext('2d');
    s.fillStyle = '#ff0000';
    s.fillRect(0, 0, 300, 100);
    s.fillStyle = '#00ff00';
    s.fillRect(100, 0, 100, 100);
    const bp = authorVariant(
      { id: 'fixture', marketId: 'FI', width: 300, height: 250 },
      'hero-right',
      strictPolicy(),
      {},
    );
    const layer = {
      ...bp.layers.find((l) => l.type === 'image'),
      x: 0,
      y: 0,
      width: 200,
      height: 100,
      imageFit: 'contain',
      focalX: 0.5,
      focalY: 0.5,
      zoom: 1,
      fade: 0,
    };
    const c = document.createElement('canvas');
    c.width = 200;
    c.height = 100;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#0000ff';
    ctx.fillRect(0, 0, 200, 100);
    drawLayer(ctx, layer, {}, { hero: source, heroCrop: [100, 0, 100, 100] }, bp);
    const pixel = (x, y) => Array.from(ctx.getImageData(x, y, 1, 1).data);
    const url = c.toDataURL();
    const exported = await createImageBitmap(await new Promise((r) => c.toBlob(r)));
    const before = Array.from(ctx.getImageData(0, 0, 200, 100).data);
    ctx.drawImage(exported, 0, 0);
    const after = ctx.getImageData(0, 0, 200, 100).data;
    return {
      left: pixel(10, 50),
      center: pixel(100, 50),
      right: pixel(190, 50),
      parity: before.every((v, i) => v === after[i]),
      url,
    };
  });
  expect(result.left).toEqual([0, 0, 255, 255]);
  expect(result.center).toEqual([0, 255, 0, 255]);
  expect(result.right).toEqual([0, 0, 255, 255]);
  expect(result.parity).toBe(true);
  await info.attach('contain-reference-crop', {
    body: Buffer.from(result.url.split(',')[1], 'base64'),
    contentType: 'image/png',
  });
});

test('explicit retry after temporary Qwen failure gets a new fenced result revision', async ({
  page,
}) => {
  await seed(page);
  const result = await page.evaluate(async () => {
    const { enqueueJob, leaseJob, commitJob, getRecord } =
      await import('/src/core/generation/store.js');
    const key = 'planner-retry-fixture';
    await enqueueJob(key, {});
    const first = await leaseJob(key, 'first');
    await commitJob(key, 'first', first.token, {
      planner: { fallback: true, reason: 'Insufficient free VRAM' },
    });
    await enqueueJob(key, {}, Date.now(), { retryFallback: true });
    const second = await leaseJob(key, 'second');
    const stale = await commitJob(key, 'first', first.token, { planner: { plan: {} } });
    const accepted = await commitJob(key, 'second', second.token, {
      planner: { plan: { explanation: 'Memory is now available.' } },
    });
    await enqueueJob(key, {}, Date.now(), { retryFallback: true });
    const cached = (await getRecord('ledger')).jobs[key];
    return { first: first.token, second: second.token, stale, accepted, cached: cached.state };
  });
  expect(result.second).toBeGreaterThan(result.first);
  expect(result.stale).toBe(false);
  expect(result.accepted).toBe(true);
  expect(result.cached).toBe('succeeded');
});
