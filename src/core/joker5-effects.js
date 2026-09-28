import { activeRevision, resolveBanner } from '../data/defaults.js';
import { JOKER5_REFERENCES, LEGACY_JOKER5_REFERENCES, joker5ImageFade } from '../data/joker5.js';
import { saveBlueprintStandard } from './blueprint-edit.js';

/** Repair the supplied hard-edge draft once, keeping authored fades and history intact. */
export function migrateJoker5Effects(project) {
  for (const entry of project.blueprints.filter((e) => e.marketId === 'JOKER5')) {
    const active = activeRevision(entry),
      bp = active.blueprint;
    const reference = [...JOKER5_REFERENCES, ...LEGACY_JOKER5_REFERENCES].find(
      (r) => r.id === bp.resourcePreset,
    );
    const hero = bp.layers.find((l) => l.id === 'hero');
    const local = resolveBanner(entry, project.banners[entry.id]).layers.find(
      (l) => l.id === 'hero',
    );
    if (
      !reference ||
      active.status !== 'draft' ||
      active.origin === 'blueprint-editor' ||
      !hero ||
      hero.fade !== 0 ||
      hero.fadeMesh?.enabled ||
      local?.fade !== 0 ||
      local?.fadeMesh?.enabled
    )
      continue;
    project = saveBlueprintStandard(
      project,
      entry.id,
      {
        ...bp,
        layers: bp.layers.map((l) =>
          l.id === 'hero' ? { ...l, ...joker5ImageFade(reference) } : l,
        ),
      },
      'joker5-effects',
    );
  }
  return project;
}
