import { writeFile, mkdir, rm } from 'node:fs/promises';
import { z } from 'zod';
import { blueprintSchema } from '../src/core/schema.js';
import { createBlueprint, PRESETS } from '../src/data/defaults.js';
import { JOKER5_REFERENCES, JOKER5_SIZES, createJoker5SizeBlueprint } from '../src/data/joker5.js';
await mkdir('blueprints', { recursive: true });
await writeFile(
  'blueprints/blueprint.schema.json',
  JSON.stringify(z.toJSONSchema(blueprintSchema), null, 2) + '\n',
);
for (const market of ['FI', 'UK']) {
  await mkdir(`blueprints/${market.toLowerCase()}`, { recursive: true });
  for (const [w, h] of PRESETS.slice(0, 8)) {
    const bp = createBlueprint(market, w, h);
    bp.scenes = bp.scenes.map((scene, index) => ({ ...scene, id: `part-${index + 1}` }));
    await writeFile(
      `blueprints/${market.toLowerCase()}/${w}x${h}.v1.json`,
      JSON.stringify(bp, null, 2) + '\n',
    );
  }
}
await mkdir('blueprints/joker5', { recursive: true });
for (const reference of JOKER5_REFERENCES) {
  await rm(
    `blueprints/joker5/${reference.width}x${reference.height}-${reference.variant}.v1.json`,
    { force: true },
  );
}
for (const reference of JOKER5_SIZES) {
  await writeFile(
    `blueprints/joker5/${reference.width}x${reference.height}.v1.json`,
    JSON.stringify(createJoker5SizeBlueprint(reference), null, 2) + '\n',
  );
}
console.log(
  `Documented JSON Schema and ${16 + JOKER5_SIZES.length} current seed snapshots. Runtime validation also enforces timing and identity invariants.`,
);
