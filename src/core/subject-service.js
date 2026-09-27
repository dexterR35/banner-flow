import { z } from 'zod';
import { normalizeDetections, subjectQuery } from './subject-data.js';

const healthSchema = z.object({
  service: z.literal('bannerflow-sam3'),
  schemaVersion: z.literal(1),
  ready: z.boolean(),
  state: z.string(),
  loaded: z.boolean(),
  device: z.string(),
  backend: z.enum(['native', 'transformers']).optional(),
  note: z.string().max(300).optional(),
  issues: z.array(z.object({ code: z.string(), message: z.string() })).max(20),
});
const detectionSchema = z.object({
  service: z.literal('bannerflow-sam3'),
  schemaVersion: z.literal(1),
  engine: z.literal('sam3'),
  detections: z
    .array(
      z.object({
        label: z.string().max(160),
        score: z.number().min(0).max(1),
        box: z.object({ xmin: z.number(), ymin: z.number(), xmax: z.number(), ymax: z.number() }),
      }),
    )
    .max(30),
});
export async function subjectServiceStatus(signal) {
  const response = await fetch('/api/subjects/health', {
    signal: AbortSignal.any([AbortSignal.timeout(4000), ...(signal ? [signal] : [])]),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error('SAM 3 local service is offline.');
  return healthSchema.parse(await response.json());
}
function pause(signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    const abort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, 1000);
    signal.addEventListener('abort', abort, { once: true });
  });
}

export async function detectWithSam3(blob, query, signal, onProgress = () => {}) {
  const requestSignal = AbortSignal.any([
    AbortSignal.timeout(180_000),
    ...(signal ? [signal] : []),
  ]);
  let response;
  while (true) {
    response = await fetch(
      `/api/subjects/detect?query=${encodeURIComponent(subjectQuery(query))}`,
      {
        method: 'POST',
        headers: { 'Content-Type': blob.type },
        body: blob,
        signal: requestSignal,
      },
    );
    if (response.status !== 429) break;
    await response.body?.cancel();
    onProgress('SAM 3 is finishing another search. Waiting for your turn…');
    let status;
    do {
      await pause(requestSignal);
      status = await subjectServiceStatus(requestSignal);
      if (!status.ready) throw new Error('SAM 3 needs setup before searching.');
    } while (['busy', 'loading'].includes(status.state));
    onProgress('Finding subjects with SAM 3…');
  }
  if (!response.ok) throw new Error('SAM 3 could not complete this search.');
  return normalizeDetections(detectionSchema.parse(await response.json()).detections);
}
