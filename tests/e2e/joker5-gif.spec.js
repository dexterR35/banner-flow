import { test, expect } from '@playwright/test';
import { readBlueprint } from './helpers/editor.js';

test('reload upgrades an old static Joker5 reference without changing its ID, edits or market fade setting', async ({
  page,
}) => {
  await page.goto('/campaign?market=JOKER5');
  await expect(page.getByText('Saved locally', { exact: true })).toBeVisible();
  await page.evaluate(async () => {
    const { loadProject, saveProject } = await import('/src/core/storage.js');
    const { newEntry } = await import('/src/data/defaults.js');
    const { LEGACY_JOKER5_REFERENCES, createLegacyJoker5Blueprint } =
      await import('/src/data/joker5.js');
    const p = await loadProject();
    const bp = createLegacyJoker5Blueprint(
      LEGACY_JOKER5_REFERENCES.find((r) => r.id === 'JOKER5-170x100-chest'),
    );
    bp.id = 'JOKER5-170x100';
    const e = newEntry(bp);
    e.reference = 'joker5 part1/170x100.png';
    p.blueprints = p.blueprints.map((old) => (old.id === e.id ? e : old));
    const local = structuredClone(bp);
    local.layers[0].focalX = 0.7;
    local.layers.find((l) => l.id === 'headline').textOverride = 'MY OFFER';
    p.banners[e.id] = { blueprintVersionId: e.activeVersionId, override: local, history: [] };
    p.campaigns.JOKER5.imageFadeEnabled = false;
    await saveProject(p);
  });
  await page.reload();
  await expect(page.getByText('Saved locally', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Image fade', exact: true })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await expect(
    page.getByRole('button', { name: 'Select part 3 of 170x100: Legal', exact: true }),
  ).toBeVisible();
  const migrated = await page.evaluate(async () => {
    const p = await (await import('/src/core/storage.js')).loadProject();
    return {
      entry: p.blueprints.find((e) => e.id === 'JOKER5-170x100'),
      banner: p.banners['JOKER5-170x100'],
    };
  });
  expect(migrated.entry.versions).toHaveLength(2);
  expect(migrated.entry.versions[0].blueprint.mode).toBe('static');
  expect(migrated.entry.versions[1].blueprint.mode).toBe('animated');
  expect(migrated.banner.override.layers[0].focalX).toBe(0.7);
  expect(migrated.banner.override.layers.find((l) => l.id === 'headline').textOverride).toBe(
    'MY OFFER',
  );
  await page.reload();
  await expect(page.getByText('Saved locally', { exact: true })).toBeVisible();
  const again = await page.evaluate(async () =>
    (await (await import('/src/core/storage.js')).loadProject()).blueprints.find(
      (e) => e.id === 'JOKER5-170x100',
    ),
  );
  expect(again).toEqual(migrated.entry);
});

test('Joker5 shows nine GIF groups with editable parts, durations and persistent local timing', async ({
  page,
}) => {
  await page.goto('/campaign?market=JOKER5');
  await expect(page.getByText('Saved locally', { exact: true })).toBeVisible();
  await expect(page.locator('.banner-card')).toHaveCount(11);
  await expect(page.locator('.gif-artboard-group')).toHaveCount(9);
  await expect(page.locator('.gif-part')).toHaveCount(21);
  await page.screenshot({ path: 'docs/verification/joker5-gifs/studio.png' });
  await page.goto('/campaign/JOKER5-170x100/edit?market=JOKER5');
  const bp = await readBlueprint(page);
  expect(bp.scenes.map((s) => s.name)).toEqual(['Offer', 'Free spins', 'Legal']);
  bp.scenes[1].durationMs = 3500;
  await page.getByRole('button', { name: 'JSON', exact: true }).click();
  await page.locator('.json-editor').fill(JSON.stringify(bp));
  await page.getByRole('button', { name: 'Validate and apply', exact: true }).click();
  await page.getByRole('button', { name: 'Save banner', exact: true }).click();
  await expect(page.getByText('Saved locally', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('Saved locally', { exact: true })).toBeVisible();
  const saved = await page.evaluate(async () => {
    const p = await (await import('/src/core/storage.js')).loadProject();
    return {
      banner: p.banners['JOKER5-170x100'].override,
      standard: p.blueprints.find((e) => e.id === 'JOKER5-170x100').versions[0].blueprint,
    };
  });
  expect(saved.banner.scenes[1].durationMs).toBe(3500);
  expect(saved.standard.scenes[1].durationMs).toBe(2000);
});

test('every Joker5 reference has deterministic scene pixels and matching GIF frames, dimensions and timing', async ({
  page,
}) => {
  await page.goto('/campaign?market=JOKER5');
  await expect(page.getByText('Saved locally', { exact: true })).toBeVisible();
  const checks = await page.evaluate(async () => {
    const { loadProject, loadResources } = await import('/src/core/storage.js');
    const { JOKER5_REFERENCES, createJoker5Blueprint } = await import('/src/data/joker5.js');
    const { renderFrame, canvasOf } = await import('/src/core/render.js');
    const { renderOutput } = await import('/src/core/export.js');
    const { resourcesForBlueprint } = await import('/src/core/blueprint-resources.js');
    const { sceneStart } = await import('/src/core/timeline.js');
    const p = await loadProject(),
      campaign = p.campaigns.JOKER5,
      resources = await loadResources(campaign);
    const checks = [];
    const host = document.createElement('div');
    host.style =
      'position:absolute;left:0;top:0;z-index:99999;background:#303030;color:white;padding:16px;width:1800px';
    document.body.append(host);
    for (const [index, r] of JOKER5_REFERENCES.entries()) {
      const bp = createJoker5Blueprint(r),
        resolved = resourcesForBlueprint(bp, resources);
      const gif = await renderOutput(bp, campaign, resources, 'gif');
      const decoder = new ImageDecoder({ data: await gif.arrayBuffer(), type: 'image/gif' });
      await decoder.tracks.ready;
      const group = document.createElement('div');
      group.id = `gif-reference-${index}`;
      host.append(group);
      const title = document.createElement('p');
      title.textContent = `${r.file} — decoded reference / editable render`;
      group.append(title);
      const original = await fetch(`/references/${r.file}`).then((res) => res.arrayBuffer());
      const source = new ImageDecoder({
        data: original,
        type: r.file.endsWith('.gif') ? 'image/gif' : 'image/png',
      });
      await source.tracks.ready;
      const errors = [],
        durations = [];
      for (let i = 0; i < bp.scenes.length; i++) {
        const canvas = canvasOf(bp.width, bp.height);
        renderFrame(canvas, bp, campaign, resources, sceneStart(bp, i) + 1);
        const expected = canvas.getContext('2d').getImageData(0, 0, bp.width, bp.height).data;
        const frame = (await decoder.decode({ frameIndex: i })).image;
        durations.push(frame.duration / 1000);
        const decoded = canvasOf(bp.width, bp.height);
        decoded.getContext('2d').drawImage(frame, 0, 0);
        frame.close();
        const actual = decoded.getContext('2d').getImageData(0, 0, bp.width, bp.height).data;
        errors.push(
          expected.reduce((sum, v, j) => sum + Math.abs(v - actual[j]), 0) / actual.length,
        );
        const ref = canvasOf(bp.width, bp.height),
          refFrame = (await source.decode({ frameIndex: i })).image;
        ref.getContext('2d').drawImage(refFrame, 0, 0);
        refFrame.close();
        const row = document.createElement('div');
        row.style = 'display:flex;gap:16px;margin-bottom:10px';
        const label = document.createElement('span');
        label.style = 'width:100px';
        label.textContent = `${i + 1}. ${bp.scenes[i].name} ${bp.scenes[i].durationMs}ms`;
        row.append(label, ref, canvas);
        group.append(row);
      }
      const a = canvasOf(bp.width, bp.height),
        b = canvasOf(bp.width, bp.height);
      renderFrame(a, bp, campaign, resources, 0);
      await new Promise((resolve) => setTimeout(resolve, 15));
      renderFrame(b, bp, campaign, resources, 0);
      checks.push({
        id: r.id,
        frames: decoder.tracks.selectedTrack.frameCount,
        expected: bp.scenes.length,
        durations,
        expectedDurations: bp.scenes.map((s) => s.durationMs),
        errors,
        still: resolved.hero.src.includes('/frames/') || bp.mode === 'static',
        stable: a.toDataURL() === b.toDataURL(),
      });
      decoder.close();
      source.close();
    }
    return checks;
  });
  for (const c of checks) {
    expect(c.frames, c.id).toBe(c.expected);
    expect(c.durations, c.id).toEqual(c.expectedDurations);
    expect(c.still && c.stable, c.id).toBe(true);
    for (const error of c.errors) expect(error, c.id).toBeLessThan(6);
  }
  for (let i = 0; i < checks.length; i++)
    await page
      .locator(`#gif-reference-${i}`)
      .screenshot({ path: `docs/verification/joker5-gifs/compare-${i}.png` });
});
