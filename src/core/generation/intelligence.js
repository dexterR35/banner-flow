import { getAsset, imageFrom } from '../storage.js';
import { analyzeImage } from '../image-analysis.js';
import { extractPalette } from '../palette.js';
import { detectWithSam3 } from '../subject-service.js';
import { imagePayload, requestVision, visionCapabilities } from './planner.js';
import { fingerprint } from './fingerprint.js';
import { getRecord, saveAnalysis, saveEmbedding } from './store.js';
import { normalizeVector } from './search.js';
import { florenceReferenceSchema } from '../florence-reference.js';
export async function analyzeAsset(asset, component, { signal, query = 'person' } = {}) {
  if (asset.kind === 'font') throw new Error('Image analysis is not available for fonts.');
  const blob = await getAsset(asset.id);
  if (!blob) throw new Error('Original asset is missing.');
  const caps = ['embedding', 'ocr', 'florence'].includes(component)
    ? await visionCapabilities(signal)
    : null;
  const profileId =
    component === 'embedding'
      ? caps.siglip?.profileId
      : component === 'florence'
        ? caps.florence?.profileId
        : component === 'ocr'
          ? await fingerprint(caps.ocr)
          : component === 'subjects'
            ? 'sam3-boxes-v1'
            : 'opencv-palette-v1';
  if (component === 'embedding' && !caps.siglip?.ready)
    throw new Error(caps.siglip?.message || 'Semantic encoder unavailable.');
  if (component === 'ocr' && !caps.ocr?.ready)
    throw new Error('OCR unavailable. Filename and tags remain searchable.');
  if (component === 'florence' && !caps.florence?.ready)
    throw new Error(caps.florence?.message || 'Florence-2 is required for image analysis.');
  const id = await fingerprint({
    input: asset.id,
    component,
    profileId,
    ...(component === 'subjects' ? { query } : {}),
    version: 1,
  });
  const cached = await getRecord(
    component === 'embedding' ? `embedding:${profileId}:${asset.id}` : `analysis:${id}`,
  );
  if (cached) return { cached: true, result: cached };
  const base = {
    schemaVersion: 1,
    id,
    assetId: asset.id,
    inputHash: asset.id,
    component,
    profileId,
    createdAt: new Date().toISOString(),
    provenance: { coordinateSpace: 'normalized-oriented-source' },
    status: 'ready',
  };
  if (component === 'embedding') {
    const result = await requestVision(
      'embed',
      { image: await imagePayload(blob), profileId },
      { signal },
    );
    signal?.throwIfAborted();
    if (result.profileId !== profileId)
      throw new Error('PROFILE_MISMATCH: encoder changed during analysis.');
    await saveEmbedding({
      profileId,
      inputHash: asset.id,
      assetId: asset.id,
      vector: normalizeVector(result.vector),
      dimension: result.dimension,
    });
  } else if (component === 'florence') {
    const result = florenceReferenceSchema.parse(
      await requestVision(
        'reference',
        { image: await imagePayload(blob, 1024), profileId },
        { signal },
      ),
    );
    signal?.throwIfAborted();
    if (result.profileId !== profileId || result.engine !== 'florence2')
      throw new Error('PROFILE_MISMATCH: Florence changed during analysis.');
    await saveAnalysis({
      ...base,
      ocr: result.textRegions.map((region) => ({
        text: region.text,
        box: region.box,
        confidence: 1,
      })),
      provenance: { ...result.provenance, objects: result.objects },
      status: result.textRegions.length || result.objects.length ? 'ready' : 'no_match',
    });
  } else if (component === 'ocr') {
    const result = await requestVision(
      'ocr',
      { image: await imagePayload(blob, 2048), language: 'eng' },
      { signal },
    );
    signal?.throwIfAborted();
    await saveAnalysis({
      ...base,
      ocr: result.ocr,
      provenance: result.provenance,
      status: result.ocr.length ? 'ready' : 'no_match',
    });
  } else if (component === 'subjects') {
    const result = await detectWithSam3(blob, query, signal);
    signal?.throwIfAborted();
    await saveAnalysis({
      ...base,
      subjects: result.map((r) => ({ id: r.id, label: r.label, box: r.box, score: r.score })),
      status: result.length ? 'ready' : 'no_match',
    });
  } else {
    const url = URL.createObjectURL(blob);
    try {
      const image = await imageFrom(url),
        info = await analyzeImage(image),
        canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 64;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(image, 0, 0, 64, 64);
      signal?.throwIfAborted();
      await saveAnalysis({
        ...base,
        visual: {
          palette: extractPalette(ctx.getImageData(0, 0, 64, 64).data).map((c) => c.color),
          luminance: info.luminance,
          edgeVariance: info.edgeVariance,
        },
        provenance: { ...base.provenance, engine: info.engine, palette: 'rgb-64x64-v1' },
      });
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  return {
    cached: false,
    result: await getRecord(
      component === 'embedding' ? `embedding:${profileId}:${asset.id}` : `analysis:${id}`,
    ),
  };
}
