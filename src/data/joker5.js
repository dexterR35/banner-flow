import { validateBlueprint } from '../core/schema.js';
import inventory from './asset-manifest.json' with { type: 'json' };
import { JOKER5_MARKET, joker5ImageFade } from './joker5-legacy.js';
export { JOKER5_MARKET, joker5ImageFade };
export {
  JOKER5_REFERENCES as LEGACY_JOKER5_REFERENCES,
  createJoker5Blueprint as createLegacyJoker5Blueprint,
} from './joker5-legacy.js';

// Measurements of the September GIF/PNG refresh, in native pixels.
// Each folder is an alternative treatment, not another output of the same size.
const measured = [
  {
    size: [160, 120],
    logo: [14, 13, 55, 17],
    headline: [7, 40, 73, 25],
    subtitle: [5, 40, 74, 23],
    cta: [11, 74, 65, 14],
    hero: [80, 0, 80, 93],
    legal: [2, 99, 156, 17],
    sequence: 'offer-spins',
    mask: {
      logo: [10, 13, 51, 17],
      headline: [7, 40, 63, 22],
      cta: [11, 69, 55, 12],
      hero: [72, 0, 88, 95],
    },
  },
  {
    size: [170, 100],
    logo: [23, 8, 54, 17],
    headline: [7, 34, 83, 28],
    subtitle: [7, 35, 80, 27],
    cta: [12, 72, 73, 17],
    hero: [91, 0, 79, 100],
    legal: [11, 10, 74, 72],
    sequence: 'offer-spins-legal',
  },
  {
    size: [180, 150],
    logo: [23, 14, 59, 18],
    headline: [9, 42, 79, 26],
    subtitle: [10, 72, 80, 23],
    cta: [14, 104, 71, 16],
    hero: [94, 0, 86, 121],
    legal: [3, 125, 174, 19],
    sequence: 'static',
  },
  {
    size: [240, 100],
    logo: [32, 8, 54, 17],
    headline: [9, 34, 100, 29],
    subtitle: [7, 37, 106, 24],
    cta: [24, 74, 75, 17],
    hero: [111, 0, 129, 100],
    legal: [8, 10, 91, 81],
    sequence: 'offer-spins-legal',
  },
  {
    size: [300, 100],
    logo: [9, 29, 66, 23],
    headline: [86, 12, 127, 39],
    subtitle: [84, 24, 132, 23],
    cta: [110, 56, 80, 18],
    hero: [218, 0, 82, 81],
    legal: [3, 86, 294, 11],
    sequence: 'offer-spins',
    mask: {
      logo: [9, 29, 76, 22],
      headline: [100, 12, 125, 39],
      subtitle: [91, 24, 136, 23],
      cta: [123, 56, 80, 18],
      hero: [230, 0, 70, 81],
    },
  },
  {
    size: [300, 250],
    logo: [50, 17, 113, 34],
    headline: [9, 69, 199, 65],
    subtitle: [12, 139, 191, 34],
    cta: [40, 191, 135, 30],
    hero: [208, 0, 92, 230],
    legal: [5, 235, 290, 11],
    sequence: 'static',
    mask: {
      logo: [17, 26, 110, 33],
      headline: [13, 75, 177, 55],
      subtitle: [13, 137, 175, 30],
      cta: [34, 185, 132, 29],
      hero: [190, 0, 110, 226],
    },
  },
  {
    size: [300, 50],
    logo: [7, 9, 66, 20],
    headline: [105, 6, 91, 25],
    subtitle: [94, 7, 115, 23],
    hero: [212, 0, 88, 36],
    legal: [4, 39, 292, 8],
    sequence: 'offer-spins',
    mask: {
      headline: [99, 6, 97, 25],
      cta: [90, 7, 109, 24],
      hero: [209, 0, 91, 36],
      sequence: 'offer-spins-cta',
    },
  },
  {
    size: [320, 100],
    logo: [7, 27, 78, 23],
    headline: [105, 10, 124, 36],
    subtitle: [99, 22, 133, 23],
    cta: [120, 55, 91, 20],
    hero: [240, 0, 80, 80],
    legal: [7, 86, 306, 11],
    sequence: 'offer-spins',
    mask: {
      logo: [65, 13, 102, 34],
      headline: [12, 54, 211, 22],
      subtitle: [5, 54, 215, 22],
      cta: [54, 55, 110, 27],
      hero: [224, 0, 96, 84],
      legal: [7, 87, 306, 10],
      sequence: 'offer-spins-cta',
      singleLine: true,
    },
  },
  {
    size: [320, 50],
    logo: [7, 5, 76, 27],
    headline: [119, 6, 91, 25],
    subtitle: [106, 6, 116, 24],
    cta: [111, 7, 109, 24],
    hero: [224, 0, 96, 36],
    legal: [7, 39, 306, 8],
    sequence: 'offer-spins-cta',
    mask: {
      logo: [14, 9, 67, 21],
      headline: [98, 6, 137, 25],
      subtitle: [96, 6, 138, 24],
      cta: [104, 7, 109, 24],
      hero: [239, 0, 81, 36],
      legal: [3, 39, 280, 8],
    },
  },
  {
    size: [350, 100],
    logo: [9, 29, 76, 22],
    headline: [112, 12, 126, 36],
    subtitle: [97, 23, 151, 24],
    cta: [135, 56, 80, 18],
    hero: [249, 0, 101, 80],
    legal: [13, 86, 324, 11],
    sequence: 'offer-spins',
  },
  {
    size: [728, 90],
    logo: [26, 27, 127, 38],
    headline: [373, 12, 335, 28],
    subtitle: [373, 44, 335, 24],
    cta: [455, 24, 168, 34],
    hero: [155, 0, 192, 90],
    legal: [350, 75, 371, 12],
    sequence: 'offer-and-spins-cta',
    singleLine: true,
    mask: {
      logo: [41, 27, 127, 38],
      headline: [392, 16, 300, 25],
      subtitle: [392, 45, 300, 23],
      hero: [170, 0, 211, 90],
      legal: [383, 75, 338, 12],
    },
  },
];

export const JOKER5_REFERENCES = measured.flatMap((row) =>
  ['chest', 'mask'].map((variant) => {
    const [width, height] = row.size;
    const boxes = { ...row, ...(variant === 'mask' ? row.mask : {}) };
    const file = `joker5 part${variant === 'chest' ? 1 : 2}/${width}x${height}.${boxes.sequence === 'static' ? 'png' : 'gif'}`;
    const asset = inventory.find((a) => a.file === file);
    if (!asset || asset.width !== width || asset.height !== height)
      throw new Error(`Missing or mismatched Joker5 reference: ${file}`);
    return {
      id: `JOKER5-${width}x${height}-${variant}`,
      width,
      height,
      variant,
      label: variant === 'chest' ? 'Chest' : 'Mask',
      file,
      stillFile: asset.stillFile || file,
      durationsMs: asset.durationsMs,
      repeat: asset.loop ?? 0,
      boxes,
    };
  }),
);

export const JOKER5_SIZES = JOKER5_REFERENCES.filter((r) => r.variant === 'chest');

export function createJoker5SizeBlueprint(reference) {
  return {
    ...createJoker5Blueprint(reference),
    id: `JOKER5-${reference.width}x${reference.height}`,
    name: `${reference.width}x${reference.height}`,
  };
}

export function createJoker5Blueprint(reference) {
  const { id, width, height, label, boxes: b } = reference;
  const layer = (id, type, source, rect, props = {}) => ({
    id,
    name: id === 'logo' ? 'Joker5 logo' : id,
    type,
    source,
    x: rect[0],
    y: rect[1],
    width: rect[2],
    height: rect[3],
    fontSize: 80,
    minFontSize: 4,
    maxLines: 2,
    lineHeight: 1,
    align: 'center',
    textFlow: 'manual',
    ...props,
  });
  const layers = [
    layer('hero', 'image', 'hero', b.hero, joker5ImageFade(reference)),
    layer('logo', 'logo', 'logo', b.logo),
    layer('headline', 'text', 'headline', b.headline, {
      fill: '#ffc447',
      textFlow: b.singleLine ? 'single-line' : 'manual',
      maxLines: b.singleLine ? 1 : 2,
    }),
  ];
  if (b.singleLine)
    layers.push(
      layer('subtitle', 'text', 'subtitle', b.subtitle, {
        fill: '#9370e9',
        textFlow: 'single-line',
        maxLines: 1,
      }),
    );
  else {
    const [x, y, w, h] = b.subtitle;
    layers.push(
      layer('subtitle', 'text', 'subtitle', [x, y, w, h * 0.6], {
        fill: '#9370e9',
        sourcePart: 'first-line',
        maxLines: 1,
      }),
    );
    layers.push(
      layer('subtitle-support', 'text', 'subtitle', [x, y + h * 0.6, w, h * 0.4], {
        fill: '#9370e9',
        sourcePart: 'remaining-lines',
        maxLines: 1,
      }),
    );
  }
  if (b.cta)
    layers.push(
      layer('cta', 'button', 'cta', b.cta, {
        fill: '#f6c84e',
        textFill: '#080607',
        textPaddingX: b.cta[2] * 0.12,
        textPaddingY: b.cta[3] * 0.2,
        radius: 30,
        maxLines: 1,
      }),
    );
  layers.push(
    layer('legal', 'text', 'legal', b.legal, {
      fill: '#e2dfeb',
      fontWeight: 'normal',
      ...(b.sequence.endsWith('-legal')
        ? { fontSize: Math.floor(b.legal[3] / 7), minFontSize: Math.floor(b.legal[3] / 7) }
        : {}),
      align: b.sequence.endsWith('-legal') ? 'left' : 'center',
      textFlow: width >= 300 ? 'single-line' : 'auto',
      maxLines: b.sequence.endsWith('-legal') ? 8 : width >= 300 ? 1 : 2,
    }),
  );
  const base = ['hero', 'logo', ...(b.sequence.endsWith('-legal') ? [] : ['legal'])];
  const spins = layers.filter((l) => l.source === 'subtitle').map((l) => l.id);
  const persistentCta = b.cta && !b.sequence.endsWith('-cta') ? ['cta'] : [];
  const parts =
    b.sequence === 'static'
      ? [['Artwork', layers.map((l) => l.id)]]
      : b.sequence === 'offer-and-spins-cta'
        ? [
            ['Offer + free spins', [...base, 'headline', ...spins]],
            ['Call to action', [...base, 'cta']],
          ]
        : [
            ['Offer', [...base, 'headline', ...persistentCta]],
            ['Free spins', [...base, ...spins, ...persistentCta]],
            ...(b.sequence.endsWith('-legal')
              ? [['Legal', ['hero', 'legal']]]
              : b.sequence.endsWith('-cta')
                ? [['Call to action', [...base, 'cta']]]
                : []),
          ];
  if (b.sequence !== 'static' && parts.length !== reference.durationsMs.length)
    throw new Error(`Frame count mismatch: ${reference.file}`);
  return validateBlueprint({
    schemaVersion: 1,
    id,
    marketId: 'JOKER5',
    name: `${width}x${height} · ${label}`,
    width,
    height,
    mode: parts.length > 1 ? 'animated' : 'static',
    repeat: reference.repeat,
    background: '#170e29',
    resourcePreset: id,
    layers,
    scenes: parts.map(([name, visible], i) => ({
      id: `part-${i + 1}`,
      name,
      durationMs: reference.durationsMs[i] || 3000,
      transitionMs: 0,
      tracks: Object.fromEntries(layers.map((l) => [l.id, { visible: visible.includes(l.id) }])),
    })),
  });
}
