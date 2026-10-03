import { boundText } from './render.js';
import { fitText } from './text-fit.js';
import { suggestTextLayout, textObstacles } from './text-layout.js';
import { focusBlueprint } from './subject-position.js';
import { reserveLegalFooter } from './legal-footer.js';
import { resourcesForBlueprint } from './blueprint-resources.js';

/** Only content that changes composition invalidates a campaign's arranged snapshots. */
export const layoutKey = (campaign) =>
  JSON.stringify([
    campaign.headline,
    campaign.subtitle,
    campaign.cta,
    campaign.legal,
    campaign.heroAssetId,
    campaign.logoAssetId,
    campaign.fontAssetId,
    ...(campaign.heroUpscale ||
    campaign.heroCutout ||
    campaign.heroExtendWide ||
    campaign.heroExtendTall ||
    campaign.ctaColor ||
    campaign.subjectInFront ||
    campaign.autoReadability
      ? [
          campaign.heroUpscale,
          campaign.heroCutout,
          campaign.heroExtendWide,
          campaign.heroExtendTall,
          campaign.ctaColor,
          campaign.subjectInFront,
          campaign.autoReadability,
        ]
      : []),
    ...(campaign.referencePack ? [campaign.referencePack] : []),
    ...(campaign.typography === 'outfit' ? ['outfit-800-600-400'] : []),
    ...(campaign.subjectFocus ? [campaign.subjectFocus] : []),
    ...(campaign.keepBlueprintBoxes ? ['fixed-blueprint-boxes'] : []),
  ]);

const overlap = (a, b) =>
  a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
const stationary = (bp, layer) =>
  !layer.rotation &&
  !bp.scenes.some((scene) => scene.tracks[layer.id]?.dx || scene.tracks[layer.id]?.dy);
const together = (bp, a, b) => textObstacles({ ...bp, layers: [a, b] }, a).length > 0;

function arrangeText(bp, campaign, resources, context, preserveFlow) {
  const texts = bp.layers.filter(
    (layer) =>
      layer.type === 'text' && layer.source !== 'legal' && layer.visible && stationary(bp, layer),
  );
  const textIds = new Set(texts.map((layer) => layer.id));
  const candidates = texts
    .filter((layer) => boundText(layer, campaign).trim() || layer.sourcePart === 'remaining-lines')
    .map((layer) => {
      const space = suggestTextLayout(
        {
          ...bp,
          layers: bp.layers.map((other) =>
            textIds.has(other.id) && other.id !== layer.id ? { ...other, visible: false } : other,
          ),
        },
        layer.id,
      ).patch;
      if (!space) return null;
      return { layer, space };
    })
    .filter(Boolean);
  // Text visible in separate GIF parts can share the same area. Co-visible copy gets rows.
  const groups = [];
  for (const candidate of candidates) {
    const matching = groups.filter((group) =>
      group.some(
        (other) =>
          overlap(candidate.space, other.space) && together(bp, candidate.layer, other.layer),
      ),
    );
    if (!matching.length) groups.push([candidate]);
    else {
      const merged = [candidate, ...matching.flat()];
      matching.forEach((group) => groups.splice(groups.indexOf(group), 1));
      groups.push(merged);
    }
  }
  const patches = new Map();
  for (const group of groups) {
    group.sort((a, b) => a.layer.y - b.layer.y || a.layer.x - b.layer.x);
    const x = Math.max(...group.map(({ space }) => space.x));
    const y = Math.max(...group.map(({ space }) => space.y));
    const width = Math.min(...group.map(({ space }) => space.x + space.width)) - x;
    const height = Math.min(...group.map(({ space }) => space.y + space.height)) - y;
    const gap = bp.height <= 100 ? 3 : 6;
    const available = height - gap * (group.length - 1);
    if (
      width < 20 ||
      available < group.reduce((sum, { layer }) => sum + layer.minFontSize * layer.lineHeight, 0)
    )
      continue;
    const measured = group.map(({ layer, space }) => {
      const textFlow =
        preserveFlow || layer.textOverride != null || layer.textFlow === 'single-line'
          ? layer.textFlow
          : 'auto';
      const fontSize = Math.max(
        layer.minFontSize,
        Math.min(space.fontSize, layer.fontSize * (preserveFlow ? 1 : 1.15)),
      );
      const next = { ...layer, width, height: bp.height, textFlow, fontSize };
      const fitted = fitText(context, boundText(layer, campaign), next, resources, { grow: false });
      return {
        layer: next,
        wanted: Math.max(
          layer.minFontSize * layer.lineHeight,
          fitted.lines.length * fitted.size * layer.lineHeight,
        ),
      };
    });
    const wanted = measured.reduce((sum, item) => sum + item.wanted, 0);
    let top = y;
    measured.forEach(({ layer, wanted: demand }, index) => {
      const boxHeight =
        index === measured.length - 1
          ? y + height - top
          : Math.floor((available * demand) / wanted);
      patches.set(layer.id, {
        ...layer,
        x,
        y: top,
        width,
        height: boxHeight,
        verticalAlign: preserveFlow ? layer.verticalAlign : 'middle',
      });
      top += boxHeight + gap;
    });
  }
  return { ...bp, layers: bp.layers.map((layer) => patches.get(layer.id) || layer) };
}

function photoVariant(bp, photo, factor) {
  if (!photo || factor === 1) return bp;
  const next = { ...photo };
  if (photo.fadeDirection === 'left' && Math.abs(photo.x + photo.width - bp.width) <= 8) {
    next.width = Math.min(bp.width * 0.55, Math.max(24, photo.width * factor));
    next.x = photo.x + photo.width - next.width;
  } else if (photo.fadeDirection === 'right' && photo.x <= 8) {
    next.width = Math.min(bp.width * 0.55, Math.max(24, photo.width * factor));
  } else if (photo.fadeDirection === 'top' && photo.y > bp.height * 0.2) {
    next.height = Math.min(bp.height * 0.7, Math.max(24, photo.height * factor));
    next.y = Math.max(0, photo.y + photo.height - next.height);
  } else if (photo.fadeDirection === 'bottom' && photo.y <= 8) {
    next.height = Math.min(bp.height * 0.7, Math.max(24, photo.height * factor));
  }
  return { ...bp, layers: bp.layers.map((layer) => (layer.id === photo.id ? next : layer)) };
}

/** Deterministic content layout; retains market orientation, logo/legal, crop focus and timing. */
export function arrangeBanner(
  bp,
  campaign,
  resources,
  {
    context = document.createElement('canvas').getContext('2d'),
    preserveFlow = false,
    resizeImage = true,
  } = {},
) {
  if (bp.layers.some((l) => l.fitPolicy === 'strict-v1')) return bp;
  bp = reserveLegalFooter(bp);
  resources = resourcesForBlueprint(bp, resources);
  // Text fitting happens inside each saved box in the shared renderer. Subject focus
  // can still pan/zoom the photograph without moving its frame or the text layers.
  if (campaign.keepBlueprintBoxes) return focusBlueprint(bp, campaign, resources).blueprint;
  const photo = bp.layers.find(
    (layer) =>
      layer.type === 'image' && layer.source === 'hero' && layer.visible && stationary(bp, layer),
  );
  const variants = photo && resizeImage ? [1, 0.85, 0.7, 1.15] : [1];
  let best = bp,
    bestScore = Infinity;
  for (const factor of variants) {
    const arranged = arrangeText(
      reserveLegalFooter(photoVariant(bp, photo, factor)),
      campaign,
      resources,
      context,
      preserveFlow,
    );
    const focused = focusBlueprint(arranged, campaign, resources);
    const candidate = focused.blueprint;
    let score = Math.abs(Math.log(factor)) * 10 + focused.score;
    for (const layer of candidate.layers) {
      if (
        layer.type !== 'text' ||
        layer.source === 'legal' ||
        !layer.visible ||
        !boundText(layer, campaign).trim()
      )
        continue;
      const fitted = fitText(context, boundText(layer, campaign), layer, resources, {
        grow: false,
      });
      score += (fitted.overflow ? 10000 : 0) + (1 - fitted.size / layer.fontSize) * 100;
    }
    if (photo && resources.hero) {
      const frame = candidate.layers.find((layer) => layer.id === photo.id);
      const [w, h] = resources.heroCrop?.slice(2) || [resources.hero.width, resources.hero.height];
      if (w && h) score += Math.abs(Math.log(frame.width / frame.height / (w / h))) * 15;
    }
    if (score < bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  return best;
}
