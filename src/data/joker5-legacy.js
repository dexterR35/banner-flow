import { validateBlueprint } from '../core/schema.js';
import { createFadeMesh } from '../core/fade-mesh.js';

export const JOKER5_MARKET = {
  id: 'JOKER5',
  name: 'Joker5',
  logoLabel: 'Joker5 logo',
  locale: 'fi-FI',
  flag: 'J5',
  legal: '18+ | Pelaathan vastuullisesti |\nKäyttöehdot pätevät | MGA/B2C/126/2006',
  legalStatus: 'reference transcription',
};

// Native-pixel measurements of all supplied PNGs. A filename is evidence, not a size.
// Rectangles are [x, y, width, height]; absent roles stay absent in that format.
const measured = [
  {
    size: [120, 240],
    logo: [30, 17, 61, 18],
    headline: [17, 47, 86, 28],
    subtitle: [18, 76, 84, 21],
    cta: [24, 103, 73, 16],
    hero: [0, 124, 120, 80],
    legal: [7, 208, 106, 26],
  },
  {
    size: [160, 120],
    logo: [15, 16, 45, 13],
    headline: [7, 40, 63, 22],
    cta: [11, 69, 55, 12],
    hero: [78, 0, 82, 95],
    legal: [2, 99, 156, 17],
    mask: { hero: [72, 0, 88, 95] },
  },
  {
    size: [170, 100],
    logo: [15, 10, 45, 13],
    headline: [7, 34, 62, 22],
    cta: [11, 62, 55, 12],
    hero: [78, 0, 92, 79],
    legal: [12, 83, 146, 14],
    mask: { hero: [70, 0, 100, 79] },
  },
  {
    size: [180, 150],
    logo: [20, 20, 58, 17],
    headline: [10, 51, 80, 26],
    cta: [14, 87, 70, 16],
    hero: [94, 0, 86, 121],
    legal: [3, 125, 174, 19],
  },
  {
    size: [200, 200],
    logo: [10, 31, 53, 16],
    headline: [9, 60, 98, 33],
    subtitle: [9, 96, 99, 29],
    cta: [10, 130, 92, 20],
    hero: [110, 0, 90, 171],
    legal: [6, 175, 188, 19],
  },
  {
    size: [240, 100],
    logo: [57, 12, 72, 21],
    headline: [12, 40, 164, 14],
    subtitle: [12, 57, 164, 11],
    hero: [179, 0, 61, 98],
    legal: [10, 78, 169, 18],
  },
  {
    size: [250, 130],
    logo: [58, 12, 70, 21],
    headline: [12, 40, 164, 14],
    subtitle: [12, 57, 164, 11],
    cta: [55, 77, 74, 16],
    hero: [179, 0, 71, 121],
    legal: [9, 106, 170, 20],
  },
  {
    size: [250, 250],
    logo: [25, 26, 89, 27],
    headline: [9, 77, 119, 40],
    subtitle: [7, 120, 125, 33],
    cta: [14, 177, 110, 24],
    hero: [133, 0, 117, 218],
    legal: [32, 222, 186, 22],
  },
  {
    size: [350, 100],
    file: '300x100.png',
    logo: [9, 29, 76, 22],
    headline: [112, 12, 126, 36],
    cta: [135, 56, 80, 18],
    hero: [248, 0, 102, 80],
    legal: [28, 84, 314, 11],
    mask: { logo: [10, 29, 76, 22], hero: [238, 0, 112, 80] },
  },
  {
    size: [350, 250],
    file: '300x250.png',
    logo: [16, 26, 110, 33],
    headline: [13, 86, 200, 62],
    cta: [19, 166, 187, 42],
    hero: [215, 0, 135, 225],
    legal: [18, 229, 319, 13],
  },
  {
    size: [300, 50],
    logo: [7, 9, 66, 20],
    headline: [108, 6, 88, 25],
    hero: [212, 0, 88, 37],
    legal: [4, 39, 292, 8],
    mask: { hero: [202, 0, 98, 37] },
  },
  {
    size: [320, 100],
    logo: [7, 27, 78, 23],
    headline: [105, 10, 124, 36],
    cta: [118, 51, 91, 20],
    hero: [240, 0, 80, 80],
    legal: [14, 84, 294, 11],
    chestOnly: true,
  },
  {
    size: [320, 50],
    logo: [7, 9, 76, 23],
    headline: [119, 7, 88, 25],
    hero: [224, 0, 96, 37],
    legal: [13, 39, 299, 8],
    chestOnly: true,
  },
  {
    size: [728, 90],
    logo: [26, 27, 127, 38],
    headline: [392, 21, 300, 25],
    subtitle: [392, 50, 300, 21],
    hero: [155, 0, 192, 90],
    legal: [350, 75, 371, 12],
    chestOnly: true,
  },
];

export const JOKER5_REFERENCES = measured.flatMap((row) =>
  (row.chestOnly ? ['chest'] : ['chest', 'mask']).map((variant) => {
    const [width, height] = row.size;
    const boxes = { ...row, ...(variant === 'mask' ? row.mask : {}) };
    return {
      id: `JOKER5-${width}x${height}-${variant}`,
      width,
      height,
      variant,
      label: variant === 'chest' ? 'Chest' : 'Mask',
      file: `joker5 part${variant === 'chest' ? 1 : 2}/${row.file || `${width}x${height}.png`}`,
      boxes,
    };
  }),
);

export const JOKER5_SIZES = JOKER5_REFERENCES.filter((r) => r.variant === 'chest');

export function joker5ImageFade(reference) {
  const { hero, headline } = reference.boxes;
  const direction =
    hero[1] > headline[1] + headline[3] ? 'top' : hero[0] < headline[0] ? 'right' : 'left';
  return {
    fade: 0.24,
    fadeDirection: direction,
    fadeMesh: { ...createFadeMesh('straight', 16, 0.12), softness: 0.24 },
  };
}

export function createJoker5SizeBlueprint(reference) {
  return {
    ...createJoker5Blueprint(reference),
    id: `JOKER5-${reference.width}x${reference.height}`,
    name: `${reference.width}x${reference.height}`,
  };
}

export function createJoker5Blueprint(reference) {
  const { id, width, height, label, boxes } = reference;
  const titleY = Math.max(0, boxes.headline[1] - boxes.headline[3] * 0.12);
  const titleBottom = Math.min(
    boxes.headline[1] + boxes.headline[3] * 1.13,
    (boxes.subtitle?.[1] ?? boxes.cta?.[1] ?? boxes.legal[1]) - 1,
  );
  const layer = (id, type, source, rect, props = {}) => ({
    id,
    name: source === 'logo' ? 'Joker5 logo' : id,
    type,
    source,
    x: rect[0],
    y: rect[1],
    width: rect[2],
    height: rect[3],
    fontSize: 24,
    minFontSize: 4,
    maxLines: 2,
    lineHeight: 1,
    align: 'left',
    textFlow: 'auto',
    ...props,
  });
  const layers = [
    layer('hero', 'image', 'hero', boxes.hero, joker5ImageFade(reference)),
    layer('logo', 'logo', 'logo', boxes.logo),
    layer(
      'headline',
      'text',
      'headline',
      [boxes.headline[0], titleY, boxes.headline[2], titleBottom - titleY],
      {
        fill: '#ffc447',
        textFlow:
          width === 728 || width === 240 || (width === 250 && height === 130)
            ? 'single-line'
            : 'manual',
        maxLines: width === 728 || width === 240 || (width === 250 && height === 130) ? 1 : 2,
      },
    ),
  ];
  if (boxes.subtitle) {
    const [x, y, w, h] = boxes.subtitle;
    if (height >= 200) {
      layers.push(
        layer('subtitle', 'text', 'subtitle', [x, y, w, h * 0.62], {
          fill: '#9370e9',
          sourcePart: 'first-line',
          align: 'center',
          maxLines: 1,
        }),
      );
      layers.push(
        layer('subtitle-support', 'text', 'subtitle', [x, y + h * 0.62, w, h * 0.38], {
          fill: '#9370e9',
          sourcePart: 'remaining-lines',
          align: 'center',
          maxLines: 1,
        }),
      );
    } else
      layers.push(
        layer('subtitle', 'text', 'subtitle', boxes.subtitle, {
          fill: '#9370e9',
          textFlow: 'single-line',
          maxLines: 1,
        }),
      );
  }
  if (boxes.cta)
    layers.push(
      layer('cta', 'button', 'cta', boxes.cta, {
        fill: '#f6c84e',
        textFill: '#080607',
        textPaddingX: boxes.cta[2] * 0.17,
        textPaddingY: boxes.cta[3] * 0.25,
        align: 'center',
        radius: 30,
        maxLines: 1,
      }),
    );
  layers.push(
    layer('legal', 'text', 'legal', boxes.legal, {
      fill: '#e2dfeb',
      fontWeight: 'normal',
      align: 'center',
      textFlow: width >= 300 ? 'single-line' : 'manual',
      maxLines: height === 240 ? 3 : width >= 300 ? 1 : 2,
    }),
  );
  return validateBlueprint({
    schemaVersion: 1,
    id,
    marketId: 'JOKER5',
    name: `${width}x${height} · ${label}`,
    width,
    height,
    mode: 'static',
    repeat: 0,
    background: '#170e29',
    resourcePreset: id,
    layers,
    scenes: [{ id: 'artwork', name: label, durationMs: 3000, transitionMs: 0, tracks: {} }],
  });
}
