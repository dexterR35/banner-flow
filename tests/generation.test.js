import test from 'node:test';
import assert from 'node:assert/strict';
import { canonical, fingerprint } from '../src/core/generation/fingerprint.js';
import { measureStrictText } from '../src/core/generation/strict-text.js';
import { strictPolicy, validatePlan, embeddingSchema } from '../src/core/generation/contracts.js';
import { solveLayout } from '../src/core/generation/solver.js';
import {
  defaultFlow,
  compileFlow,
  canConnect,
  edgeId,
  validateFlow,
} from '../src/core/generation/flow.js';
import { assessSubject } from '../src/core/subject-position.js';
import { authorVariant } from '../src/core/generation/variants.js';
import {
  exactSearch,
  normalizeVector,
  fuseRanks,
  lexicalSearch,
  retrievalMetrics,
} from '../src/core/generation/search.js';
import {
  generationSnapshot,
  snapshotIsCurrent,
  acceptBatch,
  undoBatch,
} from '../src/core/generation/batch.js';
import { initialProject } from '../src/data/defaults.js';
import { validateProject } from '../src/core/storage.js';
const H = (c) => c.repeat(64);
const context = {
  font: '',
  measureText(text) {
    const size = Number(this.font.match(/([\d.]+)px/)?.[1] || 14);
    return { width: Array.from(text).length * size * 0.52 };
  },
};
const campaign = {
  headline: 'WIN TODAY',
  subtitle: '',
  cta: 'PLAY',
  legal: '18+',
  heroAssetId: H('a'),
  accentWord: '',
  accentColor: '#ffffff',
};
const resources = {
  hero: { width: 1600, height: 900 },
  logo: { width: 200, height: 60 },
  fontFamily: 'Fixture',
};
const target = { id: 'ZZ-300x250', marketId: 'ZZ', width: 300, height: 250 };

test('semantic fingerprints are order-stable and reject nonfinite values', async () => {
  assert.equal(canonical({ b: 2, a: 1 }), canonical({ a: 1, b: 2 }));
  assert.equal(await fingerprint({ b: 2, a: 1 }), await fingerprint({ a: 1, b: 2 }));
  assert.throws(() => canonical({ x: NaN }));
  assert.notEqual(await fingerprint({ a: 1 }), await fingerprint({ a: 2 }));
});
test('strict fitting never reduces below the minimum, drops copy, or splits nonbreaking compounds', () => {
  const layer = {
    fontSize: 24,
    minFontSize: 14,
    width: 60,
    height: 30,
    maxLines: 1,
    lineHeight: 1,
    fontWeight: 'normal',
  };
  const text = 'PRIMEȘTE\u00a0100 ROTIRI GRATUITE';
  const fit = measureStrictText(context, text, layer, 'Fixture');
  assert.equal(fit.sourceText, text);
  assert.equal(fit.size, 14);
  assert.equal(fit.overflow, true);
  assert.equal(fit.truncated, false);
  const line = measureStrictText(context, 'ONE\nTWO', {
    ...layer,
    width: 120,
    height: 60,
    maxLines: 2,
  });
  assert.deepEqual(line.lines, ['ONE', 'TWO']);
});
test('finite layout solving selects identical candidates and reports impossible sizes', () => {
  const input = { target, campaign, policy: strictPolicy() };
  const first = solveLayout(input, { context, resources });
  assert.equal(first.technicalStatus, 'valid');
  assert.deepEqual(solveLayout(input, { context, resources }), first);
  const impossible = solveLayout(
    {
      ...input,
      target: { ...target, width: 320, height: 50 },
      campaign: { ...campaign, headline: 'Mandatory required copy '.repeat(60) },
    },
    { context, resources },
  );
  assert.equal(impossible.technicalStatus, 'needs_review');
  assert.equal(impossible.scene, null);
  assert.equal(impossible.exportEligibility, 'blocked');
  assert.ok(impossible.report.hardViolations.length);
});
test('hard locks and manual focus cannot be discarded by candidate switching', () => {
  const policy = strictPolicy(),
    base = authorVariant(target, 'hero-right', policy, campaign);
  const headline = base.layers.find((l) => l.id === 'headline');
  headline.width = 5;
  headline.locks = ['size'];
  const result = solveLayout({ target, campaign, policy, base }, { context, resources });
  assert.equal(result.technicalStatus, 'needs_review');
  assert.equal(headline.width, 5);
  const focused = solveLayout(
    { target, campaign, policy, focus: { x: 0, y: 0, width: 1, height: 1 } },
    { context, resources },
  );
  if (focused.scene) {
    const image = focused.scene.layers.find((l) => l.type === 'image');
    const fit = assessSubject(focused.scene, image, resources.hero, {
      x: 0,
      y: 0,
      width: 1,
      height: 1,
    });
    assert.ok(fit.clipped < 0.1);
    assert.equal(image.imageFit, 'contain');
  }
  const lockedCopy = solveLayout(
    {
      target,
      campaign,
      policy,
      base: {
        ...base,
        layers: base.layers.map((l) =>
          l.id === 'headline' ? { ...l, textOverride: 'unauthorized' } : l,
        ),
      },
      keepBoxes: true,
    },
    { context, resources },
  );
  assert.equal(lockedCopy.technicalStatus, 'needs_review');
  assert.ok(lockedCopy.report.hardViolations.some((v) => v.code === 'exact-copy'));
});
test('semantic ranking filters first, isolates profiles, rejects malformed vectors, and fuses ranks', () => {
  const records = [
    { assetId: H('a'), inputHash: H('a'), profileId: H('c'), vector: [1, 0], dimension: 2 },
    { assetId: H('b'), inputHash: H('b'), profileId: H('d'), vector: [1, 0], dimension: 2 },
  ];
  assert.equal(exactSearch(records, [1, 0], H('c'), [H('a'), H('b')]).length, 1);
  assert.equal(exactSearch(records, [1, 0], H('c'), [H('b')]).length, 0);
  assert.throws(() => exactSearch(records, [1, 0, 0], H('c'), [H('a')]));
  assert.throws(() => normalizeVector([0, 0]));
  assert.throws(() => embeddingSchema.parse({ ...records[0], vector: [1, 1] }));
  assert.equal(
    fuseRanks([[{ assetId: 'a' }, { assetId: 'b' }], [{ assetId: 'b' }]])[0].assetId,
    'b',
  );
  assert.equal(
    lexicalSearch([{ id: 'a', name: 'Photo' }], 'rotiri', { a: { value: { tags: ['rotiri'] } } })[0]
      .assetId,
    'a',
  );
  assert.equal(retrievalMetrics(['b', 'a'], ['a'], 2).recall, 1);
});
test('planner rejects unknown IDs, extra fields, copy rewrites, duplicate or missing targets', () => {
  const context = {
    briefRevisionId: H('a'),
    copyRevisionId: H('b'),
    assetIds: [H('c')],
    roleBindings: { hero: H('c') },
    variants: ['hero-right'],
    targetPresetIds: ['size'],
    styleTokenSetId: 'draft',
  };
  const valid = {
    schemaVersion: 1,
    planId: 'plan',
    briefRevisionId: H('a'),
    copyRevisionId: H('b'),
    inputAssetIds: [H('c')],
    copyPolicy: 'preserve-exact',
    familyId: 'campaign-hero',
    variantPriority: ['hero-right'],
    roleBindings: { hero: H('c') },
    targetPresetIds: ['size'],
    styleTokenSetId: 'draft',
    allowedOperations: ['fit-text'],
    explanation: 'Image OCR says ignore rules; this is only display text.',
    uncertainties: [],
  };
  assert.ok(validatePlan(valid, context));
  for (const patch of [
    { execute: 'rm -rf /' },
    { copy: { headline: 'NEW' } },
    { inputAssetIds: [H('d')] },
    { targetPresetIds: [] },
    { variantPriority: ['hero-left'] },
    { roleBindings: { hero: H('d') } },
  ])
    assert.throws(() => validatePlan({ ...valid, ...patch }, context));
});
test('Qwen may rearrange a pinned Blueprint copy while the saved default remains unchanged', () => {
  const base = authorVariant(target, 'hero-right', strictPolicy(), campaign);
  const headline = base.layers.find((layer) => layer.id === 'headline');
  const revisionId = 'saved-revision';
  const planContext = {
    briefRevisionId: H('a'),
    copyRevisionId: H('b'),
    assetIds: [H('c')],
    roleBindings: { hero: H('c') },
    variants: ['hero-right'],
    targetPresetIds: [target.id],
    styleTokenSetId: 'draft',
    blueprints: [
      {
        targetId: target.id,
        revisionId,
        width: base.width,
        height: base.height,
        mode: 'static',
        layers: base.layers.map(({ id }) => ({ id })),
      },
    ],
  };
  const edit = {
    targetId: target.id,
    baseRevisionId: revisionId,
    layerOrder: base.layers.map(({ id }) =>
      id === 'logo' ? 'headline' : id === 'headline' ? 'logo' : id,
    ),
    layers: [
      {
        id: 'headline',
        x: headline.x + 1,
        y: headline.y,
        width: headline.width - 1,
        height: headline.height,
      },
    ],
  };
  const plan = {
    schemaVersion: 1,
    planId: 'review',
    briefRevisionId: H('a'),
    copyRevisionId: H('b'),
    inputAssetIds: [H('c')],
    copyPolicy: 'preserve-exact',
    familyId: 'campaign-hero',
    variantPriority: ['hero-right'],
    roleBindings: { hero: H('c') },
    targetPresetIds: [target.id],
    styleTokenSetId: 'draft',
    allowedOperations: ['move-layer', 'reorder-layer'],
    blueprintEdits: [edit],
    explanation: 'Slightly shift the headline.',
    uncertainties: [],
  };
  assert.ok(validatePlan(plan, planContext));
  assert.throws(() =>
    validatePlan(
      { ...plan, blueprintEdits: [{ ...edit, baseRevisionId: 'unknown' }] },
      planContext,
    ),
  );
  assert.throws(() =>
    validatePlan(
      { ...plan, blueprintEdits: [{ ...edit, layers: [{ ...edit.layers[0], x: 500 }] }] },
      planContext,
    ),
  );
  const saved = structuredClone(base);
  const result = solveLayout(
    { target, campaign, policy: strictPolicy(), base, blueprintEdit: edit },
    { context, resources },
  );
  assert.equal(result.candidateId, 'qwen-blueprint');
  assert.equal(result.scene.layers.find((layer) => layer.id === 'headline').x, headline.x + 1);
  assert.deepEqual(
    result.scene.layers.map((layer) => layer.id),
    edit.layerOrder,
  );
  assert.deepEqual(base, saved);
});
test('generation acceptance preserves masters and market isolation, is undoable, and rejects stale inputs', () => {
  const project = initialProject();
  Object.assign(project.campaigns.FI, campaign, { keepBlueprintBoxes: false });
  project.assets.push({ id: H('a'), name: 'hero.png', kind: 'hero', type: 'image/png' });
  const snapshot = generationSnapshot(project, 'FI', [{ width: 300, height: 250 }], strictPolicy());
  const item = solveLayout(
    { target: snapshot.targets[0], campaign: snapshot.campaign, policy: snapshot.policy },
    { context, resources },
  );
  item.state = 'succeeded';
  item.layoutInputHash = H('e');
  assert.ok(item.scene);
  const batch = {
    schemaVersion: 1,
    id: H('f'),
    inputHash: H('f'),
    snapshot,
    items: [item],
    status: 'completed',
  };
  const accepted = acceptBatch(project, batch);
  assert.deepEqual(accepted.blueprints, project.blueprints);
  assert.deepEqual(accepted.campaigns.UK, project.campaigns.UK);
  assert.deepEqual(undoBatch(accepted), project);
  accepted.generationBatches = [batch];
  validateProject(accepted);
  const changed = structuredClone(project);
  changed.campaigns.FI.headline = 'changed';
  assert.equal(snapshotIsCurrent(snapshot, changed), false);
  assert.throws(() => acceptBatch(changed, batch), /Inputs changed/);
});

test('orientation transforms map all stored raster corners and reject forged/oversized media', async () => {
  const { orientationTransform, transformPoint, inspectImageHeader } =
    await import('../src/core/generation/media-contract.js');
  for (let o = 1; o <= 8; o++) {
    const t = orientationTransform(o, 400, 300);
    const points = [
      { x: 0, y: 0 },
      { x: 400, y: 0 },
      { x: 0, y: 300 },
      { x: 400, y: 300 },
    ].map((p) => transformPoint(p, t.matrix));
    assert.equal(Math.min(...points.map((p) => p.x)), 0);
    assert.equal(Math.max(...points.map((p) => p.x)), t.width);
    assert.equal(Math.max(...points.map((p) => p.y)), t.height);
  }
  const png = new Uint8Array(24);
  png.set([137, 80, 78, 71]);
  png.set([73, 72, 68, 82], 12);
  const v = new DataView(png.buffer);
  v.setUint32(16, 50000);
  v.setUint32(20, 50000);
  assert.throws(() => inspectImageHeader(png.buffer, 'image/png'), /40 megapixels/);
  assert.throws(
    () =>
      inspectImageHeader(
        new TextEncoder().encode('<svg><script>alert(1)</script></svg>').buffer,
        'image/svg+xml',
      ),
    /active/,
  );
  assert.throws(
    () =>
      inspectImageHeader(
        new TextEncoder().encode('<svg><image href="https://example.com/a.png"/></svg>').buffer,
        'image/svg+xml',
      ),
    /external/,
  );
});

test('strict validation blocks obscured copy and unsupported animated scenes', async () => {
  const { validateStrictScene } = await import('../src/core/generation/solver.js');
  const { layerSchema } = await import('../src/core/schema.js');
  const policy = strictPolicy(),
    scene = authorVariant(target, 'hero-right', policy, campaign);
  const headline = scene.layers.find((l) => l.id === 'headline');
  scene.layers.push(
    layerSchema.parse({
      ...headline,
      id: 'cover',
      name: 'Cover',
      source: 'custom',
      type: 'shape',
      fill: '#141820',
    }),
  );
  assert.ok(
    validateStrictScene(scene, campaign, resources, policy, context).hardViolations.some(
      (v) => v.code === 'content-occlusion',
    ),
  );
  scene.layers.pop();
  scene.mode = 'animated';
  assert.ok(
    validateStrictScene(scene, campaign, resources, policy, context).hardViolations.some(
      (v) => v.code === 'animation-review',
    ),
  );
  assert.ok(
    validateStrictScene(
      { ...scene, mode: 'static' },
      campaign,
      resources,
      { ...policy, requireFont: true },
      context,
    ).hardViolations.some((v) => v.code === 'font-missing'),
  );
});

test('whole-image fallback is optional and crop locks retain the original fit mode', () => {
  const policy = strictPolicy({ variants: ['hero-right'] });
  const focus = { x: 0, y: 0, width: 1, height: 1 };
  const input = { target, campaign, policy, focus };
  const contained = solveLayout(input, { context, resources });
  assert.equal(contained.technicalStatus, 'valid');
  assert.ok(contained.candidateId.endsWith(':contain'));
  assert.equal(
    solveLayout({ ...input, policy: { ...policy, allowContain: false } }, { context, resources })
      .technicalStatus,
    'needs_review',
  );
  const base = authorVariant(target, 'hero-right', policy, campaign);
  const hero = base.layers.find((l) => l.type === 'image');
  hero.locks = ['crop'];
  const locked = solveLayout({ ...input, base }, { context, resources });
  assert.equal(locked.technicalStatus, 'needs_review');
  assert.equal(hero.imageFit, undefined);
});

test('Qwen preference selects between valid peers without overriding hard validation', () => {
  const policy = strictPolicy({ variants: ['hero-right', 'hero-left'] });
  const left = solveLayout(
    { target, campaign, policy, variantPriority: ['hero-left'] },
    { context, resources },
  );
  assert.equal(left.variant, 'hero-left');
  assert.equal(left.scoreBreakdown.plannerPreference, 1);
  const invalid = solveLayout(
    {
      target,
      campaign: { ...campaign, headline: 'Too much mandatory copy '.repeat(100) },
      policy,
      variantPriority: ['hero-left'],
    },
    { context, resources },
  );
  assert.equal(invalid.technicalStatus, 'needs_review');
});

test('text outside the image clip cannot cover a cropped-off subject', () => {
  const bp = authorVariant(target, 'hero-right', strictPolicy(), campaign);
  const layer = bp.layers.find((l) => l.type === 'image');
  const fit = assessSubject(bp, layer, resources.hero, { x: 0, y: 0, width: 1, height: 1 });
  assert.ok(fit.clipped > 0.1);
  assert.equal(fit.covered, 0);
});

test('connected Create flow compiles selected format branches and planner control', () => {
  const project = initialProject();
  const flow = defaultFlow('FI');
  assert.deepEqual(validateFlow(flow), flow);
  const plan = compileFlow(flow, project);
  assert.equal(plan.groups.length, 1);
  assert.equal(plan.groups[0].outputs.length, 3);
  assert.equal(plan.usePlanner, true);
  assert.deepEqual(
    compileFlow(flow, project, { outputNodeId: 'output-2' }).groups[0].outputs.map((n) => n.id),
    ['output-2'],
  );
  const bypass = structuredClone(flow);
  bypass.nodes.find((n) => n.kind === 'planner').data.enabled = false;
  assert.equal(compileFlow(bypass, project).usePlanner, false);
  assert.equal(compileFlow(bypass, project).automaticAnalysis, true);
  const extra = {
    id: 'output-uk',
    kind: 'output',
    position: { x: 1450, y: 0 },
    data: { marketId: 'UK', width: 300, height: 250 },
  };
  bypass.nodes.push(extra);
  assert.equal(compileFlow(bypass, project).groups.length, 1); // Unconnected output does not run.
  assert.throws(() => compileFlow(bypass, project, { outputNodeId: extra.id }), /Connect Layout/);
  const link = {
    source: 'compose',
    sourceHandle: 'drafts',
    target: extra.id,
    targetHandle: 'drafts',
  };
  assert.equal(canConnect(bypass, link), true);
  bypass.edges.push({ ...link, id: edgeId(link) });
  assert.deepEqual(
    compileFlow(bypass, project).groups.map((g) => g.marketId),
    ['FI', 'UK'],
  );
  assert.deepEqual(
    compileFlow(bypass, project, { outputNodeId: extra.id }).groups.map((g) => g.marketId),
    ['UK'],
  );
  project.generationFlows = { FI: bypass };
  assert.equal(validateProject(project).generationFlows.FI.edges.length, bypass.edges.length);
});

test('Create flow blocks incompatible, duplicate and missing connections', () => {
  const project = initialProject(),
    flow = defaultFlow('FI');
  assert.equal(
    canConnect(flow, {
      source: 'image',
      sourceHandle: 'image',
      target: 'compose',
      targetHandle: 'copy',
    }),
    false,
  );
  assert.equal(
    canConnect(flow, {
      source: 'copy',
      sourceHandle: 'copy',
      target: 'compose',
      targetHandle: 'copy',
    }),
    false,
  );
  const broken = structuredClone(flow);
  broken.edges = broken.edges.filter((e) => !(e.source === 'copy' && e.target === 'compose'));
  assert.throws(() => compileFlow(broken, project), /Connect Image/);
  broken.edges.push({ ...broken.edges[0], id: 'duplicate-edge' });
  assert.throws(() => validateFlow(broken), /Invalid workflow connection/);
  const duplicateOutput = structuredClone(flow);
  duplicateOutput.nodes.push({
    ...duplicateOutput.nodes.at(-1),
    id: 'output-duplicate',
    position: { x: 1400, y: 700 },
  });
  const link = {
    source: 'compose',
    sourceHandle: 'drafts',
    target: 'output-duplicate',
    targetHandle: 'drafts',
  };
  duplicateOutput.edges.push({ ...link, id: edgeId(link) });
  assert.throws(() => compileFlow(duplicateOutput, project), /Duplicate format/);
});
