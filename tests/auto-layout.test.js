import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createBlueprint,
  campaignFor,
  DEFAULT_MARKETS,
  PRESETS,
  initialProject,
  resolveBanner,
} from '../src/data/defaults.js';
import { arrangeBanner, layoutKey } from '../src/core/auto-layout.js';
import { validateBlueprint } from '../src/core/schema.js';
import { validateProject } from '../src/core/storage.js';
import { textObstacles } from '../src/core/text-layout.js';
import { boundText } from '../src/core/render.js';
import { fitText } from '../src/core/text-fit.js';

const context = {
  font: '',
  measureText(text) {
    return { width: text.length * Number(this.font.match(/([\d.]+)px/)[1]) * 0.5 };
  },
};
const resources = { hero: { width: 1200, height: 800 } };
const intersects = (a, b) =>
  a.x < b.x + b.width - 0.01 &&
  a.x + a.width > b.x + 0.01 &&
  a.y < b.y + b.height - 0.01 &&
  a.y + a.height > b.y + 0.01;

test('automatic layouts fit long copy across markets and formats without changing masters, legal, logo or timing', () => {
  for (const market of DEFAULT_MARKETS)
    for (const [w, h] of PRESETS.slice(0, 8)) {
      const bp = createBlueprint(market.id, w, h),
        before = structuredClone(bp);
      const campaign = {
        ...campaignFor(market),
        headline: 'PLAY EVERY MATCH YOUR WAY WITH NETBET THIS WEEKEND',
      };
      const result = arrangeBanner(bp, campaign, resources, { context });
      validateBlueprint(result);
      assert.deepEqual(bp, before);
      assert.deepEqual(result.scenes, bp.scenes);
      for (const id of ['logo', 'legal', 'cta'])
        assert.deepEqual(
          result.layers.find((l) => l.id === id),
          bp.layers.find((l) => l.id === id),
        );
      for (const layer of result.layers.filter((l) => ['headline', 'subtitle'].includes(l.id))) {
        assert.equal(
          textObstacles(result, layer).some((box) => intersects(layer, box)),
          false,
          `${bp.id}/${layer.id}`,
        );
        const fit = fitText(context, boundText(layer, campaign), layer);
        assert.equal(fit.overflow, false, `${bp.id}/${layer.id}`);
        assert.equal(fit.lines.join(' '), boundText(layer, campaign).replace(/\s+/g, ' '));
      }
    }
});

test('copy length and photo aspect influence composition while fixed crop focus and local rows survive', () => {
  const bp = createBlueprint('FI', 300, 250),
    campaign = campaignFor(DEFAULT_MARKETS[0]);
  Object.assign(
    bp.layers.find((l) => l.id === 'hero'),
    { focalX: 0.8, focalY: 0.3, zoom: 2 },
  );
  const short = arrangeBanner(bp, { ...campaign, headline: 'MATCH DAY' }, resources, { context });
  const long = arrangeBanner(
    bp,
    { ...campaign, headline: 'PLAY EVERY MATCH YOUR WAY WITH NETBET THIS WEEKEND' },
    resources,
    { context },
  );
  assert.notDeepEqual(short.layers, long.layers);
  const hero = long.layers.find((l) => l.id === 'hero');
  for (const key of ['focalX', 'focalY', 'zoom', 'fade', 'fadeDirection'])
    assert.equal(hero[key], bp.layers.find((l) => l.id === 'hero')[key]);
  const local = bp.layers.find((l) => l.id === 'headline');
  Object.assign(local, { textOverride: 'LOCAL\nROWS', textFlow: 'manual' });
  const result = arrangeBanner(bp, campaign, resources, {
    context,
    preserveFlow: true,
    resizeImage: false,
  });
  assert.equal(result.layers.find((l) => l.id === 'headline').textFlow, 'manual');
  assert.equal(result.layers.find((l) => l.id === 'headline').textOverride, 'LOCAL\nROWS');
  assert.deepEqual(
    result.layers.find((l) => l.id === 'hero'),
    bp.layers.find((l) => l.id === 'hero'),
  );
});

test('GIF parts can reuse text space and crossfades reserve co-visible text', () => {
  const bp = createBlueprint('FI', 320, 50),
    campaign = campaignFor(DEFAULT_MARKETS[0]);
  let result = arrangeBanner(bp, campaign, resources, { context });
  assert(
    intersects(
      result.layers.find((l) => l.id === 'headline'),
      result.layers.find((l) => l.id === 'subtitle'),
    ),
  );
  bp.scenes[1].transitionMs = 300;
  result = arrangeBanner(bp, campaign, resources, { context });
  assert(
    !intersects(
      result.layers.find((l) => l.id === 'headline'),
      result.layers.find((l) => l.id === 'subtitle'),
    ),
  );
  assert.deepEqual(result.scenes, bp.scenes);
});

test('legacy projects keep their appearance and arranged snapshots are validated and resolved consistently', () => {
  const p = initialProject(),
    entry = p.blueprints[0],
    banner = p.banners[entry.id];
  delete p.campaigns.FI.autoArrange;
  delete banner.layoutKey;
  const original = structuredClone(resolveBanner(entry, banner));
  validateProject(p);
  assert.equal(p.campaigns.FI.autoArrange, true);
  assert.equal(banner.layoutKey, layoutKey(p.campaigns.FI));
  assert.deepEqual(resolveBanner(entry, banner), original);
  banner.arrangement = arrangeBanner(original, p.campaigns.FI, resources, { context });
  validateProject(p);
  assert.equal(resolveBanner(entry, banner), banner.arrangement);
  banner.arrangement.width += 1;
  assert.throws(() => validateProject(p), /Arranged layout identity/);
  assert.equal(
    layoutKey(p.campaigns.FI),
    layoutKey({ ...p.campaigns.FI, name: 'Renamed', accentColor: '#abcdef' }),
  );
});
