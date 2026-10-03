import { z } from 'zod';
export const hashSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const normalizedRect = z
  .object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    width: z.number().positive().max(1),
    height: z.number().positive().max(1),
  })
  .strict()
  .refine((r) => r.x + r.width <= 1.000001 && r.y + r.height <= 1.000001);
export const VARIANTS = [
  'hero-right',
  'hero-left',
  'hero-stacked',
  'hero-compact',
  'hero-long-copy',
  'strip-short-copy',
  'text-led',
];
export const layoutPolicySchema = z
  .object({
    version: z.literal(1),
    mode: z.literal('strict'),
    variants: z.array(z.enum(VARIANTS)).min(1).max(8),
    minimumFont: z.number().min(6).max(100).default(14),
    minimumLegal: z.number().min(6).max(100).default(9),
    minimumSubject: z.number().min(0).max(1).default(0.9),
    requiredRoles: z
      .array(z.enum(['hero', 'logo', 'headline', 'subtitle', 'cta', 'legal']))
      .max(6)
      .default(['hero', 'headline', 'cta']),
    requireFont: z.boolean().default(false),
    allowContain: z.boolean().default(true),
    preserveBoxes: z.boolean().default(false),
    safeInset: z.number().min(0).max(100).default(4),
    maxCandidates: z.number().int().min(1).max(128).default(24),
    contrastMinimum: z.number().min(1).max(21).default(3),
  })
  .strict();
export const strictPolicy = (patch) =>
  layoutPolicySchema.parse({
    version: 1,
    mode: 'strict',
    variants: VARIANTS.filter((v) => v !== 'text-led'),
    ...patch,
  });
export const analysisSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: z.string().min(1).max(200),
    assetId: hashSchema,
    inputHash: hashSchema,
    component: z.enum(['subjects', 'ocr', 'visual', 'embedding', 'composition', 'florence']),
    status: z.enum(['unknown', 'ready', 'no_match', 'failed', 'unavailable']),
    profileId: z.string().min(1).max(200),
    createdAt: z.string().datetime(),
    provenance: z.record(z.string(), z.json()),
    subjects: z
      .array(
        z
          .object({
            id: z.string(),
            label: z.string().max(160),
            box: normalizedRect,
            score: z.number().min(0).max(1).optional(),
          })
          .strict(),
      )
      .max(100)
      .optional(),
    ocr: z
      .array(
        z
          .object({
            text: z.string().max(2000),
            box: normalizedRect,
            confidence: z.number().min(0).max(1),
          })
          .strict(),
      )
      .max(500)
      .optional(),
    visual: z
      .object({
        palette: z.array(z.string().regex(/^#[a-f0-9]{6}$/i)).max(32),
        luminance: z.number().finite(),
        edgeVariance: z.number().finite(),
      })
      .strict()
      .optional(),
    message: z.string().max(2000).optional(),
  })
  .strict();
export const correctionSchema = z
  .object({
    tags: z.array(z.string().trim().min(1).max(80)).max(50).default([]),
    rejectedTags: z.array(z.string().max(80)).max(50).default([]),
    focal: normalizedRect.nullable().default(null),
    ocrText: z.string().max(20000).default(''),
    protectedRegions: z.array(normalizedRect).max(20).default([]),
  })
  .strict();
export const embeddingSchema = z
  .object({
    profileId: hashSchema,
    inputHash: hashSchema,
    assetId: hashSchema,
    vector: z.array(z.number().finite()).min(1).max(8192),
    dimension: z.number().int().min(1).max(8192),
  })
  .strict()
  .refine(
    (e) => e.vector.length === e.dimension && Math.abs(Math.hypot(...e.vector) - 1) < 0.001,
    'Expected a normalized vector of the declared dimension.',
  );
export const planSchema = z
  .object({
    schemaVersion: z.literal(1),
    planId: z.string().min(1).max(100),
    briefRevisionId: hashSchema,
    inputAssetIds: z.array(hashSchema).min(1).max(8),
    copyRevisionId: hashSchema,
    copyPolicy: z.literal('preserve-exact'),
    familyId: z.literal('campaign-hero'),
    variantPriority: z.array(z.enum(VARIANTS)).min(1).max(8),
    roleBindings: z.object({ hero: hashSchema, logo: hashSchema.optional() }).strict(),
    styleTokenSetId: z.string().min(1).max(100),
    targetPresetIds: z.array(z.string().max(100)).min(1).max(100),
    allowedOperations: z
      .array(
        z.enum([
          'crop-photo',
          'choose-variant',
          'fit-text',
          'move-layer',
          'resize-layer',
          'reorder-layer',
        ]),
      )
      .max(6),
    blueprintEdits: z
      .array(
        z
          .object({
            targetId: z.string().min(1).max(100),
            baseRevisionId: z.string().min(1).max(100),
            layers: z
              .array(
                z
                  .object({
                    id: z.string().min(1).max(100),
                    x: z.number().finite(),
                    y: z.number().finite(),
                    width: z.number().finite().positive(),
                    height: z.number().finite().positive(),
                  })
                  .strict(),
              )
              .min(1)
              .max(50),
            layerOrder: z.array(z.string().min(1).max(100)).max(50).optional(),
          })
          .strict(),
      )
      .max(8)
      .optional(),
    explanation: z.string().max(2000),
    uncertainties: z.array(z.string().max(500)).max(10),
  })
  .strict();
export function validatePlan(value, context) {
  const plan = planSchema.parse(value);
  const allowed = new Set(context.assetIds);
  if (
    [...plan.inputAssetIds, ...Object.values(plan.roleBindings)].some((id) => !allowed.has(id)) ||
    plan.roleBindings.hero !== context.roleBindings.hero ||
    plan.roleBindings.logo !== context.roleBindings.logo ||
    plan.briefRevisionId !== context.briefRevisionId ||
    plan.copyRevisionId !== context.copyRevisionId ||
    plan.styleTokenSetId !== context.styleTokenSetId ||
    plan.variantPriority.some((id) => !context.variants.includes(id)) ||
    plan.targetPresetIds.length !== context.targetPresetIds.length ||
    new Set(plan.targetPresetIds).size !== plan.targetPresetIds.length ||
    plan.targetPresetIds.some((id) => !context.targetPresetIds.includes(id))
  )
    throw new Error('Planner changed a locked input or referenced an unauthorized resource.');
  const seen = new Set();
  for (const edit of plan.blueprintEdits || []) {
    const base = context.blueprints?.find((item) => item.targetId === edit.targetId);
    if (
      !base ||
      base.revisionId !== edit.baseRevisionId ||
      base.mode !== 'static' ||
      seen.has(edit.targetId)
    )
      throw new Error('Planner referenced an unavailable Blueprint revision.');
    seen.add(edit.targetId);
    const ids = base.layers.map((layer) => layer.id);
    if (
      new Set(edit.layers.map((layer) => layer.id)).size !== edit.layers.length ||
      edit.layers.some(
        (layer) =>
          !ids.includes(layer.id) ||
          layer.x < 0 ||
          layer.y < 0 ||
          layer.x + layer.width > base.width ||
          layer.y + layer.height > base.height,
      ) ||
      (edit.layerOrder &&
        (edit.layerOrder.length !== ids.length ||
          new Set(edit.layerOrder).size !== ids.length ||
          edit.layerOrder.some((id) => !ids.includes(id))))
    )
      throw new Error('Planner proposed invalid Blueprint geometry or layer order.');
  }
  return plan;
}
