import { correctFiReference } from '../core/fi-reference.js';
import { validateBlueprint } from '../core/schema.js';
import { suggestTextLayout } from '../core/text-layout.js';
import { layoutKey } from '../core/auto-layout.js';
import { correctBlueprintLayout } from '../core/blueprint-corrections.js';
import { reserveLegalFooter } from '../core/legal-footer.js';
import referenceMap from './reference-map.json' with { type: 'json' };
import {
  JOKER5_MARKET,
  JOKER5_REFERENCES,
  JOKER5_SIZES,
  createJoker5Blueprint,
  createJoker5SizeBlueprint,
} from './joker5.js';

export const PRESETS = [
  [300, 250],
  [300, 600],
  [160, 600],
  [320, 480],
  [728, 90],
  [320, 50],
  [300, 100],
  [300, 50],
  [970, 250],
  [150, 90],
  ...JOKER5_REFERENCES.filter(
    (r) =>
      r.variant === 'chest' &&
      !['728x90', '320x50', '300x50', '300x100', '300x250'].includes(`${r.width}x${r.height}`),
  ).map((r) => [r.width, r.height]),
];
export const sizeId = (w, h) => `${w}x${h}`;
export const uid = () => crypto.randomUUID();
export const DEFAULT_MARKETS = [
  {
    id: 'FI',
    name: 'Finland',
    locale: 'fi-FI',
    legal: '18+ | Pelaathan vastuullisesti | Käyttöehdot pätevät | MGA/B2C/126/2006',
    legalStatus: 'reference transcription',
    flag: 'FI',
  },
  {
    id: 'UK',
    name: 'United Kingdom',
    locale: 'en-GB',
    legal: '',
    legalStatus: 'missing',
    flag: 'UK',
  },
  JOKER5_MARKET,
];
export function campaignFor(market) {
  return {
    name: market.id === 'FI' ? 'Premier League · Autumn 2026' : `${market.name} · New campaign`,
    headline: market.id === 'FI' ? 'VALIOLIIGAA\nPELATAAN NETBETILLÄ' : 'MATCH DAY.\nYOUR WAY.',
    subtitle: market.id === 'FI' ? 'KOROTETUT\nKERTOIMET' : 'GET CLOSER\nTO THE GAME',
    cta: market.id === 'FI' ? 'Rekisteröidy' : 'Discover more',
    legal: market.legal,
    accentWord: '',
    accentColor: '#ff2638',
    heroAssetId: null,
    logoAssetId: null,
    fontAssetId: null,
    autoArrange: true,
    imageFadeEnabled: true,
    ...(market.id === JOKER5_MARKET.id
      ? {
          name: 'Joker5 · Welcome offer',
          headline: '100% AINA\n200€ ASTI',
          subtitle: '+100\nILMAISKIERROSTA',
          cta: 'Rekisteröidy',
          referencePack: 'joker5',
          typography: 'outfit',
          keepBlueprintBoxes: true,
        }
      : {}),
  };
}

/** Common proportions seed editable JSON. They never mutate existing revisions. */
export function createBlueprint(marketId, width, height) {
  const reference = JOKER5_REFERENCES.find(
    (r) => r.width === width && r.height === height && r.variant === 'chest',
  );
  if (marketId === JOKER5_MARKET.id && reference) return createJoker5SizeBlueprint(reference);
  if (marketId === JOKER5_MARKET.id) {
    const closest = JOKER5_REFERENCES.filter((r) => r.variant === 'chest').sort(
      (a, b) =>
        Math.abs(Math.log(a.width / a.height / (width / height))) -
        Math.abs(Math.log(b.width / b.height / (width / height))),
    )[0];
    return duplicateForSize(createJoker5Blueprint(closest), marketId, width, height);
  }
  const id = sizeId(width, height),
    strip = width / height > 2.4,
    narrow = width < 220;
  const fi = marketId === 'FI';
  const layer = (id, type, x, y, w, h, props = {}) => ({
    id,
    name:
      {
        hero: 'Campaign image',
        logo: 'NetBet logo',
        headline: 'Headline',
        subtitle: 'Offer / subtitle',
        cta: 'Call to action',
        legal: 'Market legal',
      }[id] || id,
    type,
    source: id,
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(w),
    height: Math.round(h),
    ...props,
  });
  let layers;
  if (strip) {
    const legalHeight = height >= 80 ? 15 : 17;
    layers = [
      layer('hero', 'image', width * 0.64, 0, width * 0.36, height, {
        fadeDirection: 'left',
        fade: 0.6,
      }),
      layer('logo', 'logo', 8, 6, width * 0.17, height - 12, { stacked: true }),
      layer('headline', 'text', width * 0.23, 4, width * 0.53, height * 0.45, {
        fontSize: height * 0.25,
        minFontSize: 9,
        maxLines: 2,
      }),
      layer('subtitle', 'text', width * 0.23, height * 0.43, width * 0.51, height * 0.32, {
        fontSize: height * 0.22,
        minFontSize: 9,
        maxLines: 2,
      }),
      layer('cta', 'button', width * 0.28, height * 0.2, width * 0.36, height * 0.47, {
        fontSize: height * 0.23,
        minFontSize: 10,
        radius: 30,
        fill: '#ef1929',
      }),
      layer('legal', 'text', width * 0.22, height - legalHeight - 2, width * 0.76, legalHeight, {
        fontSize: 9,
        minFontSize: 7,
        maxLines: 2,
        fontWeight: 'normal',
        fill: '#bfc3cc',
        visible: id !== '300x50',
      }),
    ];
  } else if (height / width > 1.35) {
    layers = [
      layer('hero', 'image', 0, height * 0.55, width, height * 0.38, { fade: 0.33 }),
      layer(
        'logo',
        'logo',
        width * 0.15,
        height * 0.045,
        width * 0.7,
        height * (narrow ? 0.16 : 0.085),
        { stacked: narrow },
      ),
      layer(
        'headline',
        'text',
        width * 0.06,
        height * (narrow ? 0.235 : 0.175),
        width * 0.88,
        height * 0.145,
        { fontSize: width * 0.102, minFontSize: 14, maxLines: 3 },
      ),
      layer('subtitle', 'text', width * 0.06, height * 0.35, width * 0.88, height * 0.135, {
        fontSize: width * 0.112,
        minFontSize: 15,
        maxLines: 2,
      }),
      layer('cta', 'button', width * 0.12, height * 0.515, width * 0.76, height * 0.07, {
        fontSize: width * 0.065,
        minFontSize: 12,
        radius: 30,
        fill: '#ef1929',
      }),
      layer('legal', 'text', 8, height * 0.94, width - 16, height * 0.05, {
        fontSize: 10,
        minFontSize: 8,
        maxLines: 3,
        fontWeight: 'normal',
        fill: '#bfc3cc',
      }),
    ];
  } else {
    layers = [
      layer('hero', 'image', 0, fi ? height * 0.39 : 0, width, height * 0.55, {
        fadeDirection: fi ? 'top' : 'bottom',
        fade: 0.45,
      }),
      layer('logo', 'logo', width * 0.24, 10, width * 0.52, height * 0.13),
      layer(
        'headline',
        'text',
        width * 0.07,
        fi ? height * 0.2 : height * 0.48,
        width * 0.86,
        height * 0.19,
        { fontSize: width * 0.07, minFontSize: 12, maxLines: 2 },
      ),
      layer(
        'subtitle',
        'text',
        width * 0.09,
        fi ? height * 0.39 : height * 0.66,
        width * 0.82,
        height * 0.1,
        { fontSize: width * 0.062, minFontSize: 10, maxLines: 2 },
      ),
      layer(
        'cta',
        'button',
        width * 0.27,
        fi ? height * 0.52 : height * 0.77,
        width * 0.46,
        height * 0.13,
        { fontSize: width * 0.049, minFontSize: 10, radius: 30, fill: '#ef1929' },
      ),
      layer('legal', 'text', 8, height * 0.895, width - 16, height * 0.095, {
        fontSize: 8,
        minFontSize: 7,
        maxLines: 3,
        fontWeight: 'normal',
        fill: '#bfc3cc',
      }),
    ];
  }
  if (!fi && height / width > 1.35) {
    layers = layers.map((l) =>
      ['headline', 'subtitle'].includes(l.id)
        ? { ...l, align: 'left', x: width * 0.1, width: width * 0.8 }
        : l,
    );
  }
  const track = (visible) => ({ visible, startMs: 0, fadeInMs: 0, fadeOutMs: 0, dx: 0, dy: 0 });
  const scene = (name, durationMs, visible) => ({
    id: uid(),
    name,
    durationMs,
    transitionMs: 0,
    tracks: Object.fromEntries(layers.map((l) => [l.id, track(visible.includes(l.id))])),
  });
  let scenes;
  if (id === '320x50') {
    layers = layers.map((l) =>
      l.id === 'cta'
        ? { ...l, x: width * 0.22, width: width * 0.31, y: height * 0.27, height: height * 0.46 }
        : l.id === 'legal'
          ? { ...l, x: width * 0.55, y: 4, width: width * 0.43, height: height - 8 }
          : l.id === 'subtitle'
            ? { ...l, y: 8, height: height - 16 }
            : l,
    );
    scenes = [
      scene('Introduction', 2000, ['hero', 'logo', 'headline']),
      scene('The offer', 2000, ['hero', 'logo', 'subtitle']),
      scene('Action + legal', 1800, ['logo', 'cta', 'legal']),
    ];
  } else if (id === '300x100') {
    layers = layers.map((l) =>
      l.id === 'cta'
        ? { ...l, x: width * 0.44, y: height * 0.49, width: width * 0.41, height: height * 0.24 }
        : l.id === 'headline' || l.id === 'subtitle'
          ? {
              ...l,
              x: width * 0.33,
              y: 7,
              width: width * 0.64,
              height: height * 0.36,
              fontSize: 16,
            }
          : l.id === 'hero'
            ? {
                ...l,
                x: 0,
                y: height * 0.3,
                width: width * 0.43,
                height: height * 0.7,
                fadeDirection: 'right',
              }
            : l,
    );
    scenes = [
      scene('Introduction', 2000, ['hero', 'logo', 'headline', 'cta', 'legal']),
      scene('The offer', 1800, ['hero', 'logo', 'subtitle', 'cta', 'legal']),
    ];
  } else if (id === '728x90')
    scenes = [
      scene('Introduction + offer', 3000, ['hero', 'logo', 'headline', 'subtitle', 'legal']),
      scene('Call to action', 1800, ['hero', 'logo', 'cta', 'legal']),
    ];
  else
    scenes = [
      scene(
        'Artwork',
        3000,
        layers.filter((l) => id !== '300x50' || l.id !== 'cta').map((l) => l.id),
      ),
    ];
  layers = layers.map((l) => ({ ...l, fontSize: Math.max(l.fontSize ?? 24, l.minFontSize ?? 10) }));
  const blueprint = validateBlueprint({
    schemaVersion: 1,
    id: `${marketId}-${id}`,
    marketId,
    name: id,
    width,
    height,
    mode: scenes.length > 1 ? 'animated' : 'static',
    repeat: 0,
    background: '#070d1d',
    layers,
    scenes,
  });
  // Fresh wide templates use the space available in each part, without forcing
  // portrait campaign line breaks onto a leaderboard. Saved revisions are untouched.
  if (id === '320x50' || id === '728x90' || id === '300x100') {
    for (const textId of ['headline', 'subtitle']) {
      const result = suggestTextLayout(blueprint, textId);
      if (result.patch)
        blueprint.layers = blueprint.layers.map((l) =>
          l.id === textId ? { ...l, ...result.patch } : l,
        );
    }
  }
  return validateBlueprint(correctFiReference(correctBlueprintLayout(blueprint)));
}
export function newEntry(bp) {
  const references =
    bp.marketId === JOKER5_MARKET.id
      ? JOKER5_REFERENCES.filter((r) => r.width === bp.width && r.height === bp.height)
      : [];
  const supplied = references.find((r) => r.id === bp.resourcePreset) || references[0];
  const revision = {
    id: uid(),
    number: 1,
    status: 'draft',
    createdAt: new Date().toISOString(),
    blueprint: bp,
  };
  return {
    id: bp.id,
    marketId: bp.marketId,
    reference: supplied?.file ?? referenceMap[bp.marketId]?.[sizeId(bp.width, bp.height)] ?? null,
    ...(supplied ? { references: references.map((r) => r.file) } : {}),
    activeVersionId: revision.id,
    versions: [revision],
    draft: null,
  };
}
export const activeRevision = (entry) => entry.versions.find((v) => v.id === entry.activeVersionId);
export function duplicateForSize(source, marketId, width, height) {
  const x = width / source.width,
    y = height / source.height,
    f = Math.min(x, y),
    bp = structuredClone(source);
  bp.id = `${marketId}-${sizeId(width, height)}`;
  bp.name = sizeId(width, height);
  bp.marketId = marketId;
  bp.width = width;
  bp.height = height;
  bp.layers = bp.layers.map((l) => ({
    ...l,
    x: l.x * x,
    y: l.y * y,
    width: Math.max(1, l.width * x),
    height: Math.max(1, l.height * y),
    fontSize: Math.max(1, Math.min(500, l.fontSize * f)),
    minFontSize: Math.max(1, Math.min(500, l.minFontSize * f)),
    radius: Math.min(500, l.radius * f),
    textPaddingX: Math.min(500, (l.textPaddingX ?? 6) * x),
    textPaddingY: Math.min(500, (l.textPaddingY ?? 2) * y),
    ...(l.glow ? { glow: { ...l.glow, blur: Math.min(40, l.glow.blur * f) } } : {}),
    ...(l.shadow
      ? {
          shadow: {
            ...l.shadow,
            blur: Math.min(40, l.shadow.blur * f),
            offsetX: Math.max(-100, Math.min(100, l.shadow.offsetX * x)),
            offsetY: Math.max(-100, Math.min(100, l.shadow.offsetY * y)),
          },
        }
      : {}),
  }));
  bp.scenes = bp.scenes.map((s) => ({
    ...s,
    id: uid(),
    tracks: Object.fromEntries(
      Object.entries(s.tracks).map(([id, t]) => [
        id,
        { ...t, dx: (t.dx || 0) * x, dy: (t.dy || 0) * y },
      ]),
    ),
  }));
  return validateBlueprint(bp);
}
export function resolveBanner(entry, banner) {
  return reserveLegalFooter(
    banner?.arrangement ||
      banner?.override ||
      (entry.versions.find((v) => v.id === banner?.blueprintVersionId) || activeRevision(entry))
        .blueprint,
  );
}
export function initialProject() {
  const blueprints = DEFAULT_MARKETS.flatMap((m) =>
      m.id === JOKER5_MARKET.id
        ? JOKER5_SIZES.map((r) => newEntry(createJoker5SizeBlueprint(r)))
        : PRESETS.slice(0, 8).map(([w, h]) => newEntry(createBlueprint(m.id, w, h))),
    ),
    campaigns = Object.fromEntries(DEFAULT_MARKETS.map((m) => [m.id, campaignFor(m)]));
  return {
    schemaVersion: 1,
    markets: DEFAULT_MARKETS,
    campaigns,
    blueprints,
    assets: [],
    banners: Object.fromEntries(
      blueprints.map((b) => [
        b.id,
        {
          blueprintVersionId: b.activeVersionId,
          override: null,
          history: [],
          layoutKey: layoutKey(campaigns[b.marketId]),
        },
      ]),
    ),
  };
}

/** Keep one active Joker5 entry per dimension; retain removed entries verbatim in backups. */
export function consolidateJoker5Sizes(project) {
  const groups = new Map();
  for (const entry of project.blueprints.filter((e) => e.marketId === JOKER5_MARKET.id)) {
    const bp = activeRevision(entry).blueprint;
    const key = sizeId(bp.width, bp.height);
    groups.set(key, [...(groups.get(key) || []), entry]);
  }
  const replacements = new Map(),
    removed = new Set();
  const archived = [...(project.consolidatedReferences || [])];
  for (const entries of groups.values()) {
    const edited = (entry) => {
      const banner = project.banners[entry.id];
      return !!(
        banner.override ||
        banner.history.length ||
        entry.draft ||
        entry.versions.some((v) => v.origin === 'blueprint-editor' || v.status === 'published')
      );
    };
    const winner = [...entries].sort(
      (a, b) =>
        Number(edited(b)) - Number(edited(a)) ||
        Number(b.id.endsWith('-chest')) - Number(a.id.endsWith('-chest')),
    )[0];
    const bp = activeRevision(winner).blueprint;
    const references = [
      ...new Set([
        ...JOKER5_REFERENCES.filter((r) => r.width === bp.width && r.height === bp.height).map(
          (r) => r.file,
        ),
        ...entries.flatMap((e) => [e.reference, ...(e.references || [])]).filter(Boolean),
      ]),
    ];
    if (
      'variantLabel' in winner ||
      JSON.stringify(winner.references) !== JSON.stringify(references)
    ) {
      const { variantLabel, ...entry } = winner;
      replacements.set(winner.id, { ...entry, references });
    }
    for (const entry of entries)
      if (entry !== winner) {
        removed.add(entry.id);
        archived.push({ entry, banner: project.banners[entry.id], retainedEntryId: winner.id });
      }
  }
  if (!removed.size && !replacements.size) return project;
  return {
    ...project,
    blueprints: project.blueprints
      .filter((e) => !removed.has(e.id))
      .map((e) => replacements.get(e.id) || e),
    banners: Object.fromEntries(Object.entries(project.banners).filter(([id]) => !removed.has(id))),
    ...(archived.length ? { consolidatedReferences: archived } : {}),
  };
}

/** Add missing sizes, without recreating alternate-reference banners. */
export function addReferenceMarkets(project) {
  project = consolidateJoker5Sizes(project);
  const missing = JOKER5_SIZES.filter(
    (r) =>
      !project.blueprints.some((e) => {
        const bp = activeRevision(e).blueprint;
        return e.marketId === JOKER5_MARKET.id && bp.width === r.width && bp.height === r.height;
      }),
  );
  const hasMarket = project.markets.some((m) => m.id === JOKER5_MARKET.id);
  if (hasMarket && !missing.length) return project;
  const campaign = project.campaigns[JOKER5_MARKET.id] || campaignFor(JOKER5_MARKET);
  const entries = missing.map((r) => newEntry(createJoker5SizeBlueprint(r)));
  return {
    ...project,
    markets: hasMarket ? project.markets : [...project.markets, JOKER5_MARKET],
    campaigns: { ...project.campaigns, [JOKER5_MARKET.id]: campaign },
    blueprints: [...project.blueprints, ...entries],
    banners: {
      ...project.banners,
      ...Object.fromEntries(
        entries.map((entry) => [
          entry.id,
          {
            blueprintVersionId: entry.activeVersionId,
            override: null,
            history: [],
            layoutKey: layoutKey(campaign),
          },
        ]),
      ),
    },
  };
}
