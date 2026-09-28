/** Bundled reference crops are demo resources; uploaded originals always take precedence. */
export function resourcesForBlueprint(bp, resources) {
  const preset = resources?.presets?.[bp.resourcePreset];
  if (!preset) return resources;
  return {
    ...resources,
    hero: resources.uploadedHero ? resources.hero : preset.hero,
    heroCrop: resources.uploadedHero ? resources.heroCrop : preset.heroCrop,
    logo: resources.uploadedLogo ? resources.logo : preset.logo,
  };
}
