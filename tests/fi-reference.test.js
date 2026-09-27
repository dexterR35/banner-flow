import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createBlueprint,
  initialProject,
  activeRevision,
  resolveBanner,
} from '../src/data/defaults.js';
import { boundText } from '../src/core/render.js';
import { migrateFiReferences } from '../src/core/fi-reference-migration.js';

test('FI supporting headline uses reference color and separate boxes only in tall references', () => {
  for (const width of [160, 300]) {
    const bp = createBlueprint('FI', width, 600);
    const title = bp.layers.find((l) => l.id === 'headline');
    const support = bp.layers.find((l) => l.id === 'headline-support');
    assert.equal(support.fill, '#c5e6ff');
    assert.ok(title.y + title.height <= support.y);
    const campaign = { headline: 'TITLE\nSUPPORTING WORDS\nMORE WORDS' };
    assert.equal(boundText(title, campaign), 'TITLE');
    assert.equal(boundText(support, campaign), 'SUPPORTING WORDS\nMORE WORDS');
    assert.equal(boundText({ ...support, textOverride: 'LOCAL' }, campaign), 'LOCAL');
  }
  for (const [market, width, height] of [
    ['FI', 300, 250],
    ['FI', 320, 480],
    ['UK', 300, 600],
  ])
    assert.ok(
      !createBlueprint(market, width, height).layers.some((l) => l.id === 'headline-support'),
    );
});

test('legacy FI migration preserves copy, photos, other markets and old revisions and runs once', () => {
  const p = initialProject();
  const e = p.blueprints.find((e) => e.id === 'FI-300x600');
  const bp = activeRevision(e).blueprint;
  bp.layers = bp.layers.filter((l) => l.id !== 'headline-support');
  bp.layers.find((l) => l.id === 'headline').sourcePart = 'all';
  for (const scene of bp.scenes) delete scene.tracks['headline-support'];
  const local = structuredClone(bp);
  local.layers.find((l) => l.id === 'headline').textOverride = 'LOCAL TITLE\nLOCAL SUPPORT';
  local.layers.find((l) => l.id === 'hero').focalX = 0.8;
  p.banners[e.id].override = local;
  const before = structuredClone(p);
  const result = migrateFiReferences(p);
  const updated = result.blueprints.find((b) => b.id === e.id);
  const banner = resolveBanner(updated, result.banners[e.id]);
  assert.equal(
    boundText(
      banner.layers.find((l) => l.id === 'headline'),
      {},
    ),
    'LOCAL TITLE',
  );
  assert.equal(
    boundText(
      banner.layers.find((l) => l.id === 'headline-support'),
      {},
    ),
    'LOCAL SUPPORT',
  );
  assert.equal(banner.layers.find((l) => l.id === 'hero').focalX, 0.8);
  assert.deepEqual(updated.versions[0], before.blueprints.find((b) => b.id === e.id).versions[0]);
  assert.deepEqual(result.campaigns, before.campaigns);
  assert.deepEqual(result.banners['UK-300x600'], before.banners['UK-300x600']);
  assert.equal(migrateFiReferences(result), result);
});
