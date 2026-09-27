import { writeFile, mkdir } from 'node:fs/promises';
import { z } from 'zod';
import { blueprintSchema } from '../src/core/schema.js';
import { createBlueprint, PRESETS } from '../src/data/defaults.js';
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
console.log(
  'Documented JSON Schema and 16 seed snapshots. Runtime validation also enforces timing and identity invariants.',
);
