import { get, set } from 'idb-keyval';
import { validateBlueprint } from './schema.js';
import { layoutKey } from './auto-layout.js';
import { subjectSearchSchema, subjectFocusSchema } from './subject-data.js';
import { loadOutfit } from './outfit-font.js';
const KEY = 'bannerflow-project-v1';
export const loadProject = () => get(KEY);
export const saveProject = (project) => set(KEY, project);
export const getAsset = (id) => get(`asset:${id}`);
export const putAsset = (id, blob) => set(`asset:${id}`, blob);
export async function storeAsset(file, kind) {
  if (file.size > 30 * 1024 * 1024) throw new Error('Use a file smaller than 30 MB.');
  if (kind === 'font' && !/\.(woff2?|ttf|otf)$/i.test(file.name))
    throw new Error('Choose a WOFF, WOFF2, TTF or OTF font.');
  if (
    kind !== 'font' &&
    !['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'].includes(file.type)
  )
    throw new Error('Choose PNG, JPEG, WebP or SVG.');
  const bytes = await file.arrayBuffer(),
    hash = await crypto.subtle.digest('SHA-256', bytes);
  const id = Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('');
  // Decode before persistence so broken assets never become campaign bindings.
  let width, height;
  if (kind !== 'font') {
    const url = URL.createObjectURL(file);
    try {
      const im = await imageFrom(url);
      width = im.width;
      height = im.height;
      if (width * height > 40_000_000) throw new Error('Image exceeds the 40 megapixel limit.');
    } finally {
      URL.revokeObjectURL(url);
    }
  } else {
    const font = new FontFace(`Brand-${id.slice(0, 10)}`, bytes);
    await font.load();
  }
  await putAsset(id, file);
  return {
    id,
    name: file.name,
    kind,
    type: file.type,
    bytes: file.size,
    width,
    height,
    createdAt: new Date().toISOString(),
  };
}
export function imageFrom(url) {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error('Image could not be decoded.'));
    im.src = url;
  });
}
const images = new Map(),
  fonts = new Map();
async function assetImage(id) {
  if (!images.has(id))
    images.set(
      id,
      (async () => {
        const blob = await getAsset(id);
        if (!blob) throw new Error('An original asset is missing from local storage.');
        const url = URL.createObjectURL(blob);
        try {
          return await imageFrom(url);
        } finally {
          URL.revokeObjectURL(url);
        }
      })(),
    );
  return images.get(id);
}
export async function loadResources(campaign) {
  const hero = campaign.heroAssetId
    ? await assetImage(campaign.heroAssetId)
    : await (images.get('demo') ||
        (() => {
          const promise = imageFrom('/references/300X600.png');
          images.set('demo', promise);
          return promise;
        })());
  const logo = campaign.logoAssetId ? await assetImage(campaign.logoAssetId) : null;
  let fontFamily = null;
  if (campaign.typography === 'outfit') {
    fontFamily = await loadOutfit();
  } else if (campaign.fontAssetId) {
    fontFamily = `Brand-${campaign.fontAssetId.slice(0, 10)}`;
    if (!fonts.has(fontFamily)) {
      const blob = await getAsset(campaign.fontAssetId);
      if (!blob) throw new Error('Font asset is missing.');
      const font = new FontFace(fontFamily, await blob.arrayBuffer());
      await font.load();
      document.fonts.add(font);
      fonts.set(fontFamily, font);
    }
  }
  return {
    hero,
    heroCrop: campaign.heroAssetId ? null : [0, 340, 300, 210],
    logo,
    fontFamily,
    typography: campaign.typography || 'original',
  };
}
export function validateProject(value) {
  if (
    value?.schemaVersion !== 1 ||
    !Array.isArray(value.markets) ||
    !Array.isArray(value.blueprints) ||
    !Array.isArray(value.assets) ||
    !value.campaigns ||
    !value.banners
  )
    throw new Error('Unsupported project file.');
  if (value.lineSpacingVersion != null && value.lineSpacingVersion !== 1)
    throw new Error('Unsupported line spacing migration.');
  const unique = (values, label) => {
    if (new Set(values).size !== values.length) throw new Error(`Duplicate ${label} identities.`);
  };
  if (
    !value.markets.length ||
    value.markets.length > 100 ||
    value.blueprints.length > 2000 ||
    value.assets.length > 500
  )
    throw new Error('Project size is outside the supported limits.');
  unique(
    value.markets.map((m) => m.id),
    'market',
  );
  unique(
    value.blueprints.map((e) => e.id),
    'blueprint',
  );
  unique(
    value.assets.map((a) => a.id),
    'asset',
  );
  for (const market of value.markets)
    if (
      !/^[A-Z0-9-]{2,8}$/.test(market.id) ||
      typeof market.name !== 'string' ||
      typeof market.locale !== 'string'
    )
      throw new Error('Invalid market metadata.');
  for (const asset of value.assets)
    if (
      !/^[a-f0-9]{64}$/.test(asset.id) ||
      !['hero', 'logo', 'font'].includes(asset.kind) ||
      typeof asset.name !== 'string' ||
      typeof asset.type !== 'string'
    )
      throw new Error('Invalid asset metadata.');
  for (const entry of value.blueprints) {
    if (!entry.versions?.length || !entry.versions.some((v) => v.id === entry.activeVersionId))
      throw new Error('Blueprint revision history is incomplete.');
    if (!value.markets.some((m) => m.id === entry.marketId))
      throw new Error('Blueprint points to an unknown market.');
    unique(
      entry.versions.map((v) => v.id),
      'revision',
    );
    entry.versions.forEach((v) => {
      v.blueprint = validateBlueprint(v.blueprint);
      if (
        v.blueprint.id !== entry.id ||
        v.blueprint.marketId !== entry.marketId ||
        !['draft', 'published', 'archived'].includes(v.status) ||
        !Number.isInteger(v.number) ||
        v.number < 1
      )
        throw new Error('Invalid revision identity or status.');
    });
    if (entry.draft) entry.draft = validateBlueprint(entry.draft);
    const banner = value.banners[entry.id];
    if (
      !banner ||
      !entry.versions.some((v) => v.id === banner.blueprintVersionId) ||
      !Array.isArray(banner.history)
    )
      throw new Error('Generated banner revision is missing.');
    if (banner.override) {
      banner.override = validateBlueprint(banner.override);
      const original = entry.versions.find((v) => v.id === banner.blueprintVersionId).blueprint;
      if (
        banner.override.id !== entry.id ||
        banner.override.width !== original.width ||
        banner.override.height !== original.height
      )
        throw new Error('Override identity does not match its blueprint.');
    }
    if (banner.arrangement) {
      banner.arrangement = validateBlueprint(banner.arrangement);
      const original = entry.versions.find((v) => v.id === banner.blueprintVersionId).blueprint;
      if (
        banner.arrangement.id !== entry.id ||
        banner.arrangement.marketId !== entry.marketId ||
        banner.arrangement.width !== original.width ||
        banner.arrangement.height !== original.height
      )
        throw new Error('Arranged layout identity does not match its blueprint.');
    }
    if (banner.layoutKey != null && typeof banner.layoutKey !== 'string')
      throw new Error('Invalid arranged layout content key.');
    if (
      banner.syncedBlueprintVersionId != null &&
      !entry.versions.some((v) => v.id === banner.syncedBlueprintVersionId)
    )
      throw new Error('Synchronized blueprint revision is missing.');
    for (const revision of banner.history) {
      revision.blueprint = validateBlueprint(revision.blueprint);
      if (revision.blueprint.id !== entry.id)
        throw new Error('Override history contains an unrelated blueprint.');
    }
  }
  for (const market of value.markets) {
    const c = value.campaigns[market.id];
    if (
      !c ||
      !['name', 'headline', 'subtitle', 'cta', 'legal', 'accentWord', 'accentColor'].every(
        (k) => typeof c[k] === 'string',
      ) ||
      !/^#[0-9a-f]{6}$/i.test(c.accentColor)
    )
      throw new Error('Campaign fields are incomplete.');
    for (const kind of ['hero', 'logo', 'font'])
      if (c[`${kind}AssetId`] && !value.assets.some((a) => a.id === c[`${kind}AssetId`]))
        throw new Error(`Missing ${kind} asset binding.`);
    if (c.autoArrange != null && typeof c.autoArrange !== 'boolean')
      throw new Error('Invalid automatic layout setting.');
    if (c.typography != null && !['original', 'outfit'].includes(c.typography))
      throw new Error('Invalid campaign typography.');
    c.autoArrange ??= true;
    if (c.keepBlueprintBoxes != null && typeof c.keepBlueprintBoxes !== 'boolean')
      throw new Error('Invalid blueprint box setting.');
    if (c.autoSubject != null && typeof c.autoSubject !== 'boolean')
      throw new Error('Invalid automatic subject setting.');
    if (c.subjectEngine != null && !['auto', 'browser', 'sam3'].includes(c.subjectEngine))
      throw new Error('Invalid subject finder engine.');
    if (
      c.subjectQuery != null &&
      (typeof c.subjectQuery !== 'string' || c.subjectQuery.length > 160)
    )
      throw new Error('Invalid subject search.');
    if (c.subjectSearch) c.subjectSearch = subjectSearchSchema.parse(c.subjectSearch);
    if (c.subjectFocus) c.subjectFocus = subjectFocusSchema.parse(c.subjectFocus);
    if ([c.subjectSearch, c.subjectFocus].some((item) => item && item.assetId !== c.heroAssetId))
      throw new Error('Subject focus does not match the campaign image.');
  }
  // Older workspaces retain their saved appearance until the next content edit or manual arrange.
  for (const entry of value.blueprints)
    if (!('layoutKey' in value.banners[entry.id]))
      value.banners[entry.id].layoutKey = layoutKey(value.campaigns[entry.marketId]);
  return value;
}
