import { layerSchema, validateBlueprint } from '../schema.js';

/** Authored draft recipes. Opt-in per generation; never migrate existing masters. */
export function authorVariant(
  { id, marketId, width: w, height: h },
  variant,
  policy,
  campaign,
  split = 0.46,
) {
  const m = Math.max(policy.safeInset, Math.round(Math.min(w, h) * 0.035));
  const gap = Math.max(3, Math.round(Math.min(w, h) * 0.025));
  const inner = w - 2 * m,
    short = h <= 120;
  const footer = campaign.legal ? Math.max(policy.minimumLegal * 2 + 2, h * 0.065) : 0;
  const footY = h - m - footer;
  const bottom = footY - (footer ? gap : 0);
  const logoHeight = Math.min(short ? 24 : 60, h * 0.1);
  const logoWidth = Math.min(inner * 0.38, logoHeight * 3);
  const top = m + logoHeight + gap;
  const avail = bottom - top;
  let hero, copy;
  if (
    variant === 'hero-stacked' ||
    variant === 'hero-long-copy' ||
    (variant === 'hero-compact' && h > w)
  ) {
    const textFraction =
      variant === 'hero-long-copy' ? 0.58 : variant === 'hero-compact' ? 0.65 : 0.45;
    const textHeight = avail * textFraction - gap;
    copy = [m, top, inner, textHeight];
    hero = [m, top + textHeight + gap, inner, avail - textHeight - gap];
  } else if (variant === 'text-led') {
    copy = [m, top, inner, avail];
    hero = null;
  } else if (variant === 'strip-short-copy') {
    const left = m + logoWidth + gap;
    const heroWidth = Math.min(inner * 0.18, h * 0.9);
    hero = [w - m - heroWidth, m, heroWidth, bottom - m];
    copy = [left, m, hero[0] - gap - left, bottom - m];
  } else {
    const heroWidth = inner * (variant === 'hero-compact' ? 0.25 : split);
    const left = variant === 'hero-left';
    hero = [left ? m : w - m - heroWidth, top, heroWidth, avail];
    copy = [left ? m + heroWidth + gap : m, top, inner - heroWidth - gap, avail];
  }
  const layers = [];
  const add = (role, type, rect, options = {}) => {
    if (rect.some((v) => !Number.isFinite(v)) || rect[2] <= 0 || rect[3] <= 0)
      throw new Error('This size has no room for the selected variant.');
    layers.push(
      layerSchema.parse({
        id: role,
        name: role === 'hero' ? 'Campaign image' : role[0].toUpperCase() + role.slice(1),
        source: role,
        type,
        x: rect[0],
        y: rect[1],
        width: rect[2],
        height: rect[3],
        fitPolicy: 'strict-v1',
        textFlow: 'manual',
        fontSize: Math.max(policy.minimumFont, Math.min(120, h * 0.105)),
        minFontSize: policy.minimumFont,
        maxLines: short ? 2 : 5,
        lineHeight: 1.08,
        align: 'left',
        verticalAlign: 'middle',
        fade: 0,
        ...options,
      }),
    );
  };
  if (hero) add('hero', 'image', hero);
  add('logo', 'logo', [m, m, logoWidth, logoHeight]);
  const [x, y, cw, ch] = copy;
  const hasSubtitle = Boolean(campaign.subtitle),
    hasCta = Boolean(campaign.cta);
  const ctaHeight = hasCta
    ? Math.min(short ? 24 : 64, Math.max(policy.minimumFont + 6, ch * 0.19))
    : 0;
  const textH = ch - (hasCta ? ctaHeight + gap : 0);
  const headH = hasSubtitle ? (textH - gap) * 0.61 : textH;
  add('headline', 'text', [x, y, cw, headH]);
  if (hasSubtitle)
    add('subtitle', 'text', [x, y + headH + gap, cw, textH - headH - gap], {
      fontSize: Math.max(policy.minimumFont, Math.min(64, h * 0.065)),
      fontWeight: 'normal',
    });
  if (hasCta)
    add('cta', 'button', [x, y + ch - ctaHeight, cw, ctaHeight], {
      fill: campaign.ctaColor || '#c91c37',
      textFill: '#ffffff',
      align: 'center',
      radius: 4,
      fontSize: Math.max(policy.minimumFont, Math.min(38, ctaHeight * 0.65)),
      maxLines: 1,
      textPaddingX: 6,
      textPaddingY: 2,
    });
  if (footer)
    add('legal', 'text', [m, footY, inner, footer], {
      fontSize: Math.max(policy.minimumLegal, Math.min(24, footer / 2)),
      minFontSize: policy.minimumLegal,
      maxLines: 3,
      fontWeight: 'normal',
    });
  return validateBlueprint({
    schemaVersion: 1,
    id,
    marketId,
    name: `${w} × ${h} · ${variant}`,
    width: w,
    height: h,
    mode: 'static',
    background: '#141820',
    layers,
    scenes: [{ id: 'main', name: 'Campaign', durationMs: 2000, tracks: {} }],
  });
}
