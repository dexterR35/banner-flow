import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  initialProject,
  addReferenceMarkets,
  activeRevision,
  newEntry,
} from '../src/data/defaults.js';
import {
  JOKER5_REFERENCES,
  createJoker5Blueprint,
  LEGACY_JOKER5_REFERENCES,
  createLegacyJoker5Blueprint,
} from '../src/data/joker5.js';
import inventory from '../src/data/asset-manifest.json' with { type: 'json' };
import { validateProject } from '../src/core/storage.js';
import { reserveLegalFooter } from '../src/core/legal-footer.js';
import { resourcesForBlueprint } from '../src/core/blueprint-resources.js';
import { migrateJoker5Effects } from '../src/core/joker5-effects.js';
import { migrateJoker5References } from '../src/core/joker5-reference-migration.js';
import { animationSamples } from '../src/core/timeline.js';
import { validateBlueprint } from '../src/core/schema.js';
import { saveBlueprintStandard } from '../src/core/blueprint-edit.js';

test('old duplicate sizes consolidate without losing either history and hard-edge seeds gain editable fades', () => {
  const project = initialProject();
  project.blueprints = project.blueprints.filter((e) => e.marketId !== 'JOKER5');
  project.banners = Object.fromEntries(
    Object.entries(project.banners).filter(([id]) => !id.startsWith('JOKER5')),
  );
  for (const reference of LEGACY_JOKER5_REFERENCES) {
    const bp = createLegacyJoker5Blueprint(reference);
    bp.layers[0].fade = 0;
    delete bp.layers[0].fadeMesh;
    const entry = newEntry(bp);
    entry.variantLabel = reference.label;
    project.blueprints.push(entry);
    project.banners[entry.id] = {
      blueprintVersionId: entry.activeVersionId,
      override: null,
      history: [],
    };
  }
  const mask = project.banners['JOKER5-350x250-mask'];
  mask.override = structuredClone(
    activeRevision(project.blueprints.find((e) => e.id === 'JOKER5-350x250-mask')).blueprint,
  );
  mask.override.layers.find((l) => l.id === 'headline').textOverride = 'My saved offer';
  const before = structuredClone(project);
  const consolidated = addReferenceMarkets(project);
  assert.equal(consolidated.blueprints.filter((e) => e.marketId === 'JOKER5').length, 16);
  assert.equal(consolidated.consolidatedReferences.length, 11);
  assert.deepEqual(consolidated.banners['JOKER5-350x250-mask'], mask);
  assert.deepEqual(project, before);
  for (const old of before.blueprints.filter((e) => e.marketId === 'JOKER5')) {
    const retained = consolidated.blueprints.find((e) => e.id === old.id);
    if (retained) assert.deepEqual(retained.versions, old.versions);
    else
      assert.deepEqual(
        consolidated.consolidatedReferences.find((a) => a.entry.id === old.id).entry,
        old,
      );
  }
  assert.strictEqual(addReferenceMarkets(consolidated), consolidated);
  const migrated = migrateJoker5Effects(consolidated);
  assert.strictEqual(migrateJoker5Effects(migrated), migrated);
  for (const entry of migrated.blueprints.filter((e) => e.marketId === 'JOKER5')) {
    const hero = activeRevision(entry).blueprint.layers[0];
    assert.equal(hero.fadeMesh.points.length, 16);
    assert.equal(
      entry.versions.length,
      entry.id.includes('300x100') || entry.id.includes('300x250') ? 1 : 2,
    );
  }
  assert.deepEqual(migrated.consolidatedReferences, consolidated.consolidatedReferences);
  assert.doesNotThrow(() => validateProject(JSON.parse(JSON.stringify(migrated))));
});

test('image shadows validate and standard effects synchronize only the matching market and size', () => {
  const p = initialProject(),
    entry = p.blueprints.find((e) => e.id === 'JOKER5-300x250');
  const bp = structuredClone(activeRevision(entry).blueprint);
  bp.layers[0].shadow = {
    enabled: true,
    color: '#442244',
    opacity: 0.6,
    blur: 12,
    offsetX: -5,
    offsetY: 4,
  };
  bp.layers[0].fadeMesh.softness = 0.4;
  const next = saveBlueprintStandard(p, entry.id, bp);
  assert.deepEqual(
    activeRevision(p.blueprints.find((e) => e.id === entry.id)).blueprint.layers[0].shadow,
    undefined,
  );
  assert.equal(
    activeRevision(next.blueprints.find((e) => e.id === entry.id)).blueprint.layers[0].shadow.blur,
    12,
  );
  assert.deepEqual(next.banners['FI-300x250'], p.banners['FI-300x250']);
  assert.deepEqual(next.banners['JOKER5-180x150'], p.banners['JOKER5-180x150']);
  bp.layers[0].shadow.blur = 100;
  assert.throws(() => validateBlueprint(bp));
});

test('Joker5 has one current standard per size and retains all reference sources with unchanged hashes', () => {
  const project = initialProject();
  assert.equal(JOKER5_REFERENCES.length, 22);
  assert.equal(new Set(JOKER5_REFERENCES.map((r) => `${r.width}x${r.height}`)).size, 11);
  const entries = project.blueprints.filter((e) => e.marketId === 'JOKER5');
  assert.equal(entries.length, 11);
  assert.equal(
    new Set(
      entries.map((e) => {
        const bp = activeRevision(e).blueprint;
        return `${bp.width}x${bp.height}`;
      }),
    ).size,
    11,
  );
  for (const reference of JOKER5_REFERENCES) {
    const asset = inventory.find((a) => a.file === reference.file);
    const entry = project.blueprints.find((e) => e.references?.includes(reference.file));
    const bp = activeRevision(entry).blueprint;
    assert.deepEqual([bp.width, bp.height], [asset.width, asset.height]);
    const variant = createJoker5Blueprint(reference);
    assert.equal(variant.mode, asset.frames > 1 ? 'animated' : 'static');
    assert.equal(variant.scenes.length, asset.frames);
    if (asset.frames > 1)
      assert.deepEqual(
        animationSamples(variant).map((s) => s.delay),
        asset.durationsMs,
      );
    assert.equal(
      createHash('sha256')
        .update(readFileSync(new URL(`../assets/${asset.file}`, import.meta.url)))
        .digest('hex'),
      asset.sha256,
    );
    assert.deepEqual(reserveLegalFooter(bp), bp, 'measured frames already respect the footer');
    for (const l of bp.layers) {
      assert.ok(
        l.x >= 0 && l.y >= 0 && l.x + l.width <= bp.width && l.y + l.height <= bp.height,
        `${bp.id}/${l.id}`,
      );
      if (l.type === 'button') assert.equal(l.textFill, '#080607');
    }
  }
  assert.doesNotThrow(() => validateProject(structuredClone(project)));
});

test('adding reference markets is idempotent and preserves existing campaigns, standards and overrides', () => {
  const old = initialProject();
  old.markets = old.markets.filter((m) => m.id !== 'JOKER5');
  old.blueprints = old.blueprints.filter((e) => e.marketId !== 'JOKER5');
  delete old.campaigns.JOKER5;
  old.banners = Object.fromEntries(
    Object.entries(old.banners).filter(([id]) => !id.startsWith('JOKER5')),
  );
  old.banners['FI-300x250'].override = structuredClone(activeRevision(old.blueprints[0]).blueprint);
  old.banners['FI-300x250'].override.layers[0].focalX = 0.8;
  const before = structuredClone(old),
    next = addReferenceMarkets(old);
  assert.deepEqual(old, before);
  assert.deepEqual(next.blueprints.slice(0, 16), before.blueprints);
  assert.deepEqual(next.banners['FI-300x250'], before.banners['FI-300x250']);
  assert.deepEqual(next.campaigns.FI, before.campaigns.FI);
  assert.equal(next.campaigns.JOKER5.keepBlueprintBoxes, true);
  assert.equal(next.campaigns.JOKER5.autoArrange, true);
  assert.strictEqual(addReferenceMarkets(next), next);
  assert.doesNotThrow(() => validateProject(structuredClone(next)));
});

test('reference resources stay per blueprint and uploaded originals replace both variants', () => {
  const chest = { hero: { width: 300 }, heroCrop: [2, 3, 4, 5], logo: { width: 50 } };
  const mask = { hero: { width: 200 }, heroCrop: [1, 2, 3, 4], logo: { width: 40 } };
  const resources = {
    presets: { chest, mask },
    hero: { width: 1000 },
    logo: { width: 100 },
    heroCrop: null,
  };
  assert.equal(resourcesForBlueprint({ resourcePreset: 'mask' }, resources).hero, mask.hero);
  assert.equal(resourcesForBlueprint({ resourcePreset: 'chest' }, resources).hero, chest.hero);
  const uploaded = { ...resources, uploadedHero: true, uploadedLogo: true };
  assert.equal(resourcesForBlueprint({ resourcePreset: 'mask' }, uploaded).hero, resources.hero);
  assert.equal(resourcesForBlueprint({ resourcePreset: 'mask' }, uploaded).logo, resources.logo);
  assert.equal(resourcesForBlueprint({ resourcePreset: 'mask' }, uploaded).heroCrop, null);
});

test('GIF reference refresh appends revisions once, preserves retired sizes and local edits, and adds true 300px formats', () => {
  let project = initialProject();
  project.blueprints = project.blueprints.filter((e) => e.marketId !== 'JOKER5');
  project.banners = Object.fromEntries(
    Object.entries(project.banners).filter(([id]) => !id.startsWith('JOKER5')),
  );
  for (const r of LEGACY_JOKER5_REFERENCES.filter((r) => r.variant === 'chest')) {
    const bp = createLegacyJoker5Blueprint(r);
    const entry = newEntry(bp);
    entry.reference = r.file;
    project.blueprints.push(entry);
    project.banners[entry.id] = {
      blueprintVersionId: entry.activeVersionId,
      override: null,
      history: [],
    };
  }
  const edited = project.blueprints.find((e) => e.id === 'JOKER5-170x100-chest');
  const local = structuredClone(activeRevision(edited).blueprint);
  local.layers.find((l) => l.id === 'headline').textOverride = 'KEEP MY COPY';
  local.layers[0].focalX = 0.73;
  local.layers[0].fadeMesh.softness = 0.47;
  project.banners[edited.id].override = local;
  project.campaigns.JOKER5.imageFadeEnabled = false;
  const before = structuredClone(project);
  const next = migrateJoker5References(addReferenceMarkets(project));
  assert.deepEqual(project, before);
  assert.equal(next.blueprints.filter((e) => e.marketId === 'JOKER5').length, 16);
  assert.ok(next.banners['JOKER5-300x100']);
  assert.ok(next.banners['JOKER5-300x250']);
  const updatedEntry = next.blueprints.find((e) => e.id === edited.id);
  assert.equal(updatedEntry.versions.length, 2);
  assert.deepEqual(updatedEntry.versions[0], edited.versions[0]);
  assert.deepEqual(
    activeRevision(updatedEntry).blueprint.scenes.map((s) => s.name),
    ['Offer', 'Free spins', 'Legal'],
  );
  const updated = next.banners[edited.id].override;
  assert.equal(updated.layers.find((l) => l.id === 'headline').textOverride, 'KEEP MY COPY');
  assert.equal(updated.layers[0].focalX, 0.73);
  assert.equal(updated.layers[0].fadeMesh.softness, 0.47);
  assert.deepEqual(next.campaigns, before.campaigns);
  assert.deepEqual(next.banners['FI-300x250'], before.banners['FI-300x250']);
  assert.deepEqual(next.banners['JOKER5-120x240-chest'], before.banners['JOKER5-120x240-chest']);
  assert.strictEqual(migrateJoker5References(addReferenceMarkets(next)), next);
  assert.doesNotThrow(() => validateProject(structuredClone(next)));
});

test('Joker5 frame visibility matches offer, spins, CTA and legal source sequences for both references', () => {
  for (const reference of JOKER5_REFERENCES) {
    const bp = createJoker5Blueprint(reference);
    const visible = (i) =>
      bp.layers.filter((l) => bp.scenes[i].tracks[l.id].visible).map((l) => l.source);
    assert.ok(visible(0).includes('headline'));
    if (bp.mode === 'static') continue;
    if (reference.boxes.sequence === 'offer-and-spins-cta') {
      assert.ok(visible(0).includes('subtitle'));
      assert.ok(visible(1).includes('cta'));
      assert.ok(!visible(1).includes('headline'));
    } else {
      assert.ok(!visible(0).includes('subtitle'));
      assert.ok(visible(1).includes('subtitle'));
      assert.ok(!visible(1).includes('headline'));
    }
    if (reference.boxes.sequence.endsWith('-legal')) {
      assert.deepEqual(visible(2), ['hero', 'legal']);
      assert.ok(!visible(0).includes('legal'));
    }
    if (reference.boxes.sequence === 'offer-spins-cta') {
      assert.ok(!visible(0).includes('cta'));
      assert.deepEqual(visible(2), ['hero', 'logo', 'cta', 'legal']);
    }
    assert.ok(reference.stillFile.startsWith('frames/'));
  }
});
