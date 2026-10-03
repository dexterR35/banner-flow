import { validatePlan } from './contracts.js';
import { fingerprint } from './fingerprint.js';
import { getRecord, putRecord } from './store.js';
export async function visionCapabilities(signal) {
  const r = await fetch('/api/subjects/vision/capabilities', {
    signal: AbortSignal.any([AbortSignal.timeout(4000), ...(signal ? [signal] : [])]),
  });
  if (!r.ok) throw new Error('Optional local intelligence service is unavailable.');
  return r.json();
}
export async function requestVision(operation, payload, { signal } = {}) {
  const r = await fetch(`/api/subjects/vision/${operation}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.any([AbortSignal.timeout(600000), ...(signal ? [signal] : [])]),
  });
  const data = await r.json();
  if (!r.ok)
    throw new Error(typeof data.detail === 'string' ? data.detail : 'Local inference failed.');
  return data;
}
export async function imagePayload(blob, maxEdge = 1024) {
  const image = await createImageBitmap(blob);
  try {
    const scale = Math.min(1, maxEdge / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(image.width * scale);
    canvas.height = Math.round(image.height * scale);
    const c = canvas.getContext('2d');
    c.fillStyle = '#ffffff';
    c.fillRect(0, 0, canvas.width, canvas.height);
    c.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png').split(',')[1];
  } finally {
    image.close();
  }
}
export async function draftPlan(
  context,
  image,
  { signal, request = requestVision, profileId = 'unavailable' } = {},
) {
  const key = `plan:${await fingerprint({ context, image, profileId, promptVersion: 3 })}`;
  const cached = await getRecord(key);
  if (cached) return { ...cached, cached: true };
  let error = '';
  for (let repair = 0; repair <= 1; repair++) {
    signal?.throwIfAborted();
    try {
      const result = await request(
        'plan',
        { context, image, repair: repair ? error : null },
        { signal },
      );
      signal?.throwIfAborted();
      const plan = validatePlan(
        typeof result.plan === 'string' ? JSON.parse(result.plan) : result.plan,
        context,
      );
      const accepted = { plan, provenance: result.provenance, repairs: repair };
      await putRecord(key, accepted);
      return accepted;
    } catch (e) {
      if (signal?.aborted) throw e;
      error = e.message;
      if (/unavailable|not installed|offline|RAM|another local/i.test(error)) break;
    }
  }
  return { plan: null, fallback: true, reason: error, repairs: 1 };
}
