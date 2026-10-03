import { z } from 'zod';
import { validateBlueprint } from './schema.js';

const boxSchema = z
  .object({
    x: z.number().finite().min(0).max(1),
    y: z.number().finite().min(0).max(1),
    width: z.number().finite().positive().max(1),
    height: z.number().finite().positive().max(1),
  })
  .strict()
  .refine((box) => box.x + box.width <= 1.001 && box.y + box.height <= 1.001);

export const florenceReferenceSchema = z
  .object({
    schemaVersion: z.literal(1),
    engine: z.literal('florence2'),
    width: z.number().int().min(32).max(2048),
    height: z.number().int().min(32).max(2048),
    textRegions: z
      .array(
        z
          .object({
            text: z.string().min(1).max(200),
            box: boxSchema,
          })
          .strict(),
      )
      .max(128),
    objects: z
      .array(
        z
          .object({
            label: z.string().max(100),
            box: boxSchema,
          })
          .strict(),
      )
      .max(64),
    profileId: z.string().length(64),
    provenance: z
      .object({
        model: z.string(),
        revision: z.string().length(40),
        device: z.string(),
        coordinateSpace: z.literal('normalized-oriented-preview'),
        tasks: z.array(z.string()),
      })
      .strict(),
  })
  .strict();

/** Use only Florence's boxes. Unassigned text remains a reviewable structural box. */
export function blueprintFromFlorence(raw, { marketId, width, height }) {
  const result = florenceReferenceSchema.parse(raw);
  if (result.textRegions.length === 0)
    throw new Error('Florence found no text regions. No blueprint was created.');
  const layers = result.textRegions.slice(0, 50).map((region, index) => {
    const x = Math.max(0, Math.min(width - 4, Math.round(region.box.x * width))),
      y = Math.max(0, Math.min(height - 4, Math.round(region.box.y * height)));
    const w = Math.max(4, Math.min(width - x, Math.round(region.box.width * width))),
      h = Math.max(4, Math.min(height - y, Math.round(region.box.height * height)));
    return {
      id: `florence-text-${index + 1}`,
      name: `Florence text ${index + 1}: ${region.text.slice(0, 48)}`,
      type: 'text',
      source: 'custom',
      text: '',
      x,
      y,
      width: w,
      height: h,
      fontSize: Math.max(6, Math.min(500, h)),
      minFontSize: Math.max(5, Math.min(500, Math.round(h * 0.6))),
      maxLines: 1,
    };
  });
  return validateBlueprint({
    schemaVersion: 1,
    id: `${marketId}-${width}x${height}`,
    marketId,
    name: `${width}x${height}`,
    width,
    height,
    mode: 'static',
    repeat: 0,
    background: '#070d1d',
    layers,
    scenes: [
      {
        id: 'florence-reference',
        name: 'Florence draft',
        durationMs: 2000,
        transitionMs: 0,
        tracks: {},
      },
    ],
  });
}
