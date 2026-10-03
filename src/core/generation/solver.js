import { heroFor, effectiveBox } from '../hero-variants.js';
import { strictPolicy } from './contracts.js';
import { canonical } from './fingerprint.js';
import { authorVariant } from './variants.js';
import { validateBlueprint } from '../schema.js';
import { boundText, cropFor } from '../render.js';
import { measureStrictText } from './strict-text.js';
import { buttonTextBox } from '../text-fit.js';
import { assessSubject } from '../subject-position.js';
import { animationSamples, layerAt, sceneAt } from '../timeline.js';
import { contrastRatio, hexToRgb } from '../color.js';
export const SOLVER_VERSION = 'strict-layout-2';
function proposedBlueprint(base, edit, policy) {
  const original = strictBase(base, policy);
  const changes = new Map(edit.layers.map((layer) => [layer.id, layer]));
  const layers = original.layers.map((layer) => ({ ...layer, ...(changes.get(layer.id) || {}) }));
  const ordered = edit.layerOrder
    ? edit.layerOrder.map((id) => layers.find((layer) => layer.id === id))
    : layers;
  return validateBlueprint({ ...original, layers: ordered });
}
const overlap = (a, b) =>
  Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
  Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
const violation = (code, message, layerId, evidence) => ({
  code,
  message,
  ...(layerId ? { layerId } : {}),
  ...(evidence ? { evidence } : {}),
});
function strictBase(base, policy) {
  return validateBlueprint({
    ...base,
    layers: base.layers.map((l) =>
      ['text', 'button'].includes(l.type)
        ? {
            ...l,
            fitPolicy: 'strict-v1',
            minFontSize: Math.max(
              l.minFontSize,
              l.source === 'legal' ? policy.minimumLegal : policy.minimumFont,
            ),
            fontSize: Math.max(
              l.fontSize,
              l.source === 'legal' ? policy.minimumLegal : policy.minimumFont,
            ),
          }
        : l,
    ),
  });
}
function cropScene(bp, focus, resources, locks) {
  if (!focus || !resources.hero) return bp;
  return {
    ...bp,
    layers: bp.layers.map((layer) => {
      if (
        layer.type !== 'image' ||
        layer.imageFit === 'contain' ||
        layer.rotation ||
        locks?.[layer.id]?.includes('crop')
      )
        return layer;
      const { image, frame } = heroFor(layer, resources);
      const focal = effectiveBox(focus, frame);
      const candidates = [
        layer,
        ...[0, 0.5, 1].flatMap((x) =>
          [0, 0.5, 1].map((y) => ({ ...layer, focalX: x, focalY: y, zoom: 1 })),
        ),
      ];
      // Include the exact centering solution, not just grid anchors.
      const [, , cw, ch] = cropFor(image, { ...layer, zoom: 1 }, resources.heroCrop);
      const [sx, sy, sw, sh] = resources.heroCrop || [0, 0, image.width, image.height];
      candidates.push({
        ...layer,
        zoom: 1,
        focalX:
          sw > cw
            ? Math.max(
                0,
                Math.min(1, ((focal.x + focal.width / 2) * image.width - sx - cw / 2) / (sw - cw)),
              )
            : 0.5,
        focalY:
          sh > ch
            ? Math.max(
                0,
                Math.min(
                  1,
                  ((focal.y + focal.height / 2) * image.height - sy - ch / 2) / (sh - ch),
                ),
              )
            : 0.5,
      });
      return candidates
        .map((l, i) => ({ l, i, fit: assessSubject(bp, l, image, focal, resources.heroCrop) }))
        .sort(
          (a, b) =>
            a.fit.clipped +
              a.fit.covered +
              a.fit.faded -
              (b.fit.clipped + b.fit.covered + b.fit.faded) || a.i - b.i,
        )[0].l;
    }),
  };
}
/** Deterministic strict QA. Unsupported geometry is blocked rather than falsely approved. */
export function validateStrictScene(
  bp,
  campaign,
  resources,
  policy,
  context,
  { base, locks = {}, focus } = {},
) {
  const violations = [],
    measurements = {},
    warnings = [];
  if (!campaign.logoAssetId)
    warnings.push({
      code: 'draft-logo',
      message: 'No approved logo supplied; this result is a draft.',
    });
  if (!campaign.fontAssetId || campaign.typography === 'outfit')
    warnings.push({
      code: 'draft-font',
      message: 'Using bundled typography; production font approval is still required.',
    });
  const add = (...args) => violations.push(violation(...args));
  if (bp.mode !== 'static')
    add(
      'animation-review',
      'Animated scenes require timeline review; strict automatic generation uses static authored variants.',
    );
  for (let i = 0; i < bp.layers.length; i++) {
    const content = bp.layers[i];
    if (!['text', 'button', 'logo'].includes(content.type) || !content.visible || !content.opacity)
      continue;
    for (const cover of bp.layers.slice(i + 1))
      if (
        cover.visible &&
        cover.opacity > 0.01 &&
        ['shape', 'background', 'cutout', 'image'].includes(cover.type) &&
        overlap(content, cover) > 1
      )
        add(
          'content-occlusion',
          `${cover.name} may obscure ${content.name}. Move it behind the content or change its bounds.`,
          content.id,
        );
  }
  if (
    policy.requireFont &&
    (!resources.fontFamily || !campaign.fontAssetId || campaign.typography === 'outfit')
  )
    add('font-missing', 'Load the selected production font before generation.');
  for (const role of policy.requiredRoles) {
    const layer = bp.layers.find((l) => l.source === role && l.visible && l.opacity > 0);
    if (
      !layer ||
      (['hero', 'logo'].includes(role)
        ? !resources[role] || !campaign[`${role}AssetId`]
        : !boundText(layer, campaign).trim())
    )
      add('required-role', `Supply and show the required ${role}.`, layer?.id);
  }
  for (const role of ['headline', 'subtitle', 'cta', 'legal']) {
    if (!campaign[role]) continue;
    const texts = bp.layers
      .filter((l) => l.source === role && l.visible && l.opacity > 0)
      .map((l) => boundText(l, campaign));
    if (!texts.includes(campaign[role]) && texts.join('\n') !== campaign[role])
      add('exact-copy', `Restore all supplied ${role} copy; no shortening is permitted.`);
  }
  for (const layer of bp.layers) {
    const old = base?.layers.find((l) => l.id === layer.id);
    const props = {
      position: ['x', 'y', 'rotation'],
      size: ['width', 'height'],
      font: ['fontSize', 'minFontSize', 'fontWeight', 'maxLines', 'lineHeight'],
      crop: ['focalX', 'focalY', 'zoom', 'imageFit'],
      visibility: ['visible', 'opacity'],
      copy: ['text', 'textOverride', 'source', 'sourcePart'],
    };
    for (const lock of locks[layer.id] || [])
      if (
        old &&
        props[lock]?.some((k) => canonical(old[k] ?? null) !== canonical(layer[k] ?? null))
      )
        add(
          'locked-property',
          `Unlock ${layer.name} ${lock} or keep its previous value.`,
          layer.id,
        );
    if (!layer.visible || !layer.opacity) continue;
    if (layer.rotation)
      add(
        'rotation-review',
        `${layer.name}: rotate to zero for strict automatic validation.`,
        layer.id,
      );
    const m = policy.safeInset;
    if (
      layer.x < m - 0.1 ||
      layer.y < m - 0.1 ||
      layer.x + layer.width > bp.width - m + 0.1 ||
      layer.y + layer.height > bp.height - m + 0.1
    )
      add('safe-bounds', `${layer.name} leaves the configured safe area.`, layer.id);
    if (['text', 'button'].includes(layer.type)) {
      const text = boundText(layer, campaign),
        box = layer.type === 'button' ? buttonTextBox(layer) : layer;
      const measured = measureStrictText(context, text, box, resources);
      measurements[layer.id] = measured;
      if (measured.overflow)
        add(
          'text-fit',
          `${layer.name} cannot fit at ${layer.minFontSize}px within ${layer.maxLines} rows. Try another variant, larger size or unlock its box.`,
          layer.id,
          {
            size: measured.size,
            rows: measured.lines.length,
            width: Math.max(...measured.widths),
            height: measured.height,
          },
        );
      const contrast = contrastRatio(
        hexToRgb(layer.type === 'button' ? layer.textFill : layer.fill),
        hexToRgb(layer.type === 'button' ? layer.fill : bp.background),
      );
      if (text && contrast < policy.contrastMinimum)
        add('contrast', `${layer.name} needs a higher-contrast color treatment.`, layer.id, {
          contrast,
          minimum: policy.contrastMinimum,
        });
    }
    if (layer.type === 'image' && focus && resources.hero) {
      const { image, frame } = heroFor(layer, resources);
      const fit = assessSubject(bp, layer, image, effectiveBox(focus, frame), resources.heroCrop);
      if (
        fit.unsupported ||
        1 - fit.clipped < policy.minimumSubject ||
        fit.covered > 0.01 ||
        fit.faded > 0.05
      )
        add(
          'subject-retention',
          'Select another crop, a narrower focal region or a different layout to retain the subject.',
          layer.id,
          { visibleFraction: 1 - fit.clipped, covered: fit.covered, faded: fit.faded },
        );
    }
  }
  for (const [id, rules] of Object.entries(locks))
    if (
      rules.length &&
      base?.layers.some((l) => l.id === id) &&
      !bp.layers.some((l) => l.id === id)
    )
      add('locked-layer', `Restore locked layer ${id}.`, id);
  const times =
    bp.mode === 'static'
      ? [0]
      : [
          ...new Set(
            animationSamples(bp).flatMap((s) => [s.time, Math.max(s.time, s.time + s.delay - 1)]),
          ),
        ];
  for (const time of times) {
    const { scene, local } = sceneAt(bp, time);
    const layers = bp.layers
      .map((l) => layerAt(l, scene, local))
      .filter((l) => l.visible && l.opacity > 0.01);
    if (
      scene.transitionMs ||
      layers.some((l) => scene.tracks[l.id]?.dx || scene.tracks[l.id]?.dy)
    ) {
      add(
        'motion-review',
        'Moving or crossfading layouts require manual review; use static authored variants for strict generation.',
      );
      break;
    }
    for (let i = 0; i < layers.length; i++)
      for (let j = i + 1; j < layers.length; j++) {
        const a = layers[i],
          b = layers[j];
        if (
          ['shape', 'background', 'cutout'].includes(a.type) ||
          ['shape', 'background', 'cutout'].includes(b.type)
        )
          continue;
        if (overlap(a, b) > 1)
          add(
            'layer-overlap',
            `${a.name} overlaps ${b.name}. Use a separated variant or adjust the boxes.`,
            a.id,
            { other: b.id, time },
          );
      }
  }
  return {
    hardViolations: [
      ...new Map(violations.map((v) => [`${v.code}:${v.layerId || ''}:${v.message}`, v])).values(),
    ],
    measurements,
    warnings,
    method: 'native-canvas/solid-background-separated-roles-v1',
  };
}
/** No I/O, inference, random IDs, clock reads, or mutation inside the solver. */
export function solveLayout(input, { context, resources, signal } = {}) {
  const policy = strictPolicy(input.policy),
    rejected = [],
    valid = [];
  const focus = input.focus || input.campaign.subjectFocus?.box;
  const locks =
    input.locks ||
    Object.fromEntries(
      (input.base?.layers || []).filter((l) => l.locks?.length).map((l) => [l.id, l.locks]),
    );
  const fixed = input.keepBoxes || Object.values(locks).some((l) => l.includes('variant'));
  const candidates = [];
  if (input.base)
    candidates.push({ id: 'current', scene: strictBase(input.base, policy), variant: 'current' });
  if (input.base?.mode === 'static' && input.blueprintEdit && !fixed)
    try {
      candidates.push({
        id: 'qwen-blueprint',
        scene: proposedBlueprint(input.base, input.blueprintEdit, policy),
        variant: 'qwen-blueprint',
      });
    } catch (error) {
      rejected.push({
        id: 'qwen-blueprint',
        hardViolations: [violation('blueprint-edit', error.message)],
      });
    }
  if (!fixed)
    for (const variant of policy.variants)
      for (const split of ['hero-left', 'hero-right'].includes(variant)
        ? [0.46, 0.36, 0.28]
        : [0.46]) {
        if (candidates.length >= policy.maxCandidates) break;
        const id = `${variant}:${split}`;
        try {
          candidates.push({
            id,
            variant,
            scene: authorVariant(input.target, variant, policy, input.campaign, split),
          });
        } catch (error) {
          rejected.push({ id, hardViolations: [violation('variant-size', error.message)] });
        }
      }
  // Keep all cover candidates first; whole-image treatments are bounded fallbacks.
  if (policy.allowContain)
    for (const candidate of [...candidates]) {
      if (candidate.id === 'current' || candidates.length >= policy.maxCandidates) continue;
      candidates.push({
        ...candidate,
        id: `${candidate.id}:contain`,
        scene: {
          ...candidate.scene,
          layers: candidate.scene.layers.map((l) =>
            l.type === 'image' && !locks[l.id]?.includes('crop')
              ? { ...l, imageFit: 'contain', focalX: 0.5, focalY: 0.5, zoom: 1 }
              : l,
          ),
        },
      });
    }
  for (const candidate of candidates.slice(0, policy.maxCandidates)) {
    signal?.throwIfAborted();
    let scene = candidate.scene;
    if (input.base)
      scene = {
        ...scene,
        layers: scene.layers.map((l) => {
          const old = input.base.layers.find((o) => o.id === l.id),
            ls = locks[l.id] || [];
          if (!old || !ls.length) return l;
          const groups = {
            position: ['x', 'y', 'rotation'],
            size: ['width', 'height'],
            font: ['fontSize', 'minFontSize', 'fontWeight', 'maxLines', 'lineHeight'],
            crop: ['focalX', 'focalY', 'zoom', 'imageFit'],
            visibility: ['visible', 'opacity'],
            copy: ['text', 'textOverride', 'source', 'sourcePart'],
          };
          return {
            ...l,
            ...Object.fromEntries(ls.flatMap((k) => (groups[k] || []).map((p) => [p, old[p]]))),
          };
        }),
      };
    scene = cropScene(scene, focus, resources, locks);
    const report = validateStrictScene(scene, input.campaign, resources, policy, context, {
      base: input.base,
      locks,
      focus,
    });
    if (report.hardViolations.length) {
      rejected.push({ id: candidate.id, ...report });
      continue;
    }
    const texts = Object.entries(report.measurements).filter(
      ([id]) => scene.layers.find((l) => l.id === id)?.source !== 'legal',
    );
    const readability = texts.length
      ? texts.reduce(
          (sum, [id, m]) =>
            sum + Math.min(1, m.size / scene.layers.find((l) => l.id === id).fontSize),
          0,
        ) / texts.length
      : 0;
    const preferred =
      input.target.height <= 120
        ? 'strip-short-copy'
        : input.target.height > input.target.width * 1.2
          ? 'hero-stacked'
          : 'hero-right';
    const composition = candidate.variant === preferred ? 1 : 0;
    const priority = input.variantPriority || [];
    const rank = priority.indexOf(candidate.variant);
    const plannerPreference = rank < 0 ? 0 : 1 - rank / priority.length;
    const contained = scene.layers.some((l) => l.imageFit === 'contain');
    const score =
      Math.round(
        (readability * 0.65 +
          (candidate.id === 'current' ? 0.15 : candidate.id === 'qwen-blueprint' ? 0.23 : 0) +
          composition * 0.1 +
          plannerPreference * 0.1 -
          (contained ? 0.02 : 0)) *
          1e6,
      ) / 1e6;
    valid.push({
      ...candidate,
      scene,
      report,
      score,
      scoreBreakdown: {
        readability,
        composition,
        plannerPreference,
        contained,
        continuity: ['current', 'qwen-blueprint'].includes(candidate.id) ? 1 : 0,
      },
    });
  }
  valid.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id, 'en'));
  const winner = valid[0];
  return {
    schemaVersion: 1,
    engine: SOLVER_VERSION,
    target: input.target,
    technicalStatus: winner ? 'valid' : 'needs_review',
    reviewStatus: 'draft',
    exportEligibility: winner ? 'draft_only' : 'blocked',
    candidateId: winner?.id || null,
    variant: winner?.variant || null,
    scene: winner?.scene || null,
    report: winner?.report || {
      hardViolations: [
        ...new Map(
          rejected.flatMap((r) => r.hardViolations).map((v) => [`${v.code}:${v.layerId || ''}`, v]),
        ).values(),
      ],
    },
    score: winner?.score || 0,
    scoreBreakdown: winner?.scoreBreakdown || {},
    alternatives: valid.slice(1).map(({ id, score }) => ({ id, score })),
    rejected,
  };
}
