import { test, expect } from '@playwright/test';
import { readBlueprint } from './helpers/editor.js';

test('legacy duplicate Joker5 references collapse to one artboard and export per current size', async ({
  page,
}) => {
  await page.goto('/campaign?market=JOKER5');
  await expect(page.getByText('Saved locally', { exact: true })).toBeVisible();
  await page.evaluate(async () => {
    const { loadProject, saveProject } = await import('/src/core/storage.js');
    const { newEntry } = await import('/src/data/defaults.js');
    const { JOKER5_REFERENCES, createJoker5Blueprint } = await import('/src/data/joker5.js');
    const p = await loadProject();
    p.blueprints = p.blueprints.filter((e) => e.marketId !== 'JOKER5');
    p.banners = Object.fromEntries(
      Object.entries(p.banners).filter(([id]) => !id.startsWith('JOKER5')),
    );
    for (const r of JOKER5_REFERENCES) {
      const bp = createJoker5Blueprint(r);
      bp.layers[0].fade = 0;
      delete bp.layers[0].fadeMesh;
      const e = newEntry(bp);
      e.variantLabel = r.label;
      p.blueprints.push(e);
      p.banners[e.id] = { blueprintVersionId: e.activeVersionId, override: null, history: [] };
    }
    await saveProject(p);
  });
  await page.reload();
  await expect(page.locator('.banner-card')).toHaveCount(11);
  await expect(page.getByText('Saved locally', { exact: true })).toBeVisible();
  const result = await page.evaluate(async () => {
    const { loadProject, loadResources } = await import('/src/core/storage.js');
    const { exportSet, backupProject, importProject } = await import('/src/core/export.js');
    const { unzipSync, strFromU8 } = await import('/node_modules/fflate/esm/browser.js');
    const p = await loadProject(),
      entries = p.blueprints.filter((e) => e.marketId === 'JOKER5');
    const files = unzipSync(
      new Uint8Array(
        await (
          await exportSet(
            entries,
            p,
            p.campaigns.JOKER5,
            await loadResources(p.campaigns.JOKER5),
            'png',
            () => {},
          )
        ).arrayBuffer(),
      ),
    );
    const manifest = JSON.parse(strFromU8(files['manifest.json']));
    const restored = await importProject(await backupProject(p));
    return {
      outputs: manifest.outputs.map((o) => `${o.width}x${o.height}`),
      archived: restored.consolidatedReferences.length,
    };
  });
  expect(result.outputs).toHaveLength(11);
  expect(new Set(result.outputs).size).toBe(11);
  expect(result.archived).toBe(11);
  await page.goto('/blueprints/JOKER5-300x250-chest?market=JOKER5');
  await expect(page.getByRole('link', { name: /Additional reference/ })).toHaveAttribute(
    'href',
    '/references/joker5 part2/300x250.png',
  );
  await page.screenshot({ path: 'docs/verification/joker5/one-size-two-references.png' });
});

test('blueprint image fade and shadow are editable, saved per size and shared with PNG export', async ({
  page,
}) => {
  await page.goto('/blueprints/JOKER5-300x250/edit?market=JOKER5');
  await page.getByRole('button', { name: 'hero', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Fade shape', exact: true })).toHaveValue('mesh');
  await expect(page.getByLabel('Fade points', { exact: true })).toHaveValue('16');
  const before = await readBlueprint(page);
  expect(before.layers[0].fadeDirection).toBe('left');
  await page.getByRole('checkbox', { name: 'Image shadow', exact: true }).check();
  await page.getByLabel('Shadow color', { exact: true }).fill('#ee4466');
  await page.getByLabel('Shadow horizontal', { exact: true }).fill('-12');
  await page.getByLabel('Shadow blur', { exact: true }).fill('15');
  await page.getByRole('slider', { name: 'Fade softness', exact: true }).fill('0.4');
  await page.getByRole('button', { name: 'Save blueprint', exact: true }).click();
  await expect(page.getByText('Saved locally', { exact: true })).toBeVisible();
  await page.goto('/campaign/JOKER5-300x250/edit?market=JOKER5');
  await page.getByRole('button', { name: 'hero', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'Image shadow', exact: true })).toBeChecked();
  await page.getByRole('button', { name: 'Edit fade points', exact: true }).click();
  await page.screenshot({ path: 'docs/verification/joker5/editable-effects.png' });
  const result = await page.evaluate(async () => {
    const { loadProject, loadResources } = await import('/src/core/storage.js');
    const { resolveBanner } = await import('/src/data/defaults.js');
    const { renderFrame } = await import('/src/core/render.js');
    const { renderOutput } = await import('/src/core/export.js');
    const p = await loadProject(),
      e = p.blueprints.find((e) => e.id === 'JOKER5-300x250'),
      bp = resolveBanner(e, p.banners[e.id]),
      r = await loadResources(p.campaigns.JOKER5);
    const c = document.createElement('canvas');
    c.width = bp.width;
    c.height = bp.height;
    renderFrame(c, bp, p.campaigns.JOKER5, r);
    const a = c.getContext('2d').getImageData(0, 0, bp.width, bp.height).data;
    const im = await createImageBitmap(await renderOutput(bp, p.campaigns.JOKER5, r));
    c.getContext('2d').drawImage(im, 0, 0);
    const b = c.getContext('2d').getImageData(0, 0, bp.width, bp.height).data;
    const off = structuredClone(bp);
    off.layers[0].shadow.enabled = false;
    renderFrame(c, off, p.campaigns.JOKER5, r);
    const noShadow = c.getContext('2d').getImageData(0, 0, bp.width, bp.height).data;
    const gif = await createImageBitmap(await renderOutput(bp, p.campaigns.JOKER5, r, 'gif'));
    c.getContext('2d').drawImage(gif, 0, 0);
    gif.close();
    const gifPixels = c.getContext('2d').getImageData(0, 0, bp.width, bp.height).data;
    const gifError =
      a.reduce((sum, value, i) => sum + Math.abs(value - gifPixels[i]), 0) / a.length;
    const other = p.blueprints.find((e) => e.id === 'JOKER5-180x150');
    return {
      equal: a.every((v, i) => v === b[i]),
      effect: a.some((v, i) => v !== noShadow[i]),
      otherShadow: resolveBanner(other, p.banners[other.id]).layers[0].shadow,
      versions: e.versions.length,
      gifError,
    };
  });
  expect(result.equal).toBe(true);
  expect(result.effect).toBe(true);
  expect(result.otherShadow).toBeUndefined();
  expect(result.versions).toBe(2);
  expect(result.gifError).toBeLessThan(6);
});

test('Joker5 sizes keep native boxes and export exactly the preview pixels', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/campaign?market=JOKER5');
  await expect(page.getByText('Saved locally', { exact: true })).toBeVisible();
  await expect(page.locator('.banner-card')).toHaveCount(11);
  await expect(page.getByRole('button', { name: 'Match blueprints', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.locator('.banner-card canvas').first()).toBeVisible();
  await page.screenshot({ path: 'docs/verification/joker5/studio-desktop.png' });
  const result = await page.evaluate(async () => {
    const { loadProject, loadResources } = await import('/src/core/storage.js');
    const { activeRevision } = await import('/src/data/defaults.js');
    const { arrangeMarket } = await import('/src/hooks/useAutoArrange.js');
    const { renderFrame, boundText } = await import('/src/core/render.js');
    const { renderOutput } = await import('/src/core/export.js');
    const { fitText } = await import('/src/core/text-fit.js');
    const project = await loadProject(),
      campaign = project.campaigns.JOKER5;
    const resources = await loadResources(campaign);
    const entries = project.blueprints.filter((e) => e.marketId === 'JOKER5');
    const arranged = arrangeMarket(project, 'JOKER5', resources);
    const changed = {
      ...project,
      campaigns: {
        ...project.campaigns,
        JOKER5: { ...campaign, headline: 'A much longer offer headline for every Joker5 format' },
      },
    };
    const long = arrangeMarket(changed, 'JOKER5', resources);
    const checks = [];
    const host = document.createElement('div');
    host.id = 'joker-checks';
    host.style =
      'position:absolute;inset:0 auto auto 0;z-index:99999;background:#303030;color:white;padding:20px;width:1540px';
    document.body.append(host);
    for (const [index, entry] of entries.entries()) {
      const bp = activeRevision(entry).blueprint;
      const canvas = document.createElement('canvas');
      canvas.width = bp.width;
      canvas.height = bp.height;
      renderFrame(canvas, bp, campaign, resources);
      const exported = await createImageBitmap(await renderOutput(bp, campaign, resources));
      const copy = document.createElement('canvas');
      copy.width = bp.width;
      copy.height = bp.height;
      copy.getContext('2d').drawImage(exported, 0, 0);
      exported.close();
      const a = canvas.getContext('2d').getImageData(0, 0, bp.width, bp.height).data;
      const b = copy.getContext('2d').getImageData(0, 0, bp.width, bp.height).data;
      checks.push({
        id: entry.id,
        equal: a.every((v, i) => v === b[i]),
        boxes:
          JSON.stringify(bp.layers) ===
          JSON.stringify(arranged.banners[entry.id].arrangement.layers),
        longBoxes:
          JSON.stringify(bp.layers) === JSON.stringify(long.banners[entry.id].arrangement.layers),
        fits: bp.layers
          .filter((l) => l.type === 'text')
          .every(
            (l) => !fitText(canvas.getContext('2d'), boundText(l, campaign), l, resources).overflow,
          ),
      });
      let group = document.getElementById(`joker-group-${Math.floor(index / 5)}`);
      if (!group) {
        group = document.createElement('div');
        group.id = `joker-group-${Math.floor(index / 5)}`;
        host.append(group);
      }
      const row = document.createElement('div');
      row.style = 'padding:12px 0;white-space:nowrap';
      const title = document.createElement('div');
      title.textContent = `${bp.name}: source / editable render`;
      row.append(title);
      const source = new Image();
      source.src = `/references/${entry.reference}`;
      await source.decode();
      source.style = 'margin-right:20px;vertical-align:top';
      canvas.style = 'vertical-align:top';
      row.append(source, canvas);
      group.append(row);
    }
    return {
      checks,
      fiUnchanged:
        JSON.stringify(project.banners['FI-300x250']) ===
        JSON.stringify(arranged.banners['FI-300x250']),
    };
  });
  expect(result.fiUnchanged).toBe(true);
  for (const check of result.checks) {
    expect(check.equal, check.id).toBe(true);
    expect(check.boxes, check.id).toBe(true);
    expect(check.longBoxes, check.id).toBe(true);
    expect(check.fits, check.id).toBe(true);
  }
  for (let i = 0; i < 3; i++)
    await page
      .locator(`#joker-group-${i}`)
      .screenshot({ path: `docs/verification/joker5/comparison-${i}.png` });
  expect(errors).toEqual([]);
});

test('existing workspaces gain unique Joker5 sizes and keep edits after reload', async ({
  page,
}) => {
  await page.goto('/campaign?market=FI');
  await expect(page.getByText('Saved locally', { exact: true })).toBeVisible();
  const before = await page.evaluate(async () => {
    const { loadProject, saveProject } = await import('/src/core/storage.js');
    const p = await loadProject();
    p.markets = p.markets.filter((m) => m.id !== 'JOKER5');
    delete p.campaigns.JOKER5;
    p.blueprints = p.blueprints.filter((e) => e.marketId !== 'JOKER5');
    p.banners = Object.fromEntries(
      Object.entries(p.banners).filter(([id]) => !id.startsWith('JOKER5')),
    );
    await saveProject(p);
    return p.blueprints;
  });
  await page.goto('/blueprints?market=JOKER5');
  await expect(page.locator('.blueprint-card')).toHaveCount(11);
  await expect(page.getByText('Saved locally', { exact: true })).toBeVisible();
  expect(
    await page.evaluate(async () => {
      const { loadProject } = await import('/src/core/storage.js');
      return (await loadProject()).blueprints.filter((e) => e.marketId !== 'JOKER5');
    }),
  ).toEqual(before);
  await page.goto('/blueprints/JOKER5-300x250?market=JOKER5');
  await expect(page.getByRole('link', { name: 'Open original' })).toHaveAttribute(
    'href',
    '/references/joker5 part1/300x250.png',
  );
  await page.getByRole('button', { name: 'Edit in Studio', exact: true }).click();
  await expect(page.locator('.editor')).toBeVisible();
  await page.getByRole('button', { name: 'JSON', exact: true }).click();
  const json = page.locator('.json-editor');
  const bp = JSON.parse(await json.inputValue());
  bp.layers.find((l) => l.id === 'headline').textOverride = 'LOCAL MASK OFFER';
  await json.fill(JSON.stringify(bp));
  await page.getByRole('button', { name: 'Validate and apply', exact: true }).click();
  await page.getByRole('button', { name: 'Save banner', exact: true }).click();
  await expect(page.getByText('Saved locally', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('Saved locally', { exact: true })).toBeVisible();
  const saved = await page.evaluate(async () => {
    const { loadProject } = await import('/src/core/storage.js');
    return await loadProject();
  });
  expect(
    saved.banners['JOKER5-300x250'].override.layers.find((l) => l.id === 'headline').textOverride,
  ).toBe('LOCAL MASK OFFER');
  expect(saved.blueprints.filter((e) => e.marketId === 'JOKER5')).toHaveLength(11);
  expect(saved.blueprints.filter((e) => e.marketId !== 'JOKER5')).toEqual(before);
});
