import { activeRevision, resolveBanner } from '../data/defaults.js';
import { JOKER5_REFERENCES, createJoker5Blueprint } from '../data/joker5.js';
import { saveBlueprintStandard } from './blueprint-edit.js';
import { validateBlueprint } from './schema.js';

const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** Adopt the refreshed sources once; saved masters and retired sizes remain recoverable. */
export function migrateJoker5References(project) {
  for (const entry of project.blueprints.filter((e) => e.marketId === 'JOKER5')) {
    const active = activeRevision(entry),
      previous = active.blueprint;
    const reference = JOKER5_REFERENCES.find((r) => r.id === previous.resourcePreset);
    if (!reference) continue;
    const references = JOKER5_REFERENCES.filter(
      (r) => r.width === previous.width && r.height === previous.height,
    ).map((r) => r.file);
    if (entry.reference !== reference.file || !equal(entry.references, references)) {
      project = {
        ...project,
        blueprints: project.blueprints.map((e) =>
          e.id === entry.id ? { ...e, reference: reference.file, references } : e,
        ),
      };
    }
    // Only the old supplied single-artwork seed is eligible. Authored timelines stay authored.
    if (
      active.status !== 'draft' ||
      active.origin === 'blueprint-editor' ||
      previous.scenes.length !== 1 ||
      previous.scenes[0].id !== 'artwork' ||
      entry.versions.some((v) => v.origin === 'joker5-gif-references')
    )
      continue;
    const current = resolveBanner(entry, project.banners[entry.id]);
    const next = { ...createJoker5Blueprint(reference), id: previous.id, name: previous.name };
    // Keep fade/shadow choices made in the standard; the new evidence updates geometry/timing.
    for (const layer of next.layers) {
      const old = previous.layers.find((l) => l.id === layer.id);
      if (!old) continue;
      for (const key of ['fade', 'fadeDirection', 'fadeMesh', 'shadow', 'glow']) {
        if (old[key] !== undefined) layer[key] = structuredClone(old[key]);
      }
    }
    project = saveBlueprintStandard(project, entry.id, next, 'joker5-gif-references');
    const updatedEntry = project.blueprints.find((e) => e.id === entry.id);
    const banner = project.banners[entry.id];
    const updated = structuredClone(resolveBanner(updatedEntry, banner));
    // Retain local exceptions, including hand-edited crops, copy, effects and geometry.
    for (const layer of updated.layers) {
      const old = previous.layers.find((l) => l.id === layer.id);
      const local = current.layers.find((l) => l.id === layer.id);
      if (!old || !local) continue;
      for (const key of new Set([...Object.keys(old), ...Object.keys(local)])) {
        if (equal(old[key], local[key])) continue;
        if (local[key] === undefined) delete layer[key];
        else layer[key] = structuredClone(local[key]);
      }
    }
    if (!equal(current.scenes, previous.scenes) || current.mode !== previous.mode) {
      updated.mode = current.mode;
      updated.repeat = current.repeat;
      updated.scenes = current.scenes.map((s) => ({
        ...s,
        tracks: {
          ...Object.fromEntries(
            updated.layers
              .filter((l) => !current.layers.some((old) => old.id === l.id))
              .map((l) => [l.id, { visible: false }]),
          ),
          ...s.tracks,
        },
      }));
    }
    if (!equal(updated, resolveBanner(updatedEntry, banner))) {
      const blueprint = validateBlueprint(updated);
      project = {
        ...project,
        banners: {
          ...project.banners,
          [entry.id]: {
            ...banner,
            override: blueprint,
            history: [...banner.history.slice(0, -1), { ...banner.history.at(-1), blueprint }],
          },
        },
      };
    }
  }
  return project;
}
